"""Garde d'accès des fonctions IA : module activé ? quota atteint ? Chaque appel qui
déclenche réellement le modèle passe par `ai_gate(store, feature)`, qui enregistre aussi la consommation.

Les plafonds (quotidien ET hebdomadaire) sont ceux du PALIER de la boutique et valent pour la
boutique entière, tous comptes confondus (jamais « par confirmateur ») :
  - un plafond TOTAL (tous appels IA confondus) ;
  - un plafond PAR FONCTIONNALITÉ (`quotas.AI_FEATURES`).
Une boutique sans palier (essai) suit les plafonds des réglages de la plateforme. 0 = illimité.
La semaine est glissante (aujourd'hui + les 6 jours précédents)."""
from datetime import timedelta

from django.db.models import F, Sum
from django.utils import timezone
from rest_framework.response import Response

from core.features import feature_enabled
from .quotas import AI_FEATURES


def ai_limits(store):
    """(total_quotidien, total_hebdo, quotas_par_fonctionnalité) applicables à cette boutique."""
    try:
        quota = store.quota
        if quota.plan_id:
            p = quota.plan
            return p.ai_daily_limit, p.ai_weekly_limit, p.ai_quotas or {}
    except Exception:
        pass
    try:
        from platform_admin.system_models import PlatformSettings
        s = PlatformSettings.load()
        return s.ai_daily_limit, s.ai_weekly_limit, s.ai_quotas or {}
    except Exception:
        return 0, 0, {}


def _refuse(period, label=None):
    when = 'quotidienne' if period == 'daily' else 'hebdomadaire'
    what = f' pour « {label} »' if label else ''
    after = 'Réessayez demain.' if period == 'daily' else 'Réessayez plus tard ou changez de palier.'
    return Response({'detail': f"Limite {when} d'utilisation de l'assistant IA atteinte{what}. {after}",
                     'code': 'ai_quota', 'period': period, 'feature': label}, status=429)


def ai_gate(store, feature=''):
    """None si l'appel est autorisé (et comptabilisé), sinon la Response d'erreur à renvoyer."""
    if store is None:
        return None
    if not feature_enabled(store, 'ai'):
        return Response({'detail': "L'assistant IA est désactivé pour cette boutique.", 'code': 'feature_disabled'}, status=403)
    from .models import AIUsageDay
    daily, weekly, per_feature = ai_limits(store)
    today = timezone.localdate()
    week_start = today - timedelta(days=6)
    rows = AIUsageDay.objects.filter(store=store, day__gte=week_start)

    if daily and (rows.filter(day=today).aggregate(n=Sum('calls'))['n'] or 0) >= daily:
        return _refuse('daily')
    if weekly and (rows.aggregate(n=Sum('calls'))['n'] or 0) >= weekly:
        return _refuse('weekly')

    q = per_feature.get(feature) or {}
    label = AI_FEATURES.get(feature, feature)
    if q.get('daily') and (rows.filter(day=today, feature=feature).aggregate(n=Sum('calls'))['n'] or 0) >= q['daily']:
        return _refuse('daily', label)
    if q.get('weekly') and (rows.filter(feature=feature).aggregate(n=Sum('calls'))['n'] or 0) >= q['weekly']:
        return _refuse('weekly', label)

    usage, _ = AIUsageDay.objects.get_or_create(store=store, day=today, feature=feature)
    AIUsageDay.objects.filter(pk=usage.pk).update(calls=F('calls') + 1)
    return None


def quota_status(store):
    """Consommation et reste de chaque fonctionnalité IA pour la boutique (quotidien et hebdo).
    `remaining` vaut None quand la limite est 0 (illimité)."""
    from .models import AIUsageDay
    daily, weekly, per_feature = ai_limits(store)
    today = timezone.localdate()
    rows = list(AIUsageDay.objects.filter(store=store, day__gte=today - timedelta(days=6)).values('day', 'feature', 'calls'))

    def used(feature=None, only_today=False):
        return sum(r['calls'] for r in rows if (feature is None or r['feature'] == feature) and (not only_today or r['day'] == today))

    def cell(limit, n):
        return {'limit': limit, 'used': n, 'remaining': max(limit - n, 0) if limit else None}

    features = []
    for key, label in AI_FEATURES.items():
        q = per_feature.get(key) or {}
        features.append({'key': key, 'label': label,
                         'daily': cell(q.get('daily') or 0, used(key, True)),
                         'weekly': cell(q.get('weekly') or 0, used(key))})
    return {'enabled': feature_enabled(store, 'ai'), 'features': features,
            'total': {'daily': cell(daily, used(None, True)), 'weekly': cell(weekly, used())}}
