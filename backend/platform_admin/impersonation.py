"""Mode « Gérer cette boutique » — permet au superadmin (accès total) ou à un
confirmateur du service (accès selon PlatformAssignmentPermission) d'agir dans
le VRAI dashboard boutique (/dashboard/*), sans dupliquer aucune page. Résolu
côté serveur via un cookie signé porté sur chaque requête, consommé par
core.permissions (get_store/get_team_role/get_effective_permissions).

⚠️ Défense en profondeur : le cookie ne porte qu'un store_id. Pour un
confirmateur, l'accès est TOUJOURS revérifié en base à chaque requête (une
PlatformConfirmateurAssignment active doit exister) — le cookie seul ne
prouve jamais un droit d'accès, contrairement au JWT d'authentification."""
from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

IMPERSONATION_COOKIE = 'mz_impersonate_store'
IMPERSONATION_MAX_AGE = 60 * 60 * 12  # 12h — ré-affirmé à chaque "Gérer cette boutique", pas une session longue par défaut

_signer = TimestampSigner(salt='platform_admin.impersonation')


def set_impersonation_cookie(response, store_id):
    response.set_cookie(
        IMPERSONATION_COOKIE, _signer.sign(str(store_id)),
        max_age=IMPERSONATION_MAX_AGE, httponly=True,
        secure=settings.AUTH_COOKIE_SECURE, samesite=settings.AUTH_COOKIE_SAMESITE, path='/',
    )


def clear_impersonation_cookie(response):
    response.delete_cookie(IMPERSONATION_COOKIE, path='/')


def resolve_impersonation(request):
    """Renvoie {'store': Store, 'is_admin': bool, 'assignment': PlatformConfirmateurAssignment|None}
    si une session de gestion valide est en cours, sinon None. Jamais
    d'exception remontée — un cookie invalide/expiré/orphelin est traité
    comme absent."""
    user = getattr(request, 'user', None)
    if not (user and getattr(user, 'is_authenticated', False)):
        return None
    # `getattr` plutôt qu'un accès direct : certains appelants (ex: tests
    # unitaires de log_audit) passent un objet request minimal sans .COOKIES
    # — l'absence de cookie doit se comporter exactement comme "pas d'impersonation",
    # jamais lever une exception.
    raw = getattr(request, 'COOKIES', {}).get(IMPERSONATION_COOKIE)
    if not raw:
        return None
    try:
        store_id = _signer.unsign(raw, max_age=IMPERSONATION_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None

    from stores.models import Store
    try:
        store = Store.objects.get(pk=store_id)
    except (Store.DoesNotExist, ValueError, TypeError):
        return None

    if getattr(user, 'is_platform_admin', False):
        return {'store': store, 'is_admin': True, 'assignment': None}

    profile = getattr(user, 'platform_confirmateur_profile', None)
    if not profile or not profile.is_active:
        return None

    from .models import PlatformConfirmateurAssignment
    assignment = (
        PlatformConfirmateurAssignment.objects
        .filter(confirmateur=profile, account__store=store, is_active=True, account__is_active=True)
        .select_related('account')
        .first()
    )
    if not assignment:
        return None
    return {'store': store, 'is_admin': False, 'assignment': assignment}
