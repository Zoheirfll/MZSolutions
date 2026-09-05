# Prévision de ventes — Design

Date : 2026-09-05
Statut : approuvé par l'utilisateur

## Contexte

4ème et dernier chantier IA (sur 4 planifiés, voir `docs/superpowers/specs/2026-09-04-assistant-ia-ollama-design.md`). Le périmètre "analyse prédictive (ventes/stock/retours)" a été décomposé en 3 sous-chantiers indépendants ; celui-ci couvre uniquement la **prévision de ventes**. Stock et retours feront l'objet de specs séparés si demandés plus tard.

## Décision de conception centrale

Même philosophie que le score de risque (chantier 3) : **aucun calcul par un LLM**. Une prévision est un calcul statistique déterministe, reproductible, gratuit — un LLM ne fait qu'halluciner un chiffre plausible sans base réelle. Ce chantier n'utilise donc **aucun appel IA** (contrairement aux 3 précédents) : les chiffres et la fourchette d'incertitude parlent d'eux-mêmes, un texte généré n'ajouterait rien qu'une vraie donnée statistique n'exprime déjà.

Décision produit explicite (l'utilisateur a demandé une "prédiction parfaite ajustable") : **aucune méthode statistique n'est parfaite**, en particulier avec un historique limité (petite boutique, quelques semaines de données). La réponse retenue : un horizon **ajustable** par le vendeur (7 à 60 jours) plutôt qu'un chiffre figé, et une **fourchette basse/haute** affichée systématiquement à côté de la valeur centrale — jamais un chiffre unique présenté comme une certitude.

## Méthode de calcul (`orders/sales_forecast.py`)

Moyenne mobile pondérée **par jour de la semaine** (un lundi se compare aux lundis précédents, pas à la moyenne globale — évite qu'un pic de week-end fausse un jour de semaine), ajustée par la tendance récente :

1. Pour chaque jour cible de l'horizon demandé, identifier son jour de la semaine (0=lundi...6=dimanche).
2. Prendre les 4 dernières occurrences de ce jour de la semaine dans l'historique réel (commandes déjà passées, pas les commandes prévues).
3. Moyenne pondérée : poids `[4, 3, 2, 1]` en partant de la plus récente occurrence vers la plus ancienne (la plus récente compte le plus).
4. Tendance : `delta = (moyenne des 2 dernières semaines complètes) - (moyenne des 2 semaines précédentes)`, appliqué proportionnellement au nombre de semaines entre l'historique et le jour prévu (l'effet de la tendance s'accumule plus on prévoit loin).
5. Fourchette : `± écart-type` des valeurs historiques utilisées à l'étape 2, plancher à 0 (jamais de borne basse négative pour un nombre de commandes).

Calculé pour deux métriques en parallèle avec la même méthode : nombre de commandes (`Order.objects.filter(status__in=CONFIRMED_STATUSES)`, cohérent avec le reste des stats du projet) et chiffre d'affaires (`Sum('total')` sur le même filtre).

**Garde-fou données insuffisantes** : si la boutique a moins de 14 jours d'historique de commandes, retourne une erreur explicite (`400`) plutôt qu'une prévision peu fiable calculée sur presque rien — mieux vaut ne rien afficher qu'afficher un chiffre trompeur.

## API

`GET /api/orders/stats/forecast/?horizon_days=<7-60>` — même conventions que les 9 vues de stats existantes (`StatsPermissionMixin`, `orders/stats_views.py`) :

- Nouvelle permission `stats_forecast_view` dans le catalogue (`team/models.py`), même règle que le reste : ajoutée à `PERMISSION_CATALOG`, `PERMISSION_CATEGORIES` (catégorie "Ventes & finances" → sous-catégorie "Statistiques", à côté des 9 autres clés `stats_*`), `DEFAULT_PERMISSIONS['confirmateur']`/`['dropshipper']` à `False`.
- `horizon_days` validé côté serveur (entre 7 et 60 inclus — clamp ou 400 si hors bornes, à trancher lors de l'implémentation en faveur du clamp pour ne jamais bloquer l'utilisateur sur une valeur limite).
- Réponse : `{history_days: int, points: [{date, predicted_orders, orders_low, orders_high, predicted_revenue, revenue_low, revenue_high}, ...]}`.
- Historique insuffisant → `400 {"detail": "Historique insuffisant pour une prévision fiable (14 jours minimum)."}`.

## Frontend

Nouvelle page `pages/orders/stats/SalesForecastPage.jsx`, à côté des 8 pages de stats existantes (Epic 8.1, même dossier `pages/orders/stats/`) :

- Curseur d'horizon (7 à 60 jours, valeur par défaut 7).
- Graphique à 2 courbes (commandes, CA) avec zone d'incertitude ombrée (fourchette basse/haute) — `recharts`, déjà utilisé ailleurs dans le projet (`AreaChart`/`Area`, même pattern que `DeliveriesTab.jsx`).
- Tableau détaillé par jour en dessous du graphique (date, commandes prévues + fourchette, CA prévu + fourchette).
- Bandeau explicite en haut de page : "Estimation statistique basée sur votre historique — pas une garantie. Précision meilleure avec plus d'historique et un horizon court."
- Lien sidebar sous "Statistiques" (owner/admin ou `stats_forecast_view`), route `/dashboard/commandes/stats/previsions`.

## Hors périmètre

- Prévision par produit individuel (uniquement une vue globale boutique pour cette v1).
- Prévision de stock/rupture et de taux de retour (sous-chantiers séparés, non traités ici).
- Aucune explication IA (décision explicite ci-dessus — les chiffres + fourchette suffisent, pas de valeur ajoutée à un texte généré).

## Tests

- Backend : `orders/sales_forecast.py` — moyenne pondérée correcte sur données connues (calcul à la main vérifié dans le test), tendance qui augmente/diminue la prévision selon le sens de l'évolution récente, fourchette qui s'élargit avec la variance historique, plancher à 0 jamais négatif, erreur explicite sous 14 jours d'historique. Vue : gating de permission, horizon hors bornes clampé, réponse bien formée sur un historique réaliste (plusieurs semaines de commandes de test).
- Frontend : `SalesForecastPage.jsx` — curseur change l'horizon et redéclenche l'appel, affichage du bandeau d'avertissement, gestion de l'erreur "historique insuffisant" sans crash.
