# Prévision de rupture de stock — Design

Date : 2026-09-06
Statut : approuvé par l'utilisateur

## Contexte

1er des 2 sous-chantiers restants de l'analyse prédictive (avec la prévision de taux de retour, traitée séparément). Même philosophie que les prévisions de ventes (chantier 4 principal) : **aucun calcul par un LLM**, un calcul déterministe qui s'appuie sur `products.StockMovement` (déjà en base, `reason='order_sale'`).

## Calcul (`products/stock_forecast.py`)

Pour un produit ou une variante donnée :

```python
def days_until_stockout(store, current_stock, product_id, variant_option_id=None) -> float | None:
    """None si le stock est déjà à 0 (traité séparément côté vue, "Épuisé")
    ou si aucune vente sur les 14 derniers jours (aucune estimation possible
    plutôt qu'un faux "jamais en rupture")."""
```

- Fenêtre fixe de 14 jours (décision produit, alignée sur la même fenêtre que la prévision de ventes du chantier principal, pas un nouveau réglage `StoreSettings` pour cette v1).
- `ventes_14j = somme(abs(StockMovement.quantity)) où reason='order_sale', created_at >= aujourd'hui - 14j, et (variant_option_id correspond OU (product_id correspond ET variant_option est null))` — même granularité que la ligne d'inventaire déjà affichée par `InventoryListView` (produit simple vs. option de variante), pas de nouvelle notion introduite.
- `rythme_quotidien = ventes_14j / 14`.
- `jours_avant_rupture = stock_actuel / rythme_quotidien` si `rythme_quotidien > 0`, sinon `None`.

## Backend — extension de l'existant, pas un nouvel endpoint

`GET /api/products/inventory/` (`InventoryListView`, `products/views.py`) — chaque ligne déjà retournée (produit ou option de variante) gagne deux champs :

```json
{"...(champs existants inchangés)...": "...", "sales_rate_14d": 1.3, "days_until_stockout": 5.2}
```

- `days_until_stockout: 0` si `stock == 0` (déjà épuisé, cas géré avant le calcul — pas de division par zéro déguisée).
- `days_until_stockout: null` si `sales_rate_14d == 0` (aucune vente récente, aucune estimation honnête possible).
- Calcul fait en Python après la requête existante qui construit `results` (pas de nouvelle requête par ligne — une seule requête groupée sur `StockMovement` pour toute la page, agrégée par `(product_id, variant_option_id)`, puis jointe aux lignes déjà construites).

## Frontend

`pages/StockPage.jsx`, onglet inventaire complet — nouvelle colonne "RUPTURE ESTIMÉE" entre "STOCK" et "ACTIONS" :

- "Épuisé" (badge rouge) si `days_until_stockout === 0`.
- "~N jours" avec code couleur : rouge si `< 7`, orange si `< 14`, vert si `>= 14`.
- "—" (neutre) si `days_until_stockout === null` (pas d'estimation possible).

## Hors périmètre

- Pas de notification automatique (email/webhook) sur rupture imminente pour cette v1 — affichage informatif uniquement, le vendeur consulte la page quand il veut.
- Pas de réglage de fenêtre par boutique (14 jours fixe pour cette v1).
- Pas de prise en compte des sous-variantes (`VariantSubOption`) dans le calcul du rythme de vente — même simplification que le reste d'`InventoryListView` aujourd'hui, qui ne descend pas à ce niveau.

## Tests

- Backend : `products/stock_forecast.py` — rythme correct sur des mouvements de stock connus, `None` sans vente récente, `0` explicite si stock déjà épuisé (pas de test de division par zéro qui planterait). `InventoryListView` — les 2 nouveaux champs apparaissent sur chaque ligne, cohérents avec des `StockMovement` de test insérés, granularité produit vs variante respectée (une vente sur une variante n'affecte pas le rythme calculé pour une autre variante du même produit).
- Frontend : `StockPage.jsx` — nouvelle colonne affichée avec le bon code couleur selon les 3 cas (épuisé / urgent / pas d'estimation).
