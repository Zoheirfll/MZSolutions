from rest_framework.permissions import BasePermission, SAFE_METHODS
from rest_framework.response import Response


def get_store(request):
    try:
        return request.user.store
    except Exception:
        pass
    try:
        return request.user.team_membership.store
    except Exception:
        return None


def get_team_role(request):
    try:
        return request.user.team_membership.role
    except Exception:
        return None  # owner has no team_membership → full access


def is_owner_or_admin(request):
    role = get_team_role(request)
    return role in (None, 'admin')


def owner_or_admin_required(request):
    """Returns a 403 Response if user is not owner/admin, else None."""
    if not is_owner_or_admin(request):
        return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
    return None


def get_effective_permissions(request):
    """Permissions effectives de l'utilisateur pour sa boutique (Epic 7.5 +
    override par personne). Seul l'owner (role=None) a un accès total
    implicite non configurable ; admin/confirmateur/dropshipper passent par
    la cascade `TeamMemberPermission` > `RolePermission` > `DEFAULT_PERMISSIONS`.
    Ce système ne gate que la lecture — les actions d'écriture restent
    protégées séparément par `is_owner_or_admin` (inchangé)."""
    from team.models import get_effective_permissions as _effective, PERMISSION_CATALOG
    role = get_team_role(request)
    if role is None:
        return {key: True for key, _ in PERMISSION_CATALOG}
    store = get_store(request)
    if not store:
        return {key: False for key, _ in PERMISSION_CATALOG}
    member = getattr(request.user, 'team_membership', None)
    return _effective(store, role, member=member)


def has_permission(request, key):
    """True si l'utilisateur (via son rôle) a la permission `key`."""
    return get_effective_permissions(request).get(key, False)


class IsOwnerOrAdminForWrites(BasePermission):
    """
    Lecture : tout membre authentifié de la boutique.
    Écriture (POST/PUT/PATCH/DELETE) : owner ou admin uniquement.
    """
    message = 'Accès réservé au propriétaire ou administrateur.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return is_owner_or_admin(request)
