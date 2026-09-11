# Audit global de la boutique — Design

Date : 2026-09-11
Statut : approuvé par l'utilisateur

## Contexte

2ème chantier de la vague "recommandations" (après les recommandations produit, déjà livrées). Demande explicite de l'utilisateur : une section générée par IA qui dit « ce qui est bien, ce qui ne l'est pas, ce qu'il faut ajouter/enlever/faire », avec un score. Même philosophie que tous les chantiers IA précédents : **aucun calcul par un LLM** — les 4 scores de dimension et le score global sont 100% déterministes, l'IA ne fait que rédiger une synthèse en langage naturel à partir de ces chiffres déjà calculés, jamais inventer une donnée.

## Calcul des scores (`backend/stores/audit.py`)

Module pur, aucune I/O réseau, aucun appel IA. Chaque dimension retourne un score 0-100 (arrondi) + le détail chiffré brut qui l'a produit (consommé ensuite par le prompt IA et affiché tel quel côté frontend) :

- **Catalogue** (`_catalogue_score(store)`) — moyenne de 4 taux sur les produits `is_active=True` de la boutique : % avec au moins une `ProductImage`, % avec `description` non vide, % avec `cost_price` renseigné, % avec au moins une `Category`. `score = round(moyenne_des_4_taux * 100)`. Boutique sans aucun produit actif → `None` (pas de division par zéro déguisée, cohérent avec le repli déjà utilisé par `sales_forecast`/`returns_forecast` sur historique insuffisant).
- **Confirmation & logistique** (`_logistics_score(store)`) — sur les commandes créées dans les 30 derniers jours, hors `duplicate`/`fake` (réutilise `orders.stats_views.REAL_EXCLUDED_STATUSES`) : `confirmation_rate = confirmées(confirmed/shipped/delivered) / total * 100` (réutilise `orders.stats_views.CONFIRMED_STATUSES`), `late_ratio = commandes 'pending' depuis plus de 24h / total pending`. `score = round(confirmation_rate * (1 - late_ratio * 0.5))`, clampé [0, 100]. Aucune commande sur la période → `None`.
- **Stock** (`_stock_score(store)`) — sur les produits actifs : `out_of_stock_ratio` (stock total à 0), `low_stock_ratio` (stock total ≤ `StoreSettings.low_stock_threshold`, hors ceux déjà à 0). `score = round(100 - out_of_stock_ratio * 70 - low_stock_ratio * 30)`, clampé [0, 100]. Aucun produit actif → `None`.
- **Retours & clients à risque** (`_returns_risk_score(store)`) — `return_rate` sur 30 jours (même définition que `orders.stats_views.ReturnsStatsView`), `untreated_risk_ratio` = clients auto-détectés à risque (`risky_count >= StoreSettings.risk_threshold_orders` sur `StoreSettings.risk_period_days`) mais **jamais marqués manuellement** (`CustomerRisk.manual_risk=False` ou absence de ligne) ÷ total clients auto-détectés à risque, `loss_ratio` = produits actifs avec `cost_price` renseigné où `price < cost_price` ÷ produits actifs avec `cost_price` renseigné. `score = round(100 - return_rate * 0.5 - untreated_risk_ratio * 30 - loss_ratio * 20)`, clampé [0, 100]. Aucune commande sur 30 jours **et** aucun client à risque **et** aucun produit avec `cost_price` → `None`.

`compute_store_audit(store) -> dict` — orchestre les 4, calcule `global_score = round(moyenne des scores non-None)` (ignore les dimensions à `None`, jamais un 0 pénalisant à tort une boutique neuve), retourne `{'global_score': int|None, 'dimensions': {'catalogue': {...}, 'logistics': {...}, 'stock': {...}, 'returns_risk': {...}}}` où chaque dimension porte `{'score': int|None, 'details': {...chiffres bruts...}}`.

## Modèle `stores.StoreAudit`

```python
store = OneToOneField(Store)
computed_at = DateTimeField(auto_now=True)
global_score = PositiveSmallIntegerField(null=True)
catalogue_score = PositiveSmallIntegerField(null=True)
logistics_score = PositiveSmallIntegerField(null=True)
stock_score = PositiveSmallIntegerField(null=True)
returns_risk_score = PositiveSmallIntegerField(null=True)
details = JSONField(default=dict)   # le détail brut des 4 dimensions, tel que retourné par compute_store_audit()
synthesis = TextField(blank=True)   # texte IA (points forts / points faibles / recommandations)
```

Une seule ligne par boutique (`OneToOneField`), écrasée à chaque nouveau calcul — pas d'historique des audits passés en v1 (hors périmètre, voir plus bas).

## Backend — endpoints

Nouvelle permission `store_audit_view` (catalogue IA, masquée par défaut confirmateur/dropshipper, même convention que `recommendations_view`).

- `GET /api/stores/me/audit/` — renvoie le dernier `StoreAudit` sauvegardé (`404` si aucun calcul n'a encore été fait pour cette boutique — le frontend affiche alors directement l'état "pas encore analysé", pas une erreur).
- `POST /api/stores/me/audit/` — recalcule les 4 scores (`compute_store_audit`), génère la synthèse IA (`ai_assistant.ollama_client.generate()`, prompt construit à partir des scores + détails, jamais l'historique brut), upsert le `StoreAudit`, retourne le résultat complet. `503` explicite si le fournisseur IA est indisponible — dans ce cas **les scores sont quand même sauvegardés** (`synthesis` vide), pour ne pas perdre le calcul déterministe à cause d'une panne IA ponctuelle ; le frontend affiche les scores avec un message "Synthèse indisponible, réessayer".

## Rôle de l'IA

Prompt unique par clic "Analyser" — reçoit uniquement les 4 scores + leurs détails chiffrés (ex: "23% des produits actifs n'ont pas d'image", "taux de retour 12% sur 30 jours"), consigne stricte : ne jamais inventer de donnée non fournie, rester concis. Sortie structurée demandée au modèle en 3 blocs texte : **Points forts** (2-3 phrases), **Points faibles** (2-3 phrases), **Recommandations** (liste de 2-4 actions concrètes, une par point faible significatif). Le texte brut est stocké tel quel dans `StoreAudit.synthesis` (pas de parsing structuré côté serveur — le frontend affiche le texte formaté, cohérent avec la simplicité des autres explications IA du projet qui sont toutes du texte libre).

## Frontend

Nouvelle page `pages/orders/StoreAuditPage.jsx`, route `/dashboard/audit-boutique`, sous le menu **IA** de la sidebar (à côté de "Recommandations"), permission `store_audit_view`.

- État vide (aucun `StoreAudit` en base, `404`) : bouton "Analyser ma boutique".
- État rempli : score global en grand (badge coloré 3 bandes, même convention que `RiskScoreBadge` — rouge <50, orange <75, vert ≥75), 4 cartes de score par dimension (Catalogue / Confirmation & logistique / Stock / Retours & clients à risque) avec leur détail chiffré résumé, section synthèse IA (points forts/faibles/recommandations), date du dernier calcul ("Analysé il y a 2h"), bouton "Réanalyser".
- Chaque recommandation de la synthèse n'est **pas** parsée en liens cliquables individuels (texte libre IA, pas de structure fiable à parser) — à la place, les 4 **cartes de dimension** portent chacune un lien statique pré-déterminé vers la page dashboard pertinente : Catalogue → `/dashboard/produits`, Confirmation & logistique → `/dashboard/commandes`, Stock → `/dashboard/stock`, Retours & clients à risque → `/dashboard/clients/risque`. Pas de nouveau filtre profond (ex: "produits sans image") ajouté aux pages existantes — hors périmètre, choix YAGNI déjà validé.

## Hors périmètre

- Pas d'historique des audits passés (une seule ligne par boutique, écrasée à chaque recalcul) — pourrait être ajouté plus tard si le besoin de suivre l'évolution du score dans le temps se confirme.
- Pas de recalcul automatique planifié (cron/Tâches Windows) — uniquement à la demande, décision déjà actée.
- Pas de pondération configurable des 4 dimensions dans le score global — moyenne simple fixe en v1.
- Pas de nouveaux filtres profonds sur les pages existantes (ex: filtre "produits sans image" sur `ProductsPage.jsx`) — les liens des cartes de dimension pointent vers la page générale, pas une vue pré-filtrée sur mesure.

## Tests

- Backend : `stores/audit.py` — chaque score vérifié sur des données connues (catalogue avec/sans produits complets, confirmation avec commandes en retard, stock avec ruptures, retours/risque avec clients non traités et produits vendus à perte), repli `None` sur données insuffisantes par dimension, `global_score` ignore les dimensions `None`. Endpoints — `404` sans audit préalable, `POST` sauvegarde même si l'IA échoue (scores présents, `synthesis` vide, `503`), gating de permission.
- Frontend : état vide avec bouton "Analyser", état rempli avec les 4 cartes + synthèse, gestion de l'échec IA (scores affichés quand même), liens des cartes vers les bonnes pages.
