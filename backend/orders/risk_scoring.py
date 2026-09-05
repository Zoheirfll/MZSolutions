"""Score de risque avancé (0-100) par commande — calcul DÉTERMINISTE pur,
aucun appel réseau, aucun appel IA. 4 signaux pondérés (somme plafonnée à
100), chacun déclenché indépendamment sur l'historique du téléphone dans
cette boutique. Voir docs/superpowers/specs/2026-09-05-detection-risque-avancee-design.md."""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Avg
from django.utils import timezone

CANCEL_RETURN_STATUSES = ['cancelled', 'returned']

WEIGHT_CANCEL_RETURN_RATE = 40
WEIGHT_UNUSUAL_FREQUENCY = 20
WEIGHT_UNUSUAL_AMOUNT = 20
WEIGHT_LOCATION_MISMATCH = 20


def compute_risk_score(store, phone, wilaya, commune, total):
    signals = []
    weight = 0

    try:
        settings_obj = store.settings
        threshold = settings_obj.risk_threshold_orders
        period_days = settings_obj.risk_period_days
    except Exception:
        threshold, period_days = 3, 90

    history = store.orders.filter(phone=phone)
    cutoff = timezone.now() - timedelta(days=period_days)
    risky_count = history.filter(status__in=CANCEL_RETURN_STATUSES, created_at__gte=cutoff).count()
    if risky_count >= threshold:
        signals.append('cancel_return_rate')
        weight += WEIGHT_CANCEL_RETURN_RATE

    recent_cutoff = timezone.now() - timedelta(hours=24)
    recent_count = history.filter(created_at__gte=recent_cutoff).count()
    if recent_count >= 3:
        signals.append('unusual_frequency')
        weight += WEIGHT_UNUSUAL_FREQUENCY

    total = Decimal(str(total))
    customer_avg = history.aggregate(avg=Avg('total'))['avg']
    if customer_avg is not None and customer_avg > 0:
        if total >= Decimal(str(customer_avg)) * 3:
            signals.append('unusual_amount')
            weight += WEIGHT_UNUSUAL_AMOUNT
    else:
        store_cutoff = timezone.now() - timedelta(days=90)
        store_avg = store.orders.filter(created_at__gte=store_cutoff).aggregate(avg=Avg('total'))['avg']
        if store_avg is not None and store_avg > 0 and total >= Decimal(str(store_avg)) * 3:
            signals.append('unusual_amount')
            weight += WEIGHT_UNUSUAL_AMOUNT

    previous_wilayas = set(history.exclude(wilaya='').values_list('wilaya', flat=True))
    if previous_wilayas and wilaya not in previous_wilayas:
        signals.append('location_mismatch')
        weight += WEIGHT_LOCATION_MISMATCH

    return min(weight, 100), signals
