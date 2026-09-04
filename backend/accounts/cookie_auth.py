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
from rest_framework_simplejwt.authentication import JWTAuthentication


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
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
