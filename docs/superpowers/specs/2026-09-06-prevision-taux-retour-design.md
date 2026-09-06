# Prévision de taux de retour — Design

Date : 2026-09-06
Statut : approuvé par l'utilisateur

## Contexte

2ème et dernier sous-chantier restant de l'analyse prédictive (avec la prévision de rupture de stock, déjà livrée). Même philosophie que les 2 précédentes prévisions : **aucun calcul par un LLM**, calcul déterministe, moyenne mobile pondérée par jour de la semaine, fourchette basse/haute systématique — jamais un chiffre présenté comme une certitude.

Définition du taux de retour réutilisée telle quelle depuis l'existant (`orders/stats_views.py::ReturnsStatsView`) : `retour_rate = commandes au statut 'returned' / total des commandes créées sur la période × 100`. Pas de nouvelle définition inventée pour ce chantier.

## Calcul (`orders/returns_forecast.py`)

Même architecture que `orders/sales_forecast.py::compute_sales_forecast()`, adaptée au taux plutôt qu'au volume :

```python
def compute_returns_forecast(store, horizon_days) -> dict | None:
    """None si l'historique est insuffisant (< MIN_HISTORY_DAYS)."""
```

- `MIN_HISTORY_DAYS = 30` — plus long que la prévision de ventes (14 jours) : un retour prend du temps à se matérialiser après la création de la commande, un historique court sous-estimerait le taux sur les jours récents (commandes encore en transit, pas encore "retournées").
- Historique agrégé **par jour** : pour chaque jour passé, `{orders: nb commandes créées ce jour, returned: nb parmi elles au statut 'returned' actuellement}` — même requête groupée que `ReturnsStatsView` (`created_at__date`), pas une nouvelle notion.
- Pour chaque jour futur de l'horizon demandé : les occurrences du même jour de semaine sur les 4 dernières semaines sont **sommées** (pas moyennées individuellement) avant de calculer le ratio — `taux = Σ(returned pondéré) / Σ(orders pondéré) × 100`, pondération `[4, 3, 2, 1]` (plus récent = poids fort), identique à `WEEKDAY_WEIGHTS` de la prévision de ventes. Sommer avant de diviser évite le bruit d'un taux calculé sur un jour à faible volume (ex: 1 commande retournée sur 2 commandes ce jour-là → 50%, alors que sur la semaine c'est 5/40 → 12%).
- Tendance : delta entre le taux agrégé des 14 derniers jours et celui des 14 jours précédents (mêmes bornes que la prévision de ventes), appliqué proportionnellement au nombre de semaines d'écart avec le jour prévu.
- Fourchette basse/haute : écart-type (`statistics.pstdev`) des taux quotidiens observés sur les occurrences utilisées (retombe sur ±30 % du taux si une seule occurrence disponible, même repli que la prévision de ventes).
- Le taux prévu est toujours **clampé entre 0 et 100** (jamais négatif, jamais > 100 même avec un ajustement de tendance agressif).

## Backend

Nouvelle vue `orders/stats_views.py::ReturnsForecastView` — même squelette que `SalesForecastView` (import paresseux de `compute_returns_forecast` dans `get()` pour éviter l'import circulaire déjà rencontré sur `sales_forecast.py`), horizon clampé 7-60 jours.

`GET /api/orders/stats/returns-forecast/?horizon=<jours>` — réponse :

```json
{"history_days": 45, "points": [{"date": "2026-09-07", "predicted_rate": 8.4, "rate_low": 5.1, "rate_high": 11.7}, ...]}
```

Nouvelle permission `stats_returns_forecast_view` (catalogue `team/models.py`, même catégorie "Statistiques" que `stats_forecast_view`), masquée par défaut confirmateur/dropshipper.

## Frontend

Nouvelle page `pages/orders/stats/ReturnsForecastPage.jsx` — même structure que `SalesForecastPage.jsx` (curseur d'horizon 7-60 jours, recharts `AreaChart`, tableau détaillé), mais une seule courbe (taux de retour prévu) au lieu de deux séries (commandes/revenu). Bandeau d'avertissement identique : « Estimation statistique basée sur votre historique — pas une garantie. »

Rejoint le menu **IA** de la sidebar (à côté de "Prévision de ventes"), pas Statistiques — décision déjà actée pour toute future fonctionnalité IA/prévision (voir `CLAUDE.md`, section `components/DashboardLayout.jsx`).

## Hors périmètre

- Pas de ventilation par produit/wilaya/transporteur (juste le taux global de la boutique, comme la prévision de ventes reste globale).
- Pas d'alerte automatique si le taux prévu dépasse un seuil — affichage informatif uniquement, cohérent avec la décision déjà prise sur la rupture de stock (pas de notification automatique en v1).

## Tests

- Backend : `orders/returns_forecast.py` — taux pondéré vérifié sur des données connues (sommer avant diviser, pas moyenne de taux bruités), tendance, fourchette jamais hors [0, 100], historique < 30 jours → `None`. `ReturnsForecastView` — clamp d'horizon, gating de permission.
- Frontend : `ReturnsForecastPage.jsx` — rendu du curseur, appel avec le bon horizon, affichage du tableau/graphique, gestion d'un historique insuffisant (message explicite plutôt qu'un graphique vide silencieux).
