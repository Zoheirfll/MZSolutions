"""Comptes & boutiques de la plateforme (admin plateforme — phase 2).

Liste/fiche de tous les vendeurs, suspension/réactivation avec motif obligatoire,
déconnexion forcée, réinitialisation de mot de passe par email (l'admin ne voit
ni ne choisit jamais un mot de passe) et gestion des administrateurs.
Niveau admin pour la modération ; niveau superadmin pour la gestion des admins.
"""
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from accounts.models import User
from accounts.views import token_generator
from audit.models import AuditLog
from core.pagination import parse_pagination
from stores.models import Store, SubscriptionPayment

from .permissions import is_platform_admin, is_platform_superadmin

logger = logging.getLogger(__name__)

STATES = ('trial', 'subscribed', 'expired', 'suspended')
MIN_REASON, MAX_REASON = 5, 300


def _forbidden(superadmin=False):
    who = 'au superadmin' if superadmin else 'aux administrateurs de la plateforme'
    return Response({'detail': f'Accès réservé {who}.'}, status=403)


def store_state(store, now=None):
    """État commercial d'une boutique : suspended | subscribed | trial | expired."""
    now = now or timezone.now()
    if not store.is_active:
        return 'suspended'
    quota = getattr(store, 'quota', None)
    if quota is None:
        return 'expired'
    if quota.plan_id and quota.period_end and quota.period_end > now:
        return 'subscribed'
    if quota.plan_id is None and quota.trial_ends_at > now:
        return 'trial'
    return 'expired'


def _filter_state(qs, state, now):
    if state == 'suspended':
        return qs.filter(is_active=False)
    active = qs.filter(is_active=True)
    subscribed = Q(quota__plan__isnull=False, quota__period_end__gt=now)
    trial = Q(quota__plan__isnull=True, quota__trial_ends_at__gt=now)
    if state == 'subscribed':
        return active.filter(subscribed)
    if state == 'trial':
        return active.filter(trial)
    if state == 'expired':
        return active.exclude(subscribed).exclude(trial)
    return qs


def log_platform_audit(request, action, store=None, description='', metadata=None, target=None):
    """Journal d'audit des actions de niveau plateforme. `store` peut être None
    (ex: gestion des admins). Best-effort : n'échoue jamais l'action appelante."""
    try:
        user = request.user
        level = 'platform_superadmin' if getattr(user, 'is_platform_superadmin', False) else 'platform_admin'
        return AuditLog.objects.create(
            store=store, actor=user,
            actor_name=(f'{user.first_name} {user.last_name}'.strip() or user.email)[:200],
            actor_role=level, action=action,
            target_type=target.__class__.__name__.lower() if target is not None else '',
            target_id=getattr(target, 'pk', None) if target is not None else None,
            target_repr=str(target)[:200] if target is not None else '',
            description=description, metadata=metadata or {},
        )
    except Exception:
        logger.exception('log_platform_audit failed for action=%s', action)
        return None


def _row(store, now):
    quota = getattr(store, 'quota', None)
    owner = store.owner
    return {
        'id': store.id, 'name': store.name, 'slug': store.slug,
        'owner_email': owner.email, 'owner_name': f'{owner.first_name} {owner.last_name}'.strip(),
        'created_at': store.created_at, 'is_active': store.is_active,
        'state': store_state(store, now),
        'plan_name': quota.plan.name if quota and quota.plan_id else None,
        'orders_used': quota.orders_used if quota else 0,
        'orders_limit': quota.orders_limit if quota else 0,
        'trial_ends_at': quota.trial_ends_at if quota else None,
        'period_end': quota.period_end if quota else None,
    }


class PlatformAccountListView(APIView):
    """Tous les vendeurs/boutiques de la plateforme (`?search=&state=&page=&per_page=`)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        now = timezone.now()
        qs = Store.objects.select_related('owner', 'quota', 'quota__plan').order_by('-created_at')
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(slug__icontains=search) | Q(owner__email__icontains=search))
        state = request.query_params.get('state', '')
        if state in STATES:
            qs = _filter_state(qs, state, now)
        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        rows = [_row(s, now) for s in qs[(page - 1) * per_page: page * per_page]]
        return Response({'count': total, 'page': page, 'per_page': per_page, 'results': rows})


def _get_store(store_id):
    return Store.objects.select_related('owner', 'quota', 'quota__plan').filter(pk=store_id).first()


class PlatformAccountDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, store_id):
        if not is_platform_admin(request):
            return _forbidden()
        store = _get_store(store_id)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        owner = store.owner
        quota = getattr(store, 'quota', None)
        data = _row(store, timezone.now())
        data.update({
            'phone': store.phone, 'email': store.email,
            'suspended_at': store.suspended_at, 'suspension_reason': store.suspension_reason,
            'owner': {
                'id': owner.id, 'email': owner.email, 'first_name': owner.first_name, 'last_name': owner.last_name,
                'phone': owner.phone, 'last_login': owner.last_login, 'date_joined': owner.date_joined,
            },
            'quota': {
                'orders_used': quota.orders_used, 'orders_limit': quota.orders_limit,
                'trial_ends_at': quota.trial_ends_at, 'period_end': quota.period_end,
                'plan': quota.plan.name if quota.plan_id else None, 'billing_cycle': quota.billing_cycle,
            } if quota else None,
            'counts': {
                'orders': store.orders.count(),
                'products': store.products.count(),
                'team_members': store.team_members.filter(is_active=True).count(),
            },
            'recent_payments': [
                {'id': p.id, 'amount': p.amount, 'status': p.status, 'plan': p.plan.name,
                 'billing_cycle': p.billing_cycle, 'created_at': p.created_at}
                for p in SubscriptionPayment.objects.filter(store=store).select_related('plan').order_by('-created_at')[:5]
            ],
        })
        return Response(data)


def _revoke_tokens(users):
    """Blackliste tous les refresh tokens encore valides des utilisateurs donnés.
    Le jeton d'accès déjà émis reste valable jusqu'à son expiration (courte) — pour
    une boutique suspendue, l'authentification refuse de toute façon la requête."""
    revoked = 0
    for token in OutstandingToken.objects.filter(user__in=users, blacklistedtoken__isnull=True):
        _, created = BlacklistedToken.objects.get_or_create(token=token)
        revoked += int(created)
    return revoked


def _store_users(store):
    ids = [store.owner_id] + list(store.team_members.filter(user__isnull=False).values_list('user_id', flat=True))
    return User.objects.filter(pk__in=ids)


class PlatformAccountSuspendView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, store_id):
        if not is_platform_admin(request):
            return _forbidden()
        store = _get_store(store_id)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        reason = (request.data.get('reason') or '').strip()
        if not (MIN_REASON <= len(reason) <= MAX_REASON):
            return Response({'detail': f'Le motif est obligatoire ({MIN_REASON} à {MAX_REASON} caractères).'}, status=400)
        if not store.is_active:
            return Response({'detail': 'Cette boutique est déjà suspendue.'}, status=400)
        store.is_active = False
        store.suspended_at = timezone.now()
        store.suspension_reason = reason
        store.save(update_fields=['is_active', 'suspended_at', 'suspension_reason'])
        revoked = _revoke_tokens(_store_users(store))
        log_platform_audit(request, 'platform.store_suspended', store=store, target=store,
                           description=f'Boutique suspendue — {reason}', metadata={'reason': reason, 'revoked_sessions': revoked})
        return Response({'detail': 'Boutique suspendue.', 'state': store_state(store), 'revoked': revoked})


class PlatformAccountReactivateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id):
        if not is_platform_admin(request):
            return _forbidden()
        store = _get_store(store_id)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        if store.is_active:
            return Response({'detail': "Cette boutique n'est pas suspendue."}, status=400)
        store.is_active = True
        store.suspended_at = None
        store.suspension_reason = ''
        store.save(update_fields=['is_active', 'suspended_at', 'suspension_reason'])
        log_platform_audit(request, 'platform.store_reactivated', store=store, target=store, description='Boutique réactivée')
        return Response({'detail': 'Boutique réactivée.', 'state': store_state(store)})


class PlatformAccountForceLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id):
        if not is_platform_admin(request):
            return _forbidden()
        store = _get_store(store_id)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        revoked = _revoke_tokens(_store_users(store))
        log_platform_audit(request, 'platform.force_logout', store=store, target=store,
                           description='Déconnexion forcée des sessions', metadata={'revoked_sessions': revoked})
        return Response({'detail': 'Sessions révoquées.', 'revoked': revoked})


def _password_link(user):
    """Lien à usage unique pour définir/réinitialiser le mot de passe."""
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    return f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token_generator.make_token(user)}"


def _send_password_link(user, subject, intro):
    link = _password_link(user)
    send_mail(
        subject=subject,
        message=f"Bonjour {user.first_name},\n\n{intro}\n{link}\n\nCe lien expire dans 1 heure.\n\nL'équipe MZSolutions",
        from_email=settings.DEFAULT_FROM_EMAIL, recipient_list=[user.email], fail_silently=True,
    )


class PlatformAccountResetPasswordView(APIView):
    """Envoie au propriétaire un lien de réinitialisation (jamais de mot de passe
    choisi ni affiché par l'admin)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id):
        if not is_platform_admin(request):
            return _forbidden()
        store = _get_store(store_id)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        _send_password_link(store.owner, 'MZSolutions — Réinitialisation de votre mot de passe',
                            "L'administration de la plateforme vous envoie ce lien pour réinitialiser votre mot de passe :")
        log_platform_audit(request, 'platform.password_reset_sent', store=store, target=store.owner,
                           description='Lien de réinitialisation envoyé au propriétaire')
        return Response({'detail': 'Lien de réinitialisation envoyé.'})


# ─── Gestion des administrateurs (superadmin) ──────────────────────────────

def _level(user):
    return 'superadmin' if user.is_platform_superadmin else 'admin'


def _admin_row(u):
    return {'id': u.id, 'email': u.email, 'first_name': u.first_name, 'last_name': u.last_name,
            'level': _level(u), 'is_active': u.is_active, 'last_login': u.last_login}


def _apply_level(user, level):
    user.is_platform_superadmin = level == 'superadmin'
    user.is_platform_admin = level == 'admin'


class PlatformAdminListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_superadmin(request):
            return _forbidden(True)
        qs = User.objects.filter(Q(is_platform_admin=True) | Q(is_platform_superadmin=True)).order_by('email')
        return Response({'count': qs.count(), 'results': [_admin_row(u) for u in qs]})

    def post(self, request):
        if not is_platform_superadmin(request):
            return _forbidden(True)
        email = (request.data.get('email') or '').strip().lower()
        level = request.data.get('level')
        first = (request.data.get('first_name') or '').strip()
        last = (request.data.get('last_name') or '').strip()
        if not email or '@' not in email or level not in ('admin', 'superadmin'):
            return Response({'detail': 'Email valide et niveau (admin ou superadmin) requis.'}, status=400)
        if User.objects.filter(email__iexact=email).exists():
            return Response({'detail': 'Un compte existe déjà avec cet email.'}, status=409)
        user = User.objects.create_user(email=email, password=None, first_name=first, last_name=last,
                                        is_active=True, is_email_verified=True)
        _apply_level(user, level)
        user.save(update_fields=['is_platform_admin', 'is_platform_superadmin'])
        _send_password_link(user, 'MZSolutions — Invitation administrateur',
                            "Vous avez été ajouté(e) comme administrateur de la plateforme. Définissez votre mot de passe :")
        log_platform_audit(request, 'platform.admin_created', target=user, description=f'Administrateur créé ({level})',
                           metadata={'email': email, 'level': level})
        # Le lien est AUSSI renvoyé au superadmin (seul à atteindre cette route) : si l'adresse
        # saisie ne reçoit pas de courrier, il peut le transmettre lui-même. Usage unique.
        return Response({**_admin_row(user), 'activation_link': _password_link(user)}, status=201)


class PlatformAdminDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _target(self, request, pk):
        if not is_platform_superadmin(request):
            return None, _forbidden(True)
        user = User.objects.filter(Q(is_platform_admin=True) | Q(is_platform_superadmin=True), pk=pk).first()
        if not user:
            return None, Response({'detail': 'Administrateur introuvable.'}, status=404)
        if user.pk == request.user.pk:
            return None, Response({'detail': 'Vous ne pouvez pas modifier votre propre compte.'}, status=400)
        return user, None

    def put(self, request, pk):
        user, err = self._target(request, pk)
        if err:
            return err
        level = request.data.get('level')
        if level not in ('admin', 'superadmin'):
            return Response({'detail': 'Niveau invalide.'}, status=400)
        if user.is_platform_superadmin and level == 'admin' and not self._other_superadmin(user):
            return Response({'detail': 'Impossible de rétrograder le dernier superadmin.'}, status=400)
        before = _level(user)
        _apply_level(user, level)
        user.save(update_fields=['is_platform_admin', 'is_platform_superadmin'])
        log_platform_audit(request, 'platform.admin_level_changed', target=user,
                           description=f'Niveau changé de {before} à {level}', metadata={'before': before, 'after': level})
        return Response(_admin_row(user))

    def delete(self, request, pk):
        """Retire l'accès admin (le compte lui-même n'est jamais supprimé)."""
        user, err = self._target(request, pk)
        if err:
            return err
        if user.is_platform_superadmin and not self._other_superadmin(user):
            return Response({'detail': 'Impossible de retirer le dernier superadmin.'}, status=400)
        before = _level(user)
        user.is_platform_admin = False
        user.is_platform_superadmin = False
        user.save(update_fields=['is_platform_admin', 'is_platform_superadmin'])
        revoked = _revoke_tokens([user])
        log_platform_audit(request, 'platform.admin_revoked', target=user, description=f'Accès administrateur retiré ({before})',
                           metadata={'level': before, 'revoked_sessions': revoked})
        return Response({'detail': 'Accès retiré.'})

    @staticmethod
    def _other_superadmin(user):
        return User.objects.filter(is_platform_superadmin=True, is_active=True).exclude(pk=user.pk).exists()
