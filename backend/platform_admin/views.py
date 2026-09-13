import logging
import secrets

from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Q
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import get_tokens, UserSerializer
from stores.models import Store
from core.pagination import parse_pagination
from orders.models import Order, STATUS_CHOICES
from orders.serializers import OrderSerializer, OrderDetailSerializer
from products.models import Product
from products.serializers import ProductSerializer

from .models import PlatformConfirmationAccount, PlatformConfirmateur, PlatformConfirmateurAssignment, PlatformOrderAssignment, PlatformAssignmentPermission, get_effective_platform_permissions
from .permissions import is_platform_admin, get_platform_confirmateur
from .impersonation import set_impersonation_cookie, clear_impersonation_cookie
from .serializers import (
    StoreListItemSerializer, StoreConfirmationSerializer,
    PlatformConfirmateurSerializer, PlatformConfirmateurInviteSerializer,
    PlatformAcceptInvitationSerializer, PlatformConfirmateurAssignmentSerializer,
)

logger = logging.getLogger(__name__)


def _forbidden():
    return Response({'detail': 'Accès réservé au superadmin.'}, status=403)


def _send_invite_email(confirmateur):
    link = f"{settings.FRONTEND_URL}/platform-admin/accept-invitation?token={confirmateur.invite_token}"
    try:
        send_mail(
            subject="Invitation à rejoindre l'équipe de confirmation MZSolutions",
            message=(
                f"Bonjour {confirmateur.first_name},\n\n"
                f"Vous avez été invité(e) à rejoindre l'équipe de confirmation MZSolutions.\n\n"
                f"Cliquez sur le lien ci-dessous pour activer votre compte :\n{link}\n\n"
                f"Ce lien expire dans 48h.\n\n"
                f"L'équipe MZSolutions"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[confirmateur.email],
            fail_silently=False,
        )
    except Exception as e:
        logger.error(f"Platform confirmateur invite email failed: {e}")


# ─── Boutiques & activation du service ──────────────────────────────────────

class PlatformStoreListView(APIView):
    """Liste TOUTES les boutiques MZSolutions, avec leur état de service de
    confirmation s'il a déjà été activé une fois. Superadmin uniquement."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        base_qs = Store.objects.select_related('owner', 'platform_confirmation_account')

        # Stats calculées sur TOUTES les boutiques (avant filtre/pagination) —
        # alimentent les StatCards du frontend, jamais tronquées par la page courante.
        stats = {
            'total':   base_qs.count(),
            'active':  base_qs.filter(platform_confirmation_account__is_active=True).count(),
            'replace': base_qs.filter(platform_confirmation_account__is_active=True, platform_confirmation_account__mode='replace').count(),
            'augment': base_qs.filter(platform_confirmation_account__is_active=True, platform_confirmation_account__mode='augment').count(),
        }

        qs = base_qs.order_by('name')
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(owner__email__icontains=search))

        # `active_only=1` conservé pour compatibilité (utilisé par la page
        # Confirmateurs pour ne lister que les boutiques assignables) — `service`
        # est le filtre 3 états (tous/actif/inactif) exposé par cette page.
        only_active = request.query_params.get('active_only')
        if only_active in ('1', 'true', 'True'):
            qs = qs.filter(platform_confirmation_account__is_active=True)

        service = request.query_params.get('service')
        if service == 'active':
            qs = qs.filter(platform_confirmation_account__is_active=True)
        elif service == 'inactive':
            qs = qs.filter(Q(platform_confirmation_account__isnull=True) | Q(platform_confirmation_account__is_active=False))

        mode = request.query_params.get('mode')
        if mode in ('replace', 'augment'):
            qs = qs.filter(platform_confirmation_account__is_active=True, platform_confirmation_account__mode=mode)

        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]
        return Response({
            'count': total, 'page': page, 'per_page': per_page, 'stats': stats,
            'results': StoreListItemSerializer(qs, many=True).data,
        })


class PlatformStoreToggleView(APIView):
    """Active/désactive le service de confirmation pour une boutique, et
    règle son mode (replace/augment) — décision unilatérale du superadmin,
    pas du vendeur de la boutique."""
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id):
        if not is_platform_admin(request):
            return _forbidden()
        try:
            store = Store.objects.get(pk=store_id)
        except Store.DoesNotExist:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        account, _ = PlatformConfirmationAccount.objects.get_or_create(store=store)
        was_active = account.is_active

        if 'is_active' in request.data:
            new_active = bool(request.data.get('is_active'))
            account.is_active = new_active
            if new_active and not was_active:
                account.activated_at = timezone.now()
        if 'mode' in request.data:
            mode = request.data.get('mode')
            if mode not in dict(PlatformConfirmationAccount._meta.get_field('mode').choices):
                return Response({'detail': 'Mode invalide.'}, status=400)
            account.mode = mode
        if 'note' in request.data:
            account.note = request.data.get('note') or ''

        account.save()
        return Response(StoreConfirmationSerializer(account).data)


class PlatformStoreBulkToggleView(APIView):
    """Active/désactive le service en masse sur une sélection de boutiques
    (action groupée) — même effet que PlatformStoreToggleView répété, mais en
    une seule requête pour l'UI (checkbox + barre d'actions, comme OrdersPage.jsx)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        store_ids = request.data.get('store_ids') or []
        if not store_ids:
            return Response({'detail': 'store_ids requis.'}, status=400)
        new_active = bool(request.data.get('is_active'))

        updated = 0
        for store in Store.objects.filter(pk__in=store_ids):
            account, _ = PlatformConfirmationAccount.objects.get_or_create(store=store)
            was_active = account.is_active
            account.is_active = new_active
            if new_active and not was_active:
                account.activated_at = timezone.now()
            account.save(update_fields=['is_active', 'activated_at', 'updated_at'])
            updated += 1
        return Response({'updated': updated})


def _get_active_account_or_404(store_id):
    try:
        account = PlatformConfirmationAccount.objects.select_related('store').get(store_id=store_id)
    except PlatformConfirmationAccount.DoesNotExist:
        return None
    if not account.is_active:
        return None
    return account


class PlatformStoreOrdersView(APIView):
    """Lecture seule des commandes d'UNE boutique — uniquement si le service
    de confirmation est actif pour elle (jamais pour une boutique désactivée,
    même en tapant l'URL directement)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, store_id):
        if not is_platform_admin(request):
            return _forbidden()
        account = _get_active_account_or_404(store_id)
        if not account:
            return Response({'detail': "Boutique introuvable ou service de confirmation inactif."}, status=404)

        qs = Order.objects.filter(store=account.store).select_related('carrier').prefetch_related('items').order_by('-created_at')
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        search = request.query_params.get('search', '').strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(Q(first_name__icontains=search) | Q(last_name__icontains=search) | Q(phone__icontains=search))

        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]
        return Response({
            'count': total, 'page': page, 'per_page': per_page,
            'results': OrderSerializer(qs, many=True).data,
        })


class PlatformStoreProductsView(APIView):
    """Lecture seule du catalogue d'UNE boutique — même garde d'activation
    que PlatformStoreOrdersView."""
    permission_classes = [IsAuthenticated]

    def get(self, request, store_id):
        if not is_platform_admin(request):
            return _forbidden()
        account = _get_active_account_or_404(store_id)
        if not account:
            return Response({'detail': "Boutique introuvable ou service de confirmation inactif."}, status=404)

        qs = Product.objects.filter(store=account.store).order_by('-created_at')
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(name__icontains=search)

        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]
        return Response({
            'count': total, 'page': page, 'per_page': per_page,
            'results': ProductSerializer(qs, many=True, context={'request': request}).data,
        })


# ─── Confirmateurs du superadmin ────────────────────────────────────────────

class PlatformConfirmateurListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        qs = PlatformConfirmateur.objects.all().order_by('first_name', 'last_name')
        is_active = request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active in ('1', 'true', 'True'))
        return Response(PlatformConfirmateurSerializer(qs, many=True).data)

    def post(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        serializer = PlatformConfirmateurInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        confirmateur = PlatformConfirmateur.objects.create(
            first_name=d['first_name'], last_name=d['last_name'],
            email=d['email'], phone=d.get('phone', ''),
        )
        _send_invite_email(confirmateur)
        return Response(PlatformConfirmateurSerializer(confirmateur).data, status=201)


class PlatformConfirmateurDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        if not is_platform_admin(request):
            return _forbidden()
        try:
            confirmateur = PlatformConfirmateur.objects.get(pk=pk)
        except PlatformConfirmateur.DoesNotExist:
            return Response({'detail': 'Confirmateur introuvable.'}, status=404)
        serializer = PlatformConfirmateurSerializer(confirmateur, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        """Désactive (interrupteur global) plutôt que de supprimer — cohérent
        avec team.TeamMemberDetailView.delete, garde l'historique des
        assignations intact."""
        if not is_platform_admin(request):
            return _forbidden()
        try:
            confirmateur = PlatformConfirmateur.objects.get(pk=pk)
        except PlatformConfirmateur.DoesNotExist:
            return Response({'detail': 'Confirmateur introuvable.'}, status=404)
        confirmateur.is_active = False
        confirmateur.save(update_fields=['is_active'])
        return Response(status=204)


class PlatformConfirmateurResendInviteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_platform_admin(request):
            return _forbidden()
        try:
            confirmateur = PlatformConfirmateur.objects.get(pk=pk, user__isnull=True)
        except PlatformConfirmateur.DoesNotExist:
            return Response({'detail': 'Confirmateur introuvable ou déjà activé.'}, status=404)
        confirmateur.invite_token = secrets.token_urlsafe(32)
        confirmateur.invited_at = timezone.now()
        confirmateur.save(update_fields=['invite_token', 'invited_at'])
        _send_invite_email(confirmateur)
        return Response(PlatformConfirmateurSerializer(confirmateur).data)


class PlatformAcceptInvitationView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = 'invitation'

    def get(self, request):
        token = request.query_params.get('token', '')
        try:
            confirmateur = PlatformConfirmateur.objects.get(invite_token=token, user__isnull=True)
        except PlatformConfirmateur.DoesNotExist:
            return Response({'detail': 'Lien invalide ou déjà utilisé.'}, status=400)
        if confirmateur.invite_expired:
            return Response({'detail': "Ce lien d'invitation a expiré (48h). Demandez au superadmin de le renvoyer."}, status=400)
        return Response({
            'first_name': confirmateur.first_name,
            'last_name':  confirmateur.last_name,
            'email':      confirmateur.email,
        })

    def post(self, request):
        serializer = PlatformAcceptInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        confirmateur = serializer.save()
        return Response({
            'detail': 'Compte activé avec succès.',
            'user': UserSerializer(confirmateur.user).data,
            **get_tokens(confirmateur.user),
        })


# ─── Assignation confirmateur ↔ boutique ────────────────────────────────────

class PlatformConfirmateurAssignmentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        qs = PlatformConfirmateurAssignment.objects.select_related('confirmateur', 'account__store')
        account_id = request.query_params.get('account')
        if account_id:
            qs = qs.filter(account_id=account_id)
        confirmateur_id = request.query_params.get('confirmateur')
        if confirmateur_id:
            qs = qs.filter(confirmateur_id=confirmateur_id)
        return Response(PlatformConfirmateurAssignmentSerializer(qs, many=True).data)

    def post(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        confirmateur_id = request.data.get('confirmateur')
        account_id = request.data.get('account')
        if not confirmateur_id or not account_id:
            return Response({'detail': 'confirmateur et account sont requis.'}, status=400)
        try:
            confirmateur = PlatformConfirmateur.objects.get(pk=confirmateur_id)
            account = PlatformConfirmationAccount.objects.get(pk=account_id)
        except (PlatformConfirmateur.DoesNotExist, PlatformConfirmationAccount.DoesNotExist):
            return Response({'detail': 'Confirmateur ou boutique introuvable.'}, status=404)

        assignment, _ = PlatformConfirmateurAssignment.objects.update_or_create(
            confirmateur=confirmateur, account=account,
            defaults={'is_active': bool(request.data.get('is_active', True))},
        )
        return Response(PlatformConfirmateurAssignmentSerializer(assignment).data, status=201)


class PlatformConfirmateurAssignmentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        if not is_platform_admin(request):
            return _forbidden()
        try:
            assignment = PlatformConfirmateurAssignment.objects.get(pk=pk)
        except PlatformConfirmateurAssignment.DoesNotExist:
            return Response({'detail': 'Assignation introuvable.'}, status=404)
        if 'is_active' in request.data:
            assignment.is_active = bool(request.data.get('is_active'))
            assignment.save(update_fields=['is_active'])
        return Response(PlatformConfirmateurAssignmentSerializer(assignment).data)

    def delete(self, request, pk):
        if not is_platform_admin(request):
            return _forbidden()
        try:
            assignment = PlatformConfirmateurAssignment.objects.get(pk=pk)
        except PlatformConfirmateurAssignment.DoesNotExist:
            return Response({'detail': 'Assignation introuvable.'}, status=404)
        assignment.delete()
        return Response(status=204)


# ─── File de travail du confirmateur (V2) ───────────────────────────────────

def _confirmateur_forbidden():
    return Response({'detail': 'Réservé aux confirmateurs du service de confirmation.'}, status=403)


class MyAssignmentsListView(APIView):
    """Boutiques assignées AU confirmateur connecté — utilisée pour afficher
    le bouton "Gérer cette boutique" côté confirmateur (mode impersonation),
    distincte de PlatformConfirmateurAssignmentListCreateView (superadmin,
    toutes les assignations)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        confirmateur = get_platform_confirmateur(request)
        if not confirmateur:
            return _confirmateur_forbidden()
        qs = PlatformConfirmateurAssignment.objects.filter(
            confirmateur=confirmateur, is_active=True, account__is_active=True,
        ).select_related('account__store')
        return Response(PlatformConfirmateurAssignmentSerializer(qs, many=True).data)


class MyQueueListView(APIView):
    """Commandes assignées AU confirmateur connecté (PlatformOrderAssignment),
    toutes boutiques confondues — jamais les commandes d'une boutique qui ne
    lui a pas été assignée, même s'il a accès au compte."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        confirmateur = get_platform_confirmateur(request)
        if not confirmateur:
            return _confirmateur_forbidden()

        qs = (Order.objects
              .filter(platform_assignment__confirmateur=confirmateur)
              .select_related('store', 'carrier')
              .order_by('-created_at'))
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        from core.pagination import parse_pagination
        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]
        results = OrderSerializer(qs, many=True).data
        # store_name ajouté après coup — un confirmateur travaille plusieurs
        # boutiques à la fois, contrairement à OrdersPage.jsx (dashboard
        # boutique classique) où la boutique est implicite.
        by_id = {o.id: o.store.name for o in qs}
        for row in results:
            row['store_name'] = by_id.get(row['id'])
        return Response({'count': total, 'page': page, 'per_page': per_page, 'results': results})


class MyQueueOrderStatusView(APIView):
    """Change le statut d'UNE commande de la file du confirmateur connecté —
    réutilise orders.views._transition_order_status pour produire exactement
    les mêmes effets de bord qu'un changement depuis le dashboard boutique
    (historique, stock, expédition, commission, webhooks)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, order_id):
        confirmateur = get_platform_confirmateur(request)
        if not confirmateur:
            return _confirmateur_forbidden()
        try:
            assignment = PlatformOrderAssignment.objects.select_related('order__store').get(
                order_id=order_id, confirmateur=confirmateur
            )
        except PlatformOrderAssignment.DoesNotExist:
            return Response({'detail': 'Commande introuvable ou non assignée.'}, status=404)

        order = assignment.order
        new_status = request.data.get('status')
        valid = [s[0] for s in STATUS_CHOICES]
        if new_status not in valid:
            return Response({'detail': f'Statut invalide. Valeurs : {valid}'}, status=400)

        from orders.views import _transition_order_status, activate_scheduled_order
        if order.status == 'scheduled' and new_status != 'scheduled':
            activate_scheduled_order(order.store, order, changed_by=request.user)
            order.refresh_from_db()

        carrier_warning = _transition_order_status(
            order.store, order, new_status, changed_by=request.user,
            note=request.data.get('note', ''), carrier_id=request.data.get('carrier_id'),
        )
        data = OrderDetailSerializer(order).data
        if carrier_warning:
            data['carrier_warning'] = carrier_warning
        return Response(data)


# ─── Mode "Gérer cette boutique" (impersonation) ────────────────────────────

class PlatformStoreEnterView(APIView):
    """Superadmin uniquement — entre dans le VRAI dashboard boutique
    (/dashboard/*) avec accès total, comme si owner. Réservé aux boutiques
    ayant activé le service (cohérent avec le reste de l'espace superadmin —
    jamais une boutique qui n'a pas souscrit)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id):
        if not is_platform_admin(request):
            return _forbidden()
        try:
            account = PlatformConfirmationAccount.objects.select_related('store').get(store_id=store_id, is_active=True)
        except PlatformConfirmationAccount.DoesNotExist:
            return Response({'detail': "Boutique introuvable ou service de confirmation inactif."}, status=404)
        response = Response({'detail': 'ok', 'store_name': account.store.name})
        set_impersonation_cookie(response, account.store.id)
        return response


class PlatformConfirmateurEnterView(APIView):
    """Confirmateur du service — entre dans le dashboard réel d'UNE de ses
    boutiques assignées, avec les permissions accordées par le superadmin
    pour cette assignation précise (PlatformAssignmentPermission)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, assignment_id):
        confirmateur = get_platform_confirmateur(request)
        if not confirmateur:
            return _confirmateur_forbidden()
        try:
            assignment = PlatformConfirmateurAssignment.objects.select_related('account__store').get(
                pk=assignment_id, confirmateur=confirmateur, is_active=True, account__is_active=True,
            )
        except PlatformConfirmateurAssignment.DoesNotExist:
            return Response({'detail': 'Assignation introuvable ou inactive.'}, status=404)
        response = Response({'detail': 'ok', 'store_name': assignment.account.store.name})
        set_impersonation_cookie(response, assignment.account.store.id)
        return response


class PlatformImpersonationLeaveView(APIView):
    """Quitte le mode "Gérer cette boutique" — superadmin ou confirmateur,
    même endpoint (efface simplement le cookie, jamais de vérification de
    rôle nécessaire pour EN SORTIR)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        response = Response({'detail': 'ok'})
        clear_impersonation_cookie(response)
        return response


# ─── Permissions par assignation (réutilise team.PERMISSION_CATALOG) ───────

class PlatformAssignmentPermissionsView(APIView):
    """GET catalogue complet + valeurs effectives + is_custom ; POST upsert
    un toggle ; DELETE réinitialise (retire l'override, retombe à False —
    pas de "défaut du rôle" ici, contrairement à team.TeamMemberPermission).
    Superadmin uniquement."""
    permission_classes = [IsAuthenticated]

    def _get_assignment(self, request, pk):
        if not is_platform_admin(request):
            return None, _forbidden()
        try:
            return PlatformConfirmateurAssignment.objects.select_related('confirmateur', 'account__store').get(pk=pk), None
        except PlatformConfirmateurAssignment.DoesNotExist:
            return None, Response({'detail': 'Assignation introuvable.'}, status=404)

    def get(self, request, pk):
        assignment, err = self._get_assignment(request, pk)
        if err:
            return err
        from team.models import PERMISSION_CATALOG, PERMISSION_CATEGORIES
        effective = get_effective_platform_permissions(assignment)
        custom_keys = set(assignment.permission_overrides.values_list('permission', flat=True))
        return Response({
            'catalog': [
                {'key': k, 'label': label, 'enabled': effective.get(k, False), 'is_custom': k in custom_keys,
                 'category': PERMISSION_CATEGORIES.get(k, ('Autres', 'Autres'))[0],
                 'subcategory': PERMISSION_CATEGORIES.get(k, ('Autres', 'Autres'))[1]}
                for k, label in PERMISSION_CATALOG
            ],
        })

    def post(self, request, pk):
        assignment, err = self._get_assignment(request, pk)
        if err:
            return err
        from team.models import PERMISSION_CATALOG
        permission = request.data.get('permission')
        enabled = bool(request.data.get('enabled'))
        if permission not in dict(PERMISSION_CATALOG):
            return Response({'detail': 'Permission inconnue.'}, status=400)
        PlatformAssignmentPermission.objects.update_or_create(
            assignment=assignment, permission=permission, defaults={'enabled': enabled},
        )
        return Response({'permissions': get_effective_platform_permissions(assignment)})

    def delete(self, request, pk):
        assignment, err = self._get_assignment(request, pk)
        if err:
            return err
        from team.models import PERMISSION_CATALOG
        permission = request.query_params.get('permission')
        if permission not in dict(PERMISSION_CATALOG):
            return Response({'detail': 'Permission inconnue.'}, status=400)
        PlatformAssignmentPermission.objects.filter(assignment=assignment, permission=permission).delete()
        return Response({'permissions': get_effective_platform_permissions(assignment)})


# ─── Tableau de bord agrégé confirmateur (V4) ───────────────────────────────

NEEDS_ACTION_STATUSES = ['pending', 'no_answer_1', 'no_answer_2', 'no_answer_3']


class MyDashboardSummaryView(APIView):
    """Vue d'ensemble CROSS-BOUTIQUE pour un confirmateur du superadmin — pas
    besoin d'entrer dans chaque boutique (mode "Gérer cette boutique") pour
    savoir ce qu'il y a à traiter : commandes en attente de sa file, plus
    réclamations/échanges ouverts **des boutiques où il a la permission
    correspondante** (inbox_view/exchanges_view, via PlatformAssignmentPermission
    — jamais des données qu'il n'a pas le droit de voir)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        confirmateur = get_platform_confirmateur(request)
        if not confirmateur:
            return _confirmateur_forbidden()

        assignments = (
            PlatformConfirmateurAssignment.objects
            .filter(confirmateur=confirmateur, is_active=True, account__is_active=True)
            .select_related('account__store')
        )

        from inbox.models import Conversation
        from orders.models import ExchangeRequest

        stores_summary = []
        totals = {'pending_orders': 0, 'open_complaints': 0, 'open_exchanges': 0}
        for assignment in assignments:
            store = assignment.account.store
            perms = get_effective_platform_permissions(assignment)

            pending_orders = Order.objects.filter(
                platform_assignment__confirmateur=confirmateur,
                store=store, status__in=NEEDS_ACTION_STATUSES,
            ).count()

            open_complaints = None
            if perms.get('inbox_view'):
                open_complaints = Conversation.objects.filter(
                    store=store, status__in=['open', 'in_progress'],
                ).count()

            open_exchanges = None
            if perms.get('exchanges_view'):
                open_exchanges = ExchangeRequest.objects.filter(store=store, status='open').count()

            totals['pending_orders'] += pending_orders
            totals['open_complaints'] += open_complaints or 0
            totals['open_exchanges'] += open_exchanges or 0

            stores_summary.append({
                'assignment_id': assignment.id,
                'store_id': store.id,
                'store_name': store.name,
                'pending_orders': pending_orders,
                'open_complaints': open_complaints,   # None = permission non accordée sur cette boutique
                'open_exchanges': open_exchanges,
            })

        return Response({'stores': stores_summary, 'totals': totals})


# ─── Journal d'audit transversal (V4, superadmin uniquement) ───────────────

class PlatformAuditLogListView(APIView):
    """Journal d'audit à travers TOUTES les boutiques — réservé au superadmin.
    Réutilise audit.AuditLog tel quel (déjà correctement rempli pour les
    actions faites en mode "Gérer cette boutique", voir audit.utils.log_audit
    corrigé en V3) plutôt qu'un journal séparé."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()

        from audit.models import AuditLog
        from audit.serializers import AuditLogSerializer

        qs = AuditLog.objects.select_related('store', 'actor').order_by('-created_at')

        store_id = request.query_params.get('store')
        if store_id:
            qs = qs.filter(store_id=store_id)

        action = request.query_params.get('action')
        if action:
            qs = qs.filter(action=action)

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(actor_name__icontains=search) | Q(description__icontains=search) |
                Q(target_repr__icontains=search) | Q(store__name__icontains=search)
            )

        date_from = request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        date_to = request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        page, per_page = parse_pagination(request, default_per_page=25)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]

        results = []
        for entry in qs:
            row = AuditLogSerializer(entry).data
            row['store_name'] = entry.store.name if entry.store_id else None
            results.append(row)

        return Response({'count': total, 'page': page, 'per_page': per_page, 'results': results})
