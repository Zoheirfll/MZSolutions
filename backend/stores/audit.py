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
MAX_LIST_ITEMS = 50


def _clamp(value):
    return max(0, min(100, round(value)))


def _catalogue_score(store):
    products = list(store.products.filter(is_active=True))
    total = len(products)
    if total == 0:
        return {'score': None, 'details': {'active_products': 0}}

    missing_image = [p for p in products if not p.images.exists()]
    missing_description = [p for p in products if not p.description]
    missing_cost_price = [p for p in products if p.cost_price is None]
    missing_category = [p for p in products if not p.categories.exists()]

    with_image = total - len(missing_image)
    with_description = total - len(missing_description)
    with_cost_price = total - len(missing_cost_price)
    with_category = total - len(missing_category)

    rates = [with_image / total, with_description / total, with_cost_price / total, with_category / total]
    score = _clamp(sum(rates) / len(rates) * 100)
    return {'score': score, 'details': {
        'active_products': total,
        'pct_with_image': round(with_image / total * 100, 1),
        'pct_with_description': round(with_description / total * 100, 1),
        'pct_with_cost_price': round(with_cost_price / total * 100, 1),
        'pct_with_category': round(with_category / total * 100, 1),
        'missing_image': [{'id': p.id, 'name': p.name} for p in missing_image[:MAX_LIST_ITEMS]],
        'missing_description': [{'id': p.id, 'name': p.name} for p in missing_description[:MAX_LIST_ITEMS]],
        'missing_cost_price': [{'id': p.id, 'name': p.name} for p in missing_cost_price[:MAX_LIST_ITEMS]],
        'missing_category': [{'id': p.id, 'name': p.name} for p in missing_category[:MAX_LIST_ITEMS]],
    }}


def _logistics_score(store):
    since = timezone.now() - timedelta(days=LOGISTICS_WINDOW_DAYS)
    qs = store.orders.filter(created_at__gte=since).exclude(status__in=REAL_EXCLUDED_STATUSES)
    total = qs.count()
    if total == 0:
        return {'score': None, 'details': {'orders': 0}}

    confirmed = qs.filter(status__in=CONFIRMED_STATUSES).count()
    confirmation_rate = confirmed / total * 100

    now = timezone.now()
    late_cutoff = now - timedelta(hours=LATE_PENDING_HOURS)
    pending_qs = qs.filter(status='pending')
    pending_total = pending_qs.count()
    late_orders = list(pending_qs.filter(created_at__lte=late_cutoff).order_by('created_at')[:MAX_LIST_ITEMS])
    late_pending = pending_qs.filter(created_at__lte=late_cutoff).count()
    late_ratio = (late_pending / pending_total) if pending_total else 0.0

    score = _clamp(confirmation_rate * (1 - late_ratio * 0.5))
    return {'score': score, 'details': {
        'orders': total, 'confirmation_rate': round(confirmation_rate, 1),
        'pending_total': pending_total, 'late_pending': late_pending,
        'late_orders': [{
            'id': o.id, 'phone': o.phone,
            'created_at': o.created_at.isoformat(),
            'hours_late': round((now - o.created_at).total_seconds() / 3600, 1),
        } for o in late_orders],
    }}


def _stock_score(store):
    products = list(store.products.filter(is_active=True))
    total = len(products)
    if total == 0:
        return {'score': None, 'details': {'active_products': 0}}

    try:
        threshold = store.settings.low_stock_threshold
    except Exception:
        threshold = 5

    out_of_stock_products = [p for p in products if p.total_stock == 0]
    low_stock_products = [p for p in products if 0 < p.total_stock <= threshold]

    out_of_stock_ratio = len(out_of_stock_products) / total
    low_stock_ratio = len(low_stock_products) / total
    score = _clamp(100 - out_of_stock_ratio * 70 - low_stock_ratio * 30)
    return {'score': score, 'details': {
        'active_products': total, 'out_of_stock': len(out_of_stock_products), 'low_stock': len(low_stock_products),
        'out_of_stock_products': [{'id': p.id, 'name': p.name} for p in out_of_stock_products[:MAX_LIST_ITEMS]],
        'low_stock_products': [{'id': p.id, 'name': p.name, 'stock': p.total_stock} for p in low_stock_products[:MAX_LIST_ITEMS]],
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
    risky_rows = list(store.orders
                       .filter(status__in=RISK_STATUSES, created_at__gte=risk_cutoff)
                       .values('phone')
                       .annotate(risky_count=Count('id'))
                       .filter(risky_count__gte=risk_threshold))
    risky_phones = {r['phone'] for r in risky_rows}
    manual_risk_phones = set(CustomerRisk.objects.filter(store=store, manual_risk=True, phone__in=risky_phones)
                              .values_list('phone', flat=True))
    untreated_phones = risky_phones - manual_risk_phones
    untreated_risk_ratio = (len(untreated_phones) / len(risky_phones)) if risky_phones else None

    products_with_cost = list(store.products.filter(is_active=True).exclude(cost_price__isnull=True))
    total_with_cost = len(products_with_cost)
    at_loss_products = [p for p in products_with_cost if p.price < p.cost_price]
    loss_ratio = (len(at_loss_products) / total_with_cost) if total_with_cost else None

    if return_rate is None and untreated_risk_ratio is None and loss_ratio is None:
        return {'score': None, 'details': {}}

    score = 100.0
    if return_rate is not None:
        score -= return_rate * 0.5
    if untreated_risk_ratio is not None:
        score -= untreated_risk_ratio * 30
    if loss_ratio is not None:
        score -= loss_ratio * 20

    risky_counts_by_phone = {r['phone']: r['risky_count'] for r in risky_rows}
    return {'score': _clamp(score), 'details': {
        'return_rate': round(return_rate, 1) if return_rate is not None else None,
        'at_risk_customers': len(risky_phones), 'untreated_at_risk_customers': len(untreated_phones),
        'products_at_loss': len(at_loss_products),
        'untreated_customers': [{'phone': ph, 'risky_count': risky_counts_by_phone[ph]}
                                 for ph in list(untreated_phones)[:MAX_LIST_ITEMS]],
        'at_loss_products': [{'id': p.id, 'name': p.name, 'price': str(p.price), 'cost_price': str(p.cost_price)}
                              for p in at_loss_products[:MAX_LIST_ITEMS]],
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
