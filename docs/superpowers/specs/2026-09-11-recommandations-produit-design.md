# Recommandations produit — Design

Date : 2026-09-11
Statut : approuvé par l'utilisateur

## Contexte

Nouveau chantier IA (indépendant des 4 précédents déjà en prod : Assistant vendeur, Chatbot boutique publique, Détection de risque, Analyse prédictive). Objectif double : recommandations produit côté boutique publique (augmenter le panier moyen) **et** recommandations d'action côté vendeur (quoi mettre en avant, quoi surveiller). Même philosophie que tous les chantiers précédents : **le calcul est 100% déterministe**, un LLM n'intervient que pour rédiger une explication en langage naturel à partir de chiffres déjà calculés, jamais pour inventer un chiffre.

## Moteur de calcul (`backend/products/recommendations.py`)

Module pur, aucune I/O réseau, aucun appel IA — 5 fonctions :

- **`co_purchased_products(store, product_id, limit=4)`** — compte les paires de produits apparaissant dans les mêmes commandes (`OrderItem`, jointes sur `Order`), sur les commandes **réelles** uniquement : `store.orders.exclude(status__in=['duplicate', 'fake'])` (même définition que « Commandes réelles » du tableau de bord analytique). Seuil minimum **2 co-occurrences** pour éviter le bruit sur une boutique avec peu d'historique. Retourne les produits classés par nombre de co-occurrences décroissant.
- **`similar_products(store, product, limit=4)`** — repli si `co_purchased_products` ne renvoie rien (ou pas assez pour atteindre `limit`) : produits de la **même catégorie** avec un prix à **±30%** du produit de référence, classés par proximité de prix, en excluant le produit lui-même et ceux déjà retenus par `co_purchased_products`.
- **`recommended_products_for(store, product, limit=4)`** — combine les deux : `co_purchased_products` en premier, complété par `similar_products` jusqu'à `limit` si besoin. C'est la fonction consommée par la fiche produit boutique publique.
- **`cart_recommendations(store, product_ids_in_cart, limit=4)`** — agrège `co_purchased_products` pour **chaque** produit du panier (somme des compteurs de co-occurrence sur les produits candidats), exclut les produits déjà dans le panier, retombe sur `similar_products` du premier article du panier si l'agrégat est vide. Consommée par le panier/checkout.
- **`products_to_promote(store, limit=10)`** — score déterministe par produit actif avec `cost_price` renseigné et `total_stock > 0` : `score = marge_pct × total_stock / (1 + rythme_vente_14j)`, où `marge_pct = (price - cost_price) / price` et `rythme_vente_14j` = unités vendues sur les 14 derniers jours (même requête groupée sur `StockMovement reason='order_sale'` que `stock_forecast.py`). Classé par score décroissant — favorise marge forte + stock disponible + faible vélocité récente (candidats à pousser en promo/mise en avant).
- **`trending_products(store, limit=10)`** — pour chaque produit actif avec au moins une vente sur les 14 derniers jours : `rythme_recent` (7 derniers jours) vs `rythme_prior` (7 jours précédents), `growth = rythme_recent - rythme_prior`. Ne retient que les produits en croissance strictement positive (`growth > 0`), classés par `growth` décroissant.
- **`bundle_suggestions(store, limit=10)`** — top paires de produits par nombre de co-occurrences, calculées une fois sur toute la boutique (pas liées à un produit précis) — même seuil minimum de 2 occurrences que `co_purchased_products`, dont c'est en fait une vue agrégée à l'échelle boutique plutôt que par produit.

## Backend — endpoints

**Boutique publique** (aucune authentification, comme le reste de `products/public_urls.py`) :
- `GET /api/public/store/<slug>/products/<id>/recommendations/` — `recommended_products_for()`, retourne des cartes produit au même format que `PublicProductListView` (nom, prix, image, slug).
- `POST /api/public/store/<slug>/cart-recommendations/` — reçoit `{product_ids: [...]}` (le panier vit côté client, `CartContext`/`localStorage, pas de panier serveur) → `cart_recommendations()`.

**Dashboard** (nouvelle permission `recommendations_view`, catégorie IA du catalogue — masquée par défaut confirmateur/dropshipper, même convention que `stats_forecast_view`) :
- `GET /api/products/recommendations/promote/` — `products_to_promote()`.
- `GET /api/products/recommendations/trending/` — `trending_products()`.
- `GET /api/products/recommendations/bundles/` — `bundle_suggestions()`.
- `POST /api/products/recommendations/<product_id>/explain/?type=promote|trending` — génère l'explication IA à la demande (voir section IA ci-dessous). `product_id` cible le produit concerné ; `type` indique quelle facette expliquer (une explication "à mettre en avant" est différente d'une explication "tendance"). Pour un bundle (paire de produits), `POST /api/products/recommendations/bundle-explain/` avec `{product_id_a, product_id_b}`.

## Rôle de l'IA — explication à la demande, jamais de calcul

Un bouton « Pourquoi ce produit ? » sur chaque ligne des 3 sections dashboard déclenche l'appel d'explication correspondant. Le prompt reçoit **uniquement** les chiffres déjà calculés :
- *À mettre en avant* : `marge_pct`, `total_stock`, `rythme_vente_14j`.
- *Tendance* : `rythme_recent`, `rythme_prior`, `growth`.
- *Bundle* : les deux noms de produits + le nombre de co-occurrences.

Jamais l'historique brut des commandes, même garde-fou anti-invention que l'explication du score de risque (chantier 3). **Contrairement au risque (mis en cache indéfiniment sur `Order.risk_explanation`), ces chiffres évoluent chaque jour** — pas de cache, régénérée à chaque clic. Dégradation `503` explicite si le fournisseur IA est indisponible (même philosophie que tous les appels IA précédents), jamais un blocage de l'affichage des recommandations elles-mêmes (qui restent visibles même si l'explication échoue).

## Frontend

- **`StorefrontProductPage.jsx`** — nouvelle section "Vous pourriez aussi aimer" en bas de fiche produit, cartes produit cliquables (réutilise le composant carte produit existant du storefront).
- **Panier/checkout** — section "Souvent achetés ensemble" basée sur le contenu actuel du panier (`CartContext`), affichée sur la page panier et/ou en première étape du checkout.
- **`pages/orders/RecommendationsPage.jsx`** (nouveau, `/dashboard/recommandations`, sous le menu **IA** de la sidebar, à côté de "Assistant IA"/"Prévision de ventes"/"Prévision de taux de retour") — 3 sections repliables (À mettre en avant / Tendance / Bundles), chaque ligne avec ses chiffres bruts affichés + bouton "Pourquoi ce produit ?" qui affiche l'explication générée.

## Hors périmètre

- Pas de personnalisation par visiteur (pas de compte client identifié sur le storefront — recommandations calculées au niveau produit/panier, jamais par historique individuel d'un visiteur).
- Pas de A/B testing des recommandations (mesurer l'impact réel sur le panier moyen n'est pas dans ce chantier).
- Pas d'action automatique déclenchée par une recommandation (ex: appliquer une promo automatiquement sur un produit "à mettre en avant") — affichage informatif uniquement, le vendeur décide, même principe que la détection de risque et les prévisions.

## Tests

- Backend : `products/recommendations.py` — chaque fonction sur des données connues (paires co-achetées correctement comptées, seuil de 2 respecté, repli similarité quand aucun achat, exclusion des commandes duplicate/fake, formule de score `products_to_promote` vérifiée, `trending_products` ne retient que la croissance positive, `bundle_suggestions` symétrique — la paire (A,B) compte comme (B,A)). Endpoints — gating `recommendations_view`, format de réponse public vs dashboard, dégradation IA sur l'explication.
- Frontend : rendu des 3 sections dashboard, bouton d'explication, section storefront fiche produit + panier avec repli si aucune recommandation disponible (masquée plutôt qu'affichée vide).
