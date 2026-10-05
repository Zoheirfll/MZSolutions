"""Authentification JWT via cookies httpOnly (TBD Epic 8.6 — migration
localStorage). Les tokens ne sont plus jamais lisibles par du JavaScript côté
navigateur : un script XSS ne peut donc plus les voler (le vrai vecteur
d'exploitation, une XSS stockée sur `StorefrontPagePage.jsx`, a déjà été
corrigé — voir CLAUDE.md section Sécurité — mais cette migration ajoute une
défense en profondeur pour tout futur XSS qui pourrait apparaître).

Mode dual : le header `Authorization: Bearer <token>` reste accepté en
priorité (clients API non-navigateur, tests backend qui construisent leurs
propres tokens — `core/test_utils.py::auth_client`) ; le cookie n'est
consulté que si aucun header n'est fourni, ce qui couvre le navigateur."""
from django.conf import settings
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication


class StoreSuspended(PermissionDenied):
    default_code = 'store_suspended'


class ReadOnlyViewing(PermissionDenied):
    default_code = 'read_only'


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = self._authenticate(request)
        if result is not None:
            # Boutique suspendue par l'admin plateforme : toute requête du vendeur
            # ou de son équipe est refusée (403), y compris avec un jeton encore
            # valide — la suspension prend effet immédiatement.
            from stores.suspension import suspended_store_for_user, suspension_message
            store = suspended_store_for_user(result[0])
            if store is not None:
                raise StoreSuspended(detail=suspension_message(store), code='store_suspended')
            self._enforce_read_only(request, result[0])
        return result

    # Chemins qui restent utilisables pendant une consultation en lecture seule : l'administration
    # elle-même (quitter la consultation, actions d'admin) et l'authentification.
    READ_ONLY_ALLOWED_PREFIXES = ('/api/platform-admin/', '/api/auth/', '/api/token/')

    @classmethod
    def _enforce_read_only(cls, request, user):
        """Pendant une consultation en lecture seule (administration plateforme), toute écriture
        sur le dashboard d'une boutique est REFUSÉE par le serveur (403 `read_only`)."""
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return
        if not (getattr(user, 'is_platform_admin', False) or getattr(user, 'is_platform_superadmin', False)):
            return
        if request.path.startswith(cls.READ_ONLY_ALLOWED_PREFIXES):
            return
        from platform_admin.impersonation import view_store_id
        if view_store_id(request) is not None:
            raise ReadOnlyViewing(detail='Mode lecture seule : modification impossible.', code='read_only')

    def _authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            return super().authenticate(request)

        raw_token = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)
        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token


def set_auth_cookies(response, access=None, refresh=None):
    """Pose les cookies httpOnly sur la réponse. `access`/`refresh` sont les
    tokens JWT sérialisés (str) — jamais renvoyés dans le corps JSON."""
    from rest_framework_simplejwt.settings import api_settings as jwt_settings

    common = dict(
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path='/',
    )
    if access is not None:
        response.set_cookie(
            settings.AUTH_COOKIE_ACCESS, str(access),
            max_age=int(jwt_settings.ACCESS_TOKEN_LIFETIME.total_seconds()),
            **common,
        )
    if refresh is not None:
        response.set_cookie(
            settings.AUTH_COOKIE_REFRESH, str(refresh),
            max_age=int(jwt_settings.REFRESH_TOKEN_LIFETIME.total_seconds()),
            **common,
        )


def clear_auth_cookies(response):
    response.delete_cookie(settings.AUTH_COOKIE_ACCESS, path='/')
    response.delete_cookie(settings.AUTH_COOKIE_REFRESH, path='/')
