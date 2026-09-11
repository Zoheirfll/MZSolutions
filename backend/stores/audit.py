"""Audit global de la boutique — calcul DÉTERMINISTE pur, aucun appel réseau,
aucun appel IA. Voir docs/superpowers/specs/2026-09-11-audit-boutique-design.md."""
from datetime import timedelta

from django.db.models import Count, F
from django.utils import timezone

from orders.stats_views import REAL_EXCLUDED_STATUSES, CONFIRMED_STATUSES
from orders.views import RISK_STATUSES

LOGISTICS_WINDOW_DAYS = 30
RETURNS_WINDOW_DAYS = 30
LATE_PENDING_HOURS = 24


def _clamp(value):
    return max(0, min(100, round(value)))


def _catalogue_score(store):
    products = store.products.filter(is_active=True)
    total = products.count()
    if total == 0:
        return {'score': None, 'details': {'active_products': 0}}

    with_image = products.filter(images__isnull=False).distinct().count()
    with_description = products.exclude(description='').filter(description__isnull=False).count()
    with_cost_price = products.exclude(cost_price__isnull=True).count()
    with_category = products.filter(categories__isnull=False).distinct().count()

    rates = [with_image / total, with_description / total, with_cost_price / total, with_category / total]
    score = _clamp(sum(rates) / len(rates) * 100)
    return {'score': score, 'details': {
        'active_products': total,
        'pct_with_image': round(with_image / total * 100, 1),
        'pct_with_description': round(with_description / total * 100, 1),
        'pct_with_cost_price': round(with_cost_price / total * 100, 1),
        'pct_with_category': round(with_category / total * 100, 1),
    }}


def _logistics_score(store):
    since = timezone.now() - timedelta(days=LOGISTICS_WINDOW_DAYS)
    qs = store.orders.filter(created_at__gte=since).exclude(status__in=REAL_EXCLUDED_STATUSES)
    total = qs.count()
    if total == 0:
        return {'score': None, 'details': {'orders': 0}}

    confirmed = qs.filter(status__in=CONFIRMED_STATUSES).count()
    confirmation_rate = confirmed / total * 100

    late_cutoff = timezone.now() - timedelta(hours=LATE_PENDING_HOURS)
    pending_qs = qs.filter(status='pending')
    pending_total = pending_qs.count()
    late_pending = pending_qs.filter(created_at__lte=late_cutoff).count()
    late_ratio = (late_pending / pending_total) if pending_total else 0.0

    score = _clamp(confirmation_rate * (1 - late_ratio * 0.5))
    return {'score': score, 'details': {
        'orders': total, 'confirmation_rate': round(confirmation_rate, 1),
        'pending_total': pending_total, 'late_pending': late_pending,
    }}


def _stock_score(store):
    products = store.products.filter(is_active=True)
    total = products.count()
    if total == 0:
        return {'score': None, 'details': {'active_products': 0}}

    try:
        threshold = store.settings.low_stock_threshold
    except Exception:
        threshold = 5

    out_of_stock = sum(1 for p in products if p.total_stock == 0)
    low_stock = sum(1 for p in products if 0 < p.total_stock <= threshold)

    out_of_stock_ratio = out_of_stock / total
    low_stock_ratio = low_stock / total
    score = _clamp(100 - out_of_stock_ratio * 70 - low_stock_ratio * 30)
    return {'score': score, 'details': {
        'active_products': total, 'out_of_stock': out_of_stock, 'low_stock': low_stock,
    }}


def _returns_risk_score(store):
    from orders.models import CustomerRisk

    since = timezone.now() - timedelta(days=RETURNS_WINDOW_DAYS)
    orders_qs = store.orders.filter(created_at__gte=since)
    total_orders = orders_qs.count()
    return_rate = (orders_qs.filter(status='returned').count() / total_orders * 100) if total_orders else None

    try:
        risk_threshold = store.settings.risk_threshold_orders
        risk_period_days = store.settings.risk_period_days
    except Exception:
        risk_threshold, risk_period_days = 3, 90
    risk_cutoff = timezone.now() - timedelta(days=risk_period_days)
    risky_phones = (store.orders
                     .filter(status__in=RISK_STATUSES, created_at__gte=risk_cutoff)
                     .values('phone')
                     .annotate(risky_count=Count('id'))
                     .filter(risky_count__gte=risk_threshold)
                     .values_list('phone', flat=True))
    risky_phones = set(risky_phones)
    manual_risk_phones = set(CustomerRisk.objects.filter(store=store, manual_risk=True, phone__in=risky_phones)
                              .values_list('phone', flat=True))
    untreated_risk_ratio = (len(risky_phones - manual_risk_phones) / len(risky_phones)) if risky_phones else None

    products_with_cost = store.products.filter(is_active=True).exclude(cost_price__isnull=True)
    total_with_cost = products_with_cost.count()
    at_loss = products_with_cost.filter(price__lt=F('cost_price')).count() if total_with_cost else 0
    loss_ratio = (at_loss / total_with_cost) if total_with_cost else None

    if return_rate is None and untreated_risk_ratio is None and loss_ratio is None:
        return {'score': None, 'details': {}}

    score = 100.0
    if return_rate is not None:
        score -= return_rate * 0.5
    if untreated_risk_ratio is not None:
        score -= untreated_risk_ratio * 30
    if loss_ratio is not None:
        score -= loss_ratio * 20
    return {'score': _clamp(score), 'details': {
        'return_rate': round(return_rate, 1) if return_rate is not None else None,
        'at_risk_customers': len(risky_phones), 'untreated_at_risk_customers': len(risky_phones - manual_risk_phones),
        'products_at_loss': at_loss,
    }}


def compute_store_audit(store):
    dimensions = {
        'catalogue': _catalogue_score(store),
        'logistics': _logistics_score(store),
        'stock': _stock_score(store),
        'returns_risk': _returns_risk_score(store),
    }
    scores = [d['score'] for d in dimensions.values() if d['score'] is not None]
    global_score = _clamp(sum(scores) / len(scores)) if scores else None
    return {'global_score': global_score, 'dimensions': dimensions}
