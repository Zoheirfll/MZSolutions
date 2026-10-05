"""Utilisateurs et sessions (admin plateforme — phase 6) : tous les comptes de la
plateforme, historique de connexion, tentatives échouées, désactivation d'un utilisateur.
Niveau admin ; les comptes d'administration (plateforme / service) ne se gèrent QUE depuis
la page « Administrateurs » (superadmin), jamais ici."""
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from accounts.models import FailedLoginAttempt, LoginHistory, User
from core.pagination import parse_pagination

from .account_views import MAX_REASON, MIN_REASON, _revoke_tokens, log_platform_audit
from .permissions import is_platform_admin

ROLES = ('owner', 'team', 'platform', 'service', 'none')


def _forbidden():
    return Response({'detail': 'Accès réservé aux administrateurs de la plateforme.'}, status=403)


def _role(u):
    """Rôle principal affiché (un compte peut en cumuler plusieurs : on garde le plus « fort »)."""
    if u.is_platform_superadmin:
        return 'superadmin_platform'
    if u.is_platform_admin:
        return 'admin_platform'
    if u.is_service_admin:
        return 'service'
    if hasattr(u, 'store'):
        return 'owner'
    if hasattr(u, 'team_membership'):
        return 'team'
    return 'none'


def _store_of(u):
    if hasattr(u, 'store'):
        return u.store
    if hasattr(u, 'team_membership'):
        return u.team_membership.store
    return None


def _row(u):
    store = _store_of(u)
    return {
        'id': u.id, 'email': u.email, 'first_name': u.first_name, 'last_name': u.last_name,
        'role': _role(u), 'team_role': u.team_membership.role if hasattr(u, 'team_membership') else None,
        'store_id': store.id if store else None, 'store_name': store.name if store else None,
        'is_active': u.is_active, 'last_login': u.last_login, 'date_joined': u.date_joined,
    }


class PlatformUserListView(APIView):
    """`?search=&role=owner|team|platform|service|none&active=1|0&page=&per_page=`"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        qs = User.objects.select_related('store', 'team_membership', 'team_membership__store').order_by('-date_joined')
        params = request.query_params
        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(email__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search)
                           | Q(store__name__icontains=search))
        role = params.get('role')
        if role == 'owner':
            qs = qs.filter(store__isnull=False)
        elif role == 'team':
            qs = qs.filter(team_membership__isnull=False)
        elif role == 'platform':
            qs = qs.filter(Q(is_platform_admin=True) | Q(is_platform_superadmin=True))
        elif role == 'service':
            qs = qs.filter(is_service_admin=True)
        elif role == 'none':
            qs = qs.filter(store__isnull=True, team_membership__isnull=True, is_platform_admin=False,
                           is_platform_superadmin=False, is_service_admin=False)
        if params.get('active') in ('0', '1'):
            qs = qs.filter(is_active=params['active'] == '1')
        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        rows = [_row(u) for u in qs[(page - 1) * per_page: page * per_page]]
        return Response({'count': total, 'page': page, 'per_page': per_page, 'results': rows})


class PlatformUserDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not is_platform_admin(request):
            return _forbidden()
        u = User.objects.select_related('store', 'team_membership', 'team_membership__store').filter(pk=pk).first()
        if not u:
            return Response({'detail': 'Utilisateur introuvable.'}, status=404)
        now = timezone.now()
        since = now - timedelta(hours=24)
        sessions = OutstandingToken.objects.filter(user=u, expires_at__gt=now, blacklistedtoken__isnull=True).count()
        data = _row(u)
        data.update({
            'phone': u.phone, 'is_email_verified': u.is_email_verified,
            'login_history': [
                {'status': h.status, 'ip_address': h.ip_address, 'user_agent': h.user_agent, 'created_at': h.created_at}
                for h in LoginHistory.objects.filter(user=u)[:10]
            ],
            'failed_attempts_24h': FailedLoginAttempt.objects.filter(email=u.email.lower(), created_at__gte=since).count(),
            'active_sessions': sessions,
        })
        return Response(data)


def _target_user(request, pk):
    """Utilisateur ciblable par une action : jamais soi-même, jamais un compte d'administration."""
    if not is_platform_admin(request):
        return None, _forbidden()
    u = User.objects.filter(pk=pk).first()
    if not u:
        return None, Response({'detail': 'Utilisateur introuvable.'}, status=404)
    if u.pk == request.user.pk:
        return None, Response({'detail': 'Vous ne pouvez pas modifier votre propre compte.'}, status=400)
    if u.is_platform_admin or u.is_platform_superadmin or u.is_service_admin:
        return None, Response({'detail': 'Les comptes d\'administration se gèrent depuis « Administrateurs ».'}, status=400)
    return u, None


class PlatformUserDeactivateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        u, err = _target_user(request, pk)
        if err:
            return err
        reason = (request.data.get('reason') or '').strip()
        if not (MIN_REASON <= len(reason) <= MAX_REASON):
            return Response({'detail': f'Le motif est obligatoire ({MIN_REASON} à {MAX_REASON} caractères).'}, status=400)
        if not u.is_active:
            return Response({'detail': 'Cet utilisateur est déjà désactivé.'}, status=400)
        u.is_active = False
        u.save(update_fields=['is_active'])
        revoked = _revoke_tokens([u])
        log_platform_audit(request, 'platform.user_deactivated', store=_store_of(u), target=u,
                           description=f'Utilisateur désactivé — {reason}', metadata={'reason': reason, 'revoked_sessions': revoked})
        return Response({'detail': 'Utilisateur désactivé.', 'revoked': revoked})


class PlatformUserReactivateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        u, err = _target_user(request, pk)
        if err:
            return err
        if u.is_active:
            return Response({'detail': "Cet utilisateur n'est pas désactivé."}, status=400)
        u.is_active = True
        u.save(update_fields=['is_active'])
        log_platform_audit(request, 'platform.user_reactivated', store=_store_of(u), target=u, description='Utilisateur réactivé')
        return Response({'detail': 'Utilisateur réactivé.'})


class PlatformLoginAttemptListView(APIView):
    """Tentatives de connexion échouées (`?email=&ip=&reason=&date_from=&date_to=&page=`) + synthèse 24 h."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        qs = FailedLoginAttempt.objects.all()
        params = request.query_params
        if params.get('email'):
            qs = qs.filter(email__icontains=params['email'].strip().lower())
        if params.get('ip'):
            qs = qs.filter(ip_address=params['ip'].strip()) if _valid_ip(params['ip']) else qs.none()
        if params.get('reason') in dict(FailedLoginAttempt.REASON_CHOICES):
            qs = qs.filter(reason=params['reason'])
        if params.get('date_from'):
            qs = qs.filter(created_at__date__gte=params['date_from'])
        if params.get('date_to'):
            qs = qs.filter(created_at__date__lte=params['date_to'])

        since = timezone.now() - timedelta(hours=24)
        recent = FailedLoginAttempt.objects.filter(created_at__gte=since)
        top_ips = list(recent.exclude(ip_address__isnull=True).values('ip_address').annotate(n=Count('id')).order_by('-n')[:5])
        summary = {
            'failed_24h': recent.count(),
            'distinct_ips_24h': recent.exclude(ip_address__isnull=True).values('ip_address').distinct().count(),
            'top_ips': [{'ip_address': r['ip_address'], 'count': r['n']} for r in top_ips],
        }
        page, per_page = parse_pagination(request, default_per_page=25)
        total = qs.count()
        rows = [{'id': a.id, 'email': a.email, 'ip_address': a.ip_address, 'reason': a.reason, 'created_at': a.created_at}
                for a in qs[(page - 1) * per_page: page * per_page]]
        return Response({'count': total, 'page': page, 'per_page': per_page, 'summary': summary, 'results': rows})


def _valid_ip(value):
    import ipaddress
    try:
        ipaddress.ip_address(value.strip())
        return True
    except ValueError:
        return False
