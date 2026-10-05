"""Système, erreurs et réglages de la plateforme (admin plateforme — phase 4)."""
import shutil
import time
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import parse_pagination

from .account_views import log_platform_audit
from .permissions import is_platform_admin, is_platform_superadmin
from .system_models import ErrorEvent, PlatformSettings

DISK_WARN_PERCENT = 15  # moins de 15 % libres = avertissement
DISK_ERROR_PERCENT = 5


def _forbidden(superadmin=False):
    who = 'au superadmin' if superadmin else 'aux administrateurs de la plateforme'
    return Response({'detail': f'Accès réservé {who}.'}, status=403)


def _check(key, label, status, detail=''):
    return {'key': key, 'label': label, 'status': status, 'detail': detail}


def run_health_checks():
    """État des services. **Aucun appel externe** (Groq, SofizPay, transporteurs) :
    seule la configuration est vérifiée, pour qu'un rafraîchissement de la page ne
    consomme jamais de quota ni ne dépende d'un tiers."""
    checks = []

    try:
        start = time.monotonic()
        with connection.cursor() as cur:
            cur.execute('SELECT 1')
        checks.append(_check('database', 'Base de données', 'ok', f'{round((time.monotonic() - start) * 1000)} ms'))
    except Exception:
        checks.append(_check('database', 'Base de données', 'error', 'Injoignable'))

    try:
        cache.set('platform-health', '1', 10)
        ok = cache.get('platform-health') == '1'
        checks.append(_check('cache', 'Cache', 'ok' if ok else 'warning', '' if ok else 'Écriture non relue'))
    except Exception:
        checks.append(_check('cache', 'Cache', 'error', 'Injoignable'))

    smtp = settings.EMAIL_BACKEND.endswith('smtp.EmailBackend')
    mail_ok = (not smtp) or bool(settings.EMAIL_HOST_USER and settings.EMAIL_HOST_PASSWORD)
    checks.append(_check('email', 'Email', 'ok' if mail_ok else 'warning', 'Configuré' if mail_ok else 'Identifiants SMTP manquants'))

    sofiz = bool(settings.SOFIZPAY_ACCOUNT)
    mode = 'sandbox' if settings.SOFIZPAY_SANDBOX else 'production'
    checks.append(_check('sofizpay', 'SofizPay', 'ok' if sofiz else 'error',
                         f'Compte configuré ({mode})' if sofiz else 'SOFIZPAY_ACCOUNT manquant'))
    if sofiz and settings.SOFIZPAY_SANDBOX and not settings.DEBUG:
        checks[-1]['status'] = 'warning'
        checks[-1]['detail'] += ' — attention : sandbox actif en production'

    provider = getattr(settings, 'AI_PROVIDER', 'ollama')
    if provider == 'groq':
        configured = bool(getattr(settings, 'GROQ_API_KEY', ''))
        checks.append(_check('ai', 'Assistant IA', 'ok' if configured else 'warning', 'Groq configuré' if configured else 'GROQ_API_KEY manquante'))
    else:
        checks.append(_check('ai', 'Assistant IA', 'ok', f'Fournisseur : {provider}'))

    try:
        media = Path(settings.MEDIA_ROOT)
        usage = shutil.disk_usage(media if media.exists() else Path(settings.BASE_DIR))
        free = round(usage.free * 100 / usage.total)
        status = 'error' if free < DISK_ERROR_PERCENT else 'warning' if free < DISK_WARN_PERCENT else 'ok'
        checks.append(_check('disk', 'Disque', status, f'{free} % libre ({usage.free // 2**30} Go)'))
    except Exception:
        checks.append(_check('disk', 'Disque', 'warning', 'Mesure impossible'))

    # Sauvegardes de la base : récentes (< 26 h), à surveiller (< 72 h) ou absentes/trop anciennes.
    from .tasks_views import backup_state, list_backups
    files = list_backups()
    state = backup_state(files)
    if state == 'unconfigured':
        checks.append(_check('backups', 'Sauvegardes', 'warning', 'Dossier de sauvegardes non configuré'))
    else:
        detail = f'{len(files)} fichier(s)' if files else 'Aucune sauvegarde trouvée'
        checks.append(_check('backups', 'Sauvegardes', state, detail))

    return checks


class PlatformHealthView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        checks = run_health_checks()
        worst = 'error' if any(c['status'] == 'error' for c in checks) else 'warning' if any(c['status'] == 'warning' for c in checks) else 'ok'
        return Response({'status': worst, 'checked_at': timezone.now(), 'checks': checks})


def _error_row(e):
    return {'id': e.id, 'exception_type': e.exception_type, 'route': e.route, 'method': e.method, 'location': e.location,
            'count': e.count, 'status': e.status, 'first_seen': e.first_seen, 'last_seen': e.last_seen, 'resolved_at': e.resolved_at}


class PlatformErrorListView(APIView):
    """Erreurs 500 groupées (`?status=open|resolved&page=&per_page=`)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        qs = ErrorEvent.objects.all()
        status = request.query_params.get('status')
        if status in ('open', 'resolved'):
            qs = qs.filter(status=status)
        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        rows = [_error_row(e) for e in qs[(page - 1) * per_page: page * per_page]]
        return Response({'count': total, 'open_count': ErrorEvent.objects.filter(status='open').count(),
                         'page': page, 'per_page': per_page, 'results': rows})


class PlatformErrorResolveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_platform_admin(request):
            return _forbidden()
        event = ErrorEvent.objects.filter(pk=pk).first()
        if not event:
            return Response({'detail': 'Erreur introuvable.'}, status=404)
        if event.status == 'resolved':
            return Response(_error_row(event))
        event.status = 'resolved'
        event.resolved_at = timezone.now()
        event.save(update_fields=['status', 'resolved_at'])
        log_platform_audit(request, 'platform.error_resolved', target=event, description=f'Erreur marquée résolue — {event}')
        return Response(_error_row(event))


# ─── Réglages globaux ──────────────────────────────────────────────────────

def _settings_row(s):
    from core.features import FEATURES
    return {'trial_days': s.trial_days, 'allow_registration': s.allow_registration, 'updated_at': s.updated_at,
            'disabled_features': [k for k in s.disabled_features if k in FEATURES], 'ai_daily_limit': s.ai_daily_limit, 'ai_weekly_limit': s.ai_weekly_limit,
            'ai_quotas': __import__('ai_assistant.quotas', fromlist=['x']).quota_rows(s.ai_quotas),
            'features': [{'key': k, 'label': v} for k, v in FEATURES.items()]}


class PlatformSettingsView(APIView):
    """Lecture niveau admin, modification superadmin. Les secrets (clés API,
    SECRET_KEY) ne sont jamais stockés ni exposés ici."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        return Response(_settings_row(PlatformSettings.load()))

    def put(self, request):
        if not is_platform_superadmin(request):
            return _forbidden(True)
        s = PlatformSettings.load()
        before = _settings_row(s)
        errors = []
        if 'trial_days' in request.data:
            try:
                days = int(request.data['trial_days'])
                if not 0 <= days <= 365:
                    raise ValueError
                s.trial_days = days
            except (TypeError, ValueError):
                errors.append("Durée d'essai invalide (0 à 365 jours).")
        if 'allow_registration' in request.data:
            s.allow_registration = bool(request.data['allow_registration'])
        if 'disabled_features' in request.data:
            from core.features import FEATURES
            wanted = request.data['disabled_features']
            if not isinstance(wanted, list) or any(k not in FEATURES for k in wanted):
                errors.append('Modules inconnus.')
            else:
                s.disabled_features = sorted(set(wanted))
        if 'ai_daily_limit' in request.data:
            try:
                limit = int(request.data['ai_daily_limit'])
                if not 0 <= limit <= 100000:
                    raise ValueError
                s.ai_daily_limit = limit
            except (TypeError, ValueError):
                errors.append("Limite IA invalide (0 = illimite, maximum 100000).")
        if 'ai_weekly_limit' in request.data:
            try:
                weekly = int(request.data['ai_weekly_limit'])
                if not 0 <= weekly <= 1000000:
                    raise ValueError
                s.ai_weekly_limit = weekly
            except (TypeError, ValueError):
                errors.append("Limite IA hebdomadaire invalide (0 = illimite).")
        if 'ai_quotas' in request.data:
            from ai_assistant.quotas import clean_quotas
            cleaned, err = clean_quotas(request.data['ai_quotas'])
            if err:
                errors.append(err)
            else:
                s.ai_quotas = cleaned
        if errors:
            return Response({'detail': ' '.join(errors)}, status=400)
        s.save()
        from core.features import clear_cache
        clear_cache()
        after = _settings_row(s)
        changes = {k: {'before': str(before[k]), 'after': str(after[k])} for k in ('trial_days', 'allow_registration', 'disabled_features', 'ai_daily_limit', 'ai_weekly_limit', 'ai_quotas') if before[k] != after[k]}
        log_platform_audit(request, 'platform.settings_updated', target=s, description='Réglages de la plateforme modifiés', metadata={'changes': changes})
        return Response(after)
