import logging
import secrets

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import get_tokens, UserSerializer
from stores.models import Store
from core.pagination import parse_pagination
from orders.models import Order
from orders.serializers import OrderSerializer
from products.models import Product
from products.serializers import ProductSerializer

from .models import PlatformConfirmationAccount, PlatformConfirmateur, PlatformConfirmateurAssignment
from .permissions import is_platform_admin
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
        qs = Store.objects.select_related('owner', 'platform_confirmation_account').order_by('name')
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(name__icontains=search)
        only_active = request.query_params.get('active_only')
        if only_active in ('1', 'true', 'True'):
            qs = qs.filter(platform_confirmation_account__is_active=True)

        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]
        return Response({
            'count': total, 'page': page, 'per_page': per_page,
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
