"""Middlewares de l'admin plateforme (phase 4)."""
import hashlib
import logging
import re
import traceback

from django.core.cache import cache
from django.core.exceptions import PermissionDenied, SuspiciousOperation
from django.http import Http404, HttpResponse
from django.utils import timezone

logger = logging.getLogger(__name__)

_ID = re.compile(r'/(\d+|[0-9a-fA-F]{8}-[0-9a-fA-F-]{27})(?=/|$)')
_IGNORED = (Http404, PermissionDenied, SuspiciousOperation)


def normalize_route(path):
    """`/api/orders/123/status/` → `/api/orders/<id>/status/` (regroupe les erreurs
    d'une même route et n'expose jamais un identifiant)."""
    return _ID.sub('/<id>', path)[:200]


def _location(exc):
    """Emplacement de la dernière frame appartenant au projet (pas aux libs)."""
    frames = traceback.extract_tb(exc.__traceback__)
    ours = [f for f in frames if 'site-packages' not in f.filename.replace('\\', '/')]
    frame = (ours or frames)[-1] if frames else None
    if not frame:
        return ''
    name = frame.filename.replace('\\', '/').split('/backend/')[-1]
    return f'{name}:{frame.lineno}:{frame.name}'[:300]


class ErrorLogMiddleware:
    """Enregistre les exceptions non gérées (réponse 500), groupées par empreinte.
    Ne conserve rien de la requête et ne masque jamais l'exception d'origine."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        if isinstance(exception, _IGNORED):
            return None
        try:
            self._record(request, exception)
        except Exception:
            logger.exception('ErrorLogMiddleware: enregistrement impossible')
        return None  # laisse Django produire la réponse 500 habituelle

    @staticmethod
    def _record(request, exception):
        from django.db.models import F
        from .system_models import ErrorEvent

        route = normalize_route(request.path)
        location = _location(exception)
        etype = type(exception).__name__[:120]
        fingerprint = hashlib.sha1(f'{etype}|{route}|{location}'.encode()).hexdigest()
        now = timezone.now()
        event, created = ErrorEvent.objects.get_or_create(
            fingerprint=fingerprint,
            defaults={'exception_type': etype, 'route': route, 'method': request.method[:10], 'location': location, 'last_seen': now},
        )
        if not created:
            # Une panne « résolue » qui revient se rouvre automatiquement.
            ErrorEvent.objects.filter(pk=event.pk).update(
                count=F('count') + 1, last_seen=now, status='open', resolved_at=None)


class AdminLoginThrottleMiddleware:
    """Anti-brute-force de l'admin Django (`/admin/login/`) : au-delà de
    MAX_ATTEMPTS tentatives POST par IP sur WINDOW secondes → 429. Sans
    dépendance externe (cache Django)."""
    MAX_ATTEMPTS = 10
    WINDOW = 15 * 60

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == 'POST' and request.path.rstrip('/').endswith('/admin/login'):
            key = f'admin-login-attempts:{request.META.get("REMOTE_ADDR", "?")}'
            attempts = cache.get(key, 0) + 1
            cache.set(key, attempts, self.WINDOW)
            if attempts > self.MAX_ATTEMPTS:
                return HttpResponse('Trop de tentatives de connexion. Réessayez plus tard.', status=429)
        return self.get_response(request)
