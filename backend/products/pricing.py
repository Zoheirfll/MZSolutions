"""Suggestion de prix — calcul 100% déterministe (aucun appel IA), même
philosophie que products/recommendations.py et orders/sales_forecast.py :
toujours une fourchette basse/haute, jamais un chiffre unique présenté
comme une certitude. Nécessite Product.cost_price renseigné (sinon
`available: False` — jamais un prix inventé sans donnée réelle)."""
from .recommendations import _sales_rate

MIN_MARGIN_PCT = 5.0  # jamais suggérer une marge en dessous de ce plancher
VELOCITY_WINDOW_DAYS = 14
STRONG_VELOCITY_CHANGE_PCT = 30
VELOCITY_MARGIN_ADJUST_PCT = 5


def suggest_price(store, product):
    if product.cost_price is None:
        return {'available': False, 'reason': "Prix d'achat non renseigné pour ce produit — impossible de calculer une marge."}
    cost = float(product.cost_price)
    price = float(product.price or 0)
    if price <= 0:
        return {'available': False, 'reason': "Prix de vente actuel invalide."}

    current_margin_pct = round((price - cost) / price * 100, 1)

    other_products = store.products.filter(is_active=True, cost_price__isnull=False, price__gt=0).exclude(pk=product.pk)
    other_margins = [
        (float(p.price) - float(p.cost_price)) / float(p.price) * 100
        for p in other_products
    ]
    store_avg_margin_pct = round(sum(other_margins) / len(other_margins), 1) if other_margins else current_margin_pct

    recent_rate = _sales_rate(store, product.id, VELOCITY_WINDOW_DAYS)
    prior_rate = _sales_rate(store, product.id, VELOCITY_WINDOW_DAYS * 2, VELOCITY_WINDOW_DAYS)
    velocity_change_pct = round((recent_rate - prior_rate) / prior_rate * 100, 1) if prior_rate > 0 else None

    # Cible = moyenne entre la marge actuelle et la marge moyenne de la
    # boutique — ancre la suggestion sur des données réelles, pas un
    # objectif arbitraire. Ajustée par la vélocité : ventes en forte baisse
    # → pousse la cible vers le bas (encourager la vente) ; forte hausse →
    # vers le haut (la demande supporte un prix plus élevé).
    target_margin_pct = (current_margin_pct + store_avg_margin_pct) / 2
    if velocity_change_pct is not None:
        if velocity_change_pct <= -STRONG_VELOCITY_CHANGE_PCT:
            target_margin_pct -= VELOCITY_MARGIN_ADJUST_PCT
        elif velocity_change_pct >= STRONG_VELOCITY_CHANGE_PCT:
            target_margin_pct += VELOCITY_MARGIN_ADJUST_PCT
    target_margin_pct = max(target_margin_pct, MIN_MARGIN_PCT)

    def price_for_margin(margin_pct):
        m = min(margin_pct, 95.0) / 100
        return round(cost / (1 - m), 2)

    return {
        'available': True,
        'current_price': price,
        'cost_price': cost,
        'current_margin_pct': current_margin_pct,
        'store_avg_margin_pct': store_avg_margin_pct,
        'sales_rate_14d': round(recent_rate, 2),
        'velocity_change_pct': velocity_change_pct,
        'target_margin_pct': round(target_margin_pct, 1),
        'suggested_price_low': price_for_margin(target_margin_pct - VELOCITY_MARGIN_ADJUST_PCT),
        'suggested_price_high': price_for_margin(target_margin_pct + VELOCITY_MARGIN_ADJUST_PCT),
    }
