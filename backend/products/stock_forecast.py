"""Prévision de rupture de stock — calcul DÉTERMINISTE pur, aucune I/O,
aucun appel IA. Voir docs/superpowers/specs/2026-09-06-prevision-rupture-stock-design.md."""

STOCKOUT_WINDOW_DAYS = 14


def days_until_stockout(current_stock, units_sold_14d):
    """`units_sold_14d` : unités vendues sur les 14 derniers jours (déjà
    agrégées par l'appelant depuis StockMovement). Retourne :
    - 0 si le stock est déjà à 0 (rupture déjà là, pas de calcul)
    - None si aucune vente récente (aucune estimation honnête possible)
    - sinon le nombre de jours estimé avant rupture."""
    if current_stock <= 0:
        return 0
    if not units_sold_14d:
        return None
    daily_rate = units_sold_14d / STOCKOUT_WINDOW_DAYS
    return current_stock / daily_rate
