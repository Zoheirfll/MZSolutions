"""Garde d'accès des fonctions IA : module activé ? quota quotidien atteint ? Chaque appel qui
déclenche réellement le modèle passe par `ai_gate(store)`, qui enregistre aussi la consommation."""
from django.db.models import F
from django.utils import timezone
from rest_framework.response import Response

from core.features import feature_enabled


def ai_gate(store):
    """None si l'appel est autorisé (et comptabilisé), sinon la Response d'erreur à renvoyer."""
    if store is None:
        return None
    if not feature_enabled(store, 'ai'):
        return Response({'detail': "L'assistant IA est désactivé pour cette boutique.", 'code': 'feature_disabled'}, status=403)
    from .models import AIUsageDay
    limit = 0
    try:
        from platform_admin.system_models import PlatformSettings
        limit = PlatformSettings.load().ai_daily_limit
    except Exception:
        pass
    today = timezone.localdate()
    usage, _ = AIUsageDay.objects.get_or_create(store=store, day=today)
    if limit and usage.calls >= limit:
        return Response({'detail': "Limite quotidienne d'utilisation de l'assistant IA atteinte. Réessayez demain.", 'code': 'ai_quota'}, status=429)
    AIUsageDay.objects.filter(pk=usage.pk).update(calls=F('calls') + 1)
    return None
