# Optimisation des fonctionnalités IA — recherche, filtres, organisation, assistant élargi

Date : 2026-09-11
Statut : approuvé par l'utilisateur

## Contexte

Demande de l'utilisateur en 3 volets, après les 7 chantiers IA déjà livrés :
1. Recherche/filtres sur les pages IA qui en manquent réellement.
2. Réorganisation du menu IA de la sidebar (7 liens à plat actuellement).
3. Élargissement de l'Assistant IA (chat) à de nouveaux domaines de données.

Même philosophie que tous les chantiers précédents pour le point 3 : chaque nouvel outil IA réplique **exactement** la formule de permission de son endpoint REST équivalent, ne renvoie jamais une donnée que l'utilisateur ne pourrait pas déjà voir dans l'UI normale, et ne calcule jamais un chiffre — il réutilise un calcul déjà existant (vue REST ou module de calcul déterministe d'un chantier précédent).

## Volet 1 — Recherche/filtres (3 pages, uniquement côté client)

Les 6 autres pages IA sont soit des vues uniques (Prévision de ventes/retours, Audit boutique) soit ont déjà leurs filtres via une page existante (Prévision de rupture de stock → `StockPage.jsx`, Détection de risque → `OrdersPage.jsx`/`AtRiskCustomersPage.jsx`) — hors périmètre, aucun changement.

- **`RecommendationsPage.jsx`** — un champ de recherche unique en haut de page, filtre par nom de produit dans les 3 sections (`promote`/`trending`/`bundles`) simultanément. Purement côté client (les listes sont déjà chargées en entier, limitées à 10 éléments par section côté serveur — pas de nouvel appel réseau).
- **`ConfirmateurMonitoringPage.jsx`** — champ de recherche par nom + menu déroulant "Tous / Avec alerte / Sans alerte" (`row.flags.length > 0`). Côté client, la liste des confirmateurs d'une boutique reste petite (pas de pagination serveur nécessaire).
- **`AIAssistantPage.jsx`** — champ de recherche au-dessus de la liste des conversations, filtre par `conversation.title` (côté client, `ConversationListView` renvoie déjà tout l'historique de l'utilisateur en un seul appel, pas de nouvel endpoint).

## Volet 2 — Organisation du menu IA (`DashboardLayout.jsx`)

Le bloc IA actuel (liste plate de 7 liens) devient 3 sous-groupes repliables, même mécanique que les groupes "Statistiques"/"Expéditions & Retours" déjà présents (état `expanded` par groupe, chevron) :

- **Assistant** : Assistant IA
- **Prévisions** : Prévision de ventes, Prévision de rupture de stock *(lien direct vers `/dashboard/stock`, inchangé)*, Prévision de taux de retour
- **Analyse** : Recommandations, Audit de la boutique, Suivi des confirmateurs

**Correctif inclus** (bug signalé par l'utilisateur) : `/dashboard/stats/previsions` et `/dashboard/stats/previsions-retours` restent aujourd'hui sous le chemin `/dashboard/stats/...` alors que ces deux pages vivent dans le menu IA depuis leur chantier respectif — l'état replié/déplié de la sidebar (`expanded.stats = location.pathname.startsWith('/dashboard/stats')`, `DashboardLayout.jsx`) se déclenche donc à tort et ouvre/scrolle vers le groupe "Statistiques" au lieu du groupe IA. Renommés en `/dashboard/previsions-ventes` et `/dashboard/previsions-retours` (routes `App.jsx`, liens sidebar) pour sortir de ce préfixe et éliminer la collision à la source — aucune autre référence à ces chemins ailleurs dans le projet (à vérifier avant d'exécuter le renommage).

Aucun autre changement de route ni de permission — uniquement la structure visuelle de la sidebar + ce correctif de chemin.

## Volet 3 — Élargissement de l'Assistant IA (`ai_assistant/tools.py`)

9 nouveaux outils (le 10ème du brainstorm, `search_products`, est absorbé dans `get_inventory` déjà existant pour éviter un doublon — voir ci-dessous), chacun avec la formule de permission stricte `is_owner_or_admin(request) or has_permission(request, '<clé>')` :

- **`get_inventory` (étendu, pas nouveau)** — ajoute `price` et `is_active` à chaque produit retourné (actuellement seulement `name`/`stock`), permission `stock_view` inchangée. Évite un outil `search_products` redondant avec celui-ci.
- **`get_incomplete_products`** — produits actifs sans image/description/prix d'achat/catégorie, réutilise `stores.audit._catalogue_score()` (import direct de la fonction, pas de duplication de logique), permission `products_view`.
- **`get_team_summary`** — liste des membres actifs (nom, rôle, en ligne ou non), permission `team_view`.
- **`get_confirmateur_performance(name)`** — résout le confirmateur par nom (recherche insensible à la casse), réutilise `team.monitoring.compute_confirmateur_detail()`, permission `confirmateur_monitoring_view`.
- **`get_returns_summary`** — taux de retour sur une période, réutilise `orders.stats_views.ReturnsStatsView` (même shim que `get_profitability_summary` pour `ProfitabilitySummaryView`), permission `stats_returns_view`.
- **`get_pending_exchanges`** — échanges (`orders.ExchangeRequest`) au statut `open`, permission `exchanges_view`.
- **`get_open_complaints`** — nombre de conversations `inbox.Conversation` au statut `open`/`in_progress`, permission `inbox_view`.
- **`get_costs_summary`** — coûts enregistrés (`finance.Cost`) sur une période, ventilés par catégorie, permission `finances_view`.
- **`get_payments_summary`** — indicateurs COD prêts/récupérés, réutilise `finance.views.PaymentsSummaryView` (même pattern shim), permission `finances_view` (même permission que la page Paiements existante).
- **`get_subscription_status`** — quota restant, jours d'essai, palier actuel — **owner/admin strict**, aucune permission de vue à vérifier (cohérent avec la page Abonnement existante, volontairement non configurable, donnée de facturation sensible).

Chaque outil ajouté à `TOOL_REGISTRY`/`TOOL_DEFINITIONS` suit exactement le même format que les 5 existants (description concise en français, `parameters` JSON Schema). Aucun changement à `chat_loop.py`/`ChatView` — le mécanisme de tool-calling déjà en place absorbe les nouveaux outils sans modification.

## Hors périmètre

- Pas de pagination serveur sur les 3 pages du volet 1 — les volumes actuels (10 éléments/section, liste des confirmateurs d'une boutique) ne le justifient pas.
- Pas de nouvel endpoint REST créé pour le volet 3 — chaque nouvel outil réutilise une vue/un module déjà existant, jamais une nouvelle requête à la base non déjà exposée ailleurs.
- Pas de recherche plein texte côté serveur sur les conversations (le volume par utilisateur reste faible, un filtre client suffit).

## Tests

- Frontend : filtre de recherche sur les 3 pages (résultat filtré affiché, résultat vide géré), menu IA replié/déplié par groupe, chaque lien toujours gaté par sa permission existante (pas de régression sur `App.test.jsx`).
- Backend : chaque nouvel outil testé comme les 5 existants — permission refusée (403 implicite via `_forbidden()`) sans la clé requise, résultat correct sur données connues, `get_inventory` étendu vérifié avec `price`/`is_active` en plus de `name`/`stock` (pas de régression sur les tests existants de cet outil).
