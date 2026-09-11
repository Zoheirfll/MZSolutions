"""Moteur de recommandation produit — calcul DÉTERMINISTE pur, aucune I/O
réseau, aucun appel IA. Voir docs/superpowers/specs/2026-09-11-recommandations-produit-design.md."""
from collections import Counter
from datetime import timedelta
from decimal import Decimal
from itertools import combinations

from django.db.models import Sum
from django.utils import timezone

from orders.stats_views import REAL_EXCLUDED_STATUSES
from .models import StockMovement

MIN_CO_OCCURRENCES = 2
PRICE_RANGE_PCT = 0.30
PROMOTE_WINDOW_DAYS = 14
TRENDING_WINDOW_DAYS = 7


def _order_item_product_ids_by_order(store):
    """{order_id: [product_id, ...]} pour les commandes réelles avec au moins
    un OrderItem lié à un produit (jamais un article sans product_id)."""
    from orders.models import OrderItem
    rows = (OrderItem.objects
            .filter(order__store=store, product_id__isnull=False)
            .exclude(order__status__in=REAL_EXCLUDED_STATUSES)
            .values('order_id', 'product_id'))
    by_order = {}
    for r in rows:
        by_order.setdefault(r['order_id'], []).append(r['product_id'])
    return by_order


def co_purchased_products(store, product_id, limit=4):
    by_order = _order_item_product_ids_by_order(store)
    counts = Counter()
    for product_ids in by_order.values():
        if product_id not in product_ids:
            continue
        for pid in product_ids:
            if pid != product_id:
                counts[pid] += 1
    candidate_ids = [pid for pid, c in counts.most_common() if c >= MIN_CO_OCCURRENCES][:limit]
    products_by_id = {p.id: p for p in store.products.filter(id__in=candidate_ids, is_active=True)}
    return [products_by_id[pid] for pid in candidate_ids if pid in products_by_id]


def similar_products(store, product, limit=4, exclude_ids=None):
    exclude_ids = set(exclude_ids or []) | {product.id}
    low = product.price * (Decimal('1') - Decimal(str(PRICE_RANGE_PCT)))
    high = product.price * (Decimal('1') + Decimal(str(PRICE_RANGE_PCT)))
    category_ids = list(product.categories.values_list('id', flat=True))
    if not category_ids:
        return []
    candidates = (store.products
                  .filter(is_active=True, categories__id__in=category_ids, price__gte=low, price__lte=high)
                  .exclude(id__in=exclude_ids)
                  .distinct())
    return sorted(candidates, key=lambda p: abs(p.price - product.price))[:limit]


def recommended_products_for(store, product, limit=4):
    co_purchased = co_purchased_products(store, product.id, limit=limit)
    if len(co_purchased) >= limit:
        return co_purchased
    filler = similar_products(store, product, limit=limit - len(co_purchased),
                              exclude_ids=[p.id for p in co_purchased])
    return co_purchased + filler


def cart_recommendations(store, product_ids_in_cart, limit=4):
    by_order = _order_item_product_ids_by_order(store)
    counts = Counter()
    cart_set = set(product_ids_in_cart)
    for product_ids in by_order.values():
        matched = cart_set.intersection(product_ids)
        if not matched:
            continue
        for pid in product_ids:
            if pid not in cart_set:
                counts[pid] += 1
    candidate_ids = [pid for pid, c in counts.most_common() if c >= MIN_CO_OCCURRENCES][:limit]
    products_by_id = {p.id: p for p in store.products.filter(id__in=candidate_ids, is_active=True)}
    result = [products_by_id[pid] for pid in candidate_ids if pid in products_by_id]
    if result:
        return result
    first_product = store.products.filter(id__in=product_ids_in_cart).first()
    if not first_product:
        return []
    return similar_products(store, first_product, limit=limit, exclude_ids=product_ids_in_cart)


def _sales_rate(store, product_id, since_days, until_days=0):
    since = timezone.now() - timedelta(days=since_days)
    until = timezone.now() - timedelta(days=until_days)
    total = (StockMovement.objects
             .filter(store=store, product_id=product_id, reason='order_sale',
                     created_at__gte=since, created_at__lt=until)
             .aggregate(s=Sum('quantity'))['s'] or 0)
    window = since_days - until_days
    return abs(total) / window if window else 0.0


def products_to_promote(store, limit=10):
    results = []
    for product in store.products.filter(is_active=True, stock__gt=0).exclude(cost_price__isnull=True):
        total_stock = product.total_stock
        if total_stock <= 0 or not product.price:
            continue
        margin_pct = float(product.price - product.cost_price) / float(product.price)
        rate = _sales_rate(store, product.id, PROMOTE_WINDOW_DAYS)
        score = margin_pct * total_stock / (1 + rate)
        results.append({'product': product, 'margin_pct': round(margin_pct, 3),
                        'total_stock': total_stock, 'sales_rate_14d': round(rate, 2),
                        'score': round(score, 2)})
    results.sort(key=lambda r: r['score'], reverse=True)
    return results[:limit]


def trending_products(store, limit=10):
    results = []
    for product in store.products.filter(is_active=True):
        recent = _sales_rate(store, product.id, TRENDING_WINDOW_DAYS)
        prior = _sales_rate(store, product.id, TRENDING_WINDOW_DAYS * 2, TRENDING_WINDOW_DAYS)
        growth = recent - prior
        if growth > 0:
            results.append({'product': product, 'recent_rate': round(recent, 2),
                            'prior_rate': round(prior, 2), 'growth': round(growth, 2)})
    results.sort(key=lambda r: r['growth'], reverse=True)
    return results[:limit]


def bundle_suggestions(store, limit=10):
    by_order = _order_item_product_ids_by_order(store)
    counts = Counter()
    for product_ids in by_order.values():
        unique_ids = sorted(set(product_ids))
        for a, b in combinations(unique_ids, 2):
            counts[(a, b)] += 1
    pairs = [(pair, c) for pair, c in counts.most_common() if c >= MIN_CO_OCCURRENCES][:limit]
    all_ids = {pid for pair, _ in pairs for pid in pair}
    products_by_id = {p.id: p for p in store.products.filter(id__in=all_ids, is_active=True)}
    results = []
    for (a, b), count in pairs:
        if a in products_by_id and b in products_by_id:
            results.append({'product_a': products_by_id[a], 'product_b': products_by_id[b], 'count': count})
    return results
