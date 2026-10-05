"""Garde d'accès des fonctions IA : module activé ? quota atteint ? Chaque appel qui
déclenche réellement le modèle passe par `ai_gate(store)`, qui enregistre aussi la consommation.

Les plafonds (quotidien ET hebdomadaire) sont ceux du PALIER de la boutique et valent pour la
boutique entière, tous comptes confondus (jamais « par confirmateur »). Une boutique sans palier
(essai) suit les plafonds globaux des réglages de la plateforme. 0 = illimité. La semaine est
glissante (aujourd'hui + les 6 jours précédents)."""
from datetime import timedelta

from django.db.models import F, Sum
from django.utils import timezone
from rest_framework.response import Response

from core.features import feature_enabled


def ai_limits(store):
    """(plafond quotidien, plafond hebdomadaire) applicable à cette boutique."""
    try:
        quota = store.quota
        if quota.plan_id:
            return quota.plan.ai_daily_limit, quota.plan.ai_weekly_limit
    except Exception:
        pass
    try:
        from platform_admin.system_models import PlatformSettings
        s = PlatformSettings.load()
        return s.ai_daily_limit, s.ai_weekly_limit
    except Exception:
        return 0, 0


def ai_gate(store):
    """None si l'appel est autorisé (et comptabilisé), sinon la Response d'erreur à renvoyer."""
    if store is None:
        return None
    if not feature_enabled(store, 'ai'):
        return Response({'detail': "L'assistant IA est désactivé pour cette boutique.", 'code': 'feature_disabled'}, status=403)
    from .models import AIUsageDay
    daily, weekly = ai_limits(store)
    today = timezone.localdate()
    usage, _ = AIUsageDay.objects.get_or_create(store=store, day=today)
    if daily and usage.calls >= daily:
        return Response({'detail': "Limite quotidienne d'utilisation de l'assistant IA atteinte. Réessayez demain.", 'code': 'ai_quota', 'period': 'daily'}, status=429)
    if weekly:
        used = AIUsageDay.objects.filter(store=store, day__gt=today - timedelta(days=7)).aggregate(n=Sum('calls'))['n'] or 0
        if used >= weekly:
            return Response({'detail': "Limite hebdomadaire d'utilisation de l'assistant IA atteinte pour votre palier.", 'code': 'ai_quota', 'period': 'weekly'}, status=429)
    AIUsageDay.objects.filter(pk=usage.pk).update(calls=F('calls') + 1)
    return None
