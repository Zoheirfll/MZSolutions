from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import is_owner_or_admin, has_permission
from core.pagination import parse_pagination
from team.models import TeamMember
from .models import AuditLog, ACTION_CATALOG
from .serializers import AuditLogSerializer


def _get_store(request):
    try:
        return request.user.store
    except Exception:
        try:
            return request.user.team_membership.store
        except Exception:
            return None


class AuditLogListView(APIView):
    """Journal d'audit — owner/admin uniquement (donnée sensible : qui a fait
    quoi, y compris sur les actions d'autres admins). Filtres : acteur, type
    d'action, cible, période, recherche libre."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'audit_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        qs = AuditLog.objects.filter(store=store).select_related('actor')

        actor_id = request.query_params.get('actor')
        if actor_id:
            qs = qs.filter(actor_id=actor_id)

        action = request.query_params.get('action')
        if action:
            qs = qs.filter(action=action)

        target_type = request.query_params.get('target_type')
        if target_type:
            qs = qs.filter(target_type=target_type)

        date_from = request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        date_to = request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(actor_name__icontains=search) |
                Q(description__icontains=search) |
                Q(target_repr__icontains=search)
            )

        page, per_page = parse_pagination(request, default_per_page=25)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]

        return Response({
            'count': total, 'page': page, 'per_page': per_page,
            'results': AuditLogSerializer(qs, many=True).data,
        })


class AuditMetaView(APIView):
    """Peuple les filtres de la page Audit : catalogue d'actions rencontrées
    réellement dans les logs de cette boutique (pas tout ACTION_CATALOG,
    pour ne pas proposer des filtres vides) + liste des acteurs possibles
    (owner + membres d'équipe, actifs ou non — un log passé peut référencer
    un membre depuis désactivé)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'audit_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        catalog_dict = dict(ACTION_CATALOG)
        used_actions = list(
            AuditLog.objects.filter(store=store).values_list('action', flat=True).distinct()
        )
        actions = [{'key': a, 'label': catalog_dict.get(a, a)} for a in sorted(used_actions)]

        actors = [{'id': store.owner_id, 'name': f"{store.owner.first_name} {store.owner.last_name}".strip() or store.owner.email, 'role': 'owner'}]
        for m in store.team_members.filter(user__isnull=False).select_related('user'):
            actors.append({'id': m.user_id, 'name': f"{m.first_name} {m.last_name}".strip(), 'role': m.role})

        return Response({'actions': actions, 'actors': actors})
