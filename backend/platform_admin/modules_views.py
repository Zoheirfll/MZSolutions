"""Modules par boutique et consommation de l'assistant IA (admin plateforme — phase 10)."""
from datetime import timedelta

from django.db.models import Sum
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ai_assistant.models import AIUsageDay
from core.features import FEATURES
from stores.models import Store

from .account_views import log_platform_audit
from .permissions import is_platform_admin, is_platform_superadmin


def _forbidden(superadmin=False):
    who = 'au superadmin' if superadmin else 'aux administrateurs de la plateforme'
    return Response({'detail': f'Accès réservé {who}.'}, status=403)


class StoreFeaturesView(APIView):
    """Coupe ou rétablit des modules pour UNE boutique (superadmin). La coupure globale se règle
    dans les réglages de la plateforme ; un module est actif seulement s'il n'est coupé ni
    globalement ni pour la boutique."""
    permission_classes = [IsAuthenticated]

    def put(self, request, store_id):
        if not is_platform_superadmin(request):
            return _forbidden(True)
        store = Store.objects.filter(pk=store_id).first()
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        disabled = request.data.get('disabled')
        if not isinstance(disabled, list) or any(k not in FEATURES for k in disabled):
            return Response({'detail': 'Liste de modules invalide.'}, status=400)
        before = list(store.disabled_features or [])
        store.disabled_features = sorted(set(disabled))
        store.save(update_fields=['disabled_features'])
        log_platform_audit(request, 'platform.store_features_changed', store=store, target=store,
                           description='Modules de la boutique modifiés',
                           metadata={'before': before, 'after': store.disabled_features})
        return Response({'disabled_features': store.disabled_features})


class AIUsageView(APIView):
    """Consommation de l'assistant IA : aujourd'hui, 7 derniers jours, boutiques les plus actives
    (compteurs seulement — jamais le contenu des échanges)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        today = timezone.localdate()
        week_ago = today - timedelta(days=6)
        per_day = {r['day']: r['n'] for r in AIUsageDay.objects.filter(day__gte=week_ago).values('day').annotate(n=Sum('calls'))}
        days = [{'day': (week_ago + timedelta(days=i)).isoformat(), 'calls': per_day.get(week_ago + timedelta(days=i), 0)} for i in range(7)]
        top = (AIUsageDay.objects.filter(day=today).values('store_id', 'store__name').annotate(n=Sum('calls')).order_by('-n')[:5])
        by_feature = {r['feature']: r['n'] for r in AIUsageDay.objects.filter(day=today).values('feature').annotate(n=Sum('calls'))}
        return Response({
            'today': per_day.get(today, 0),
            'last_7_days': days,
            'top_stores_today': [{'store_id': u['store_id'], 'store_name': u['store__name'], 'calls': u['n']} for u in top],
            'today_by_feature': by_feature,
        })
