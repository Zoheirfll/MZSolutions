# Plan — Refonte du tableau de bord analytique (4 onglets)

> Analyse faite sur 4 captures du concurrent RiseCart (`admin.risecart.app/admin`).
> Décisions produit validées par l'utilisateur le 2026-08-12 — voir section « Décisions figées ».
> Branche : `epic-yalidine-tests-reels` (ou nouvelle branche dédiée).

---

## Décisions figées (validées, ne pas re-poser la question)

| Sujet | Décision |
|---|---|
| Carte d'Algérie | **Oui**, vraie carte SVG cliquable (clic wilaya → filtre le dashboard) |
| Écarts de livraison / Frais de confirmation / Autres dettes | **Saisie manuelle** via le modèle `finance.Cost` existant, en ajoutant des catégories |
| Remplacement | **Remplace entièrement** `Dashboard.jsx` (la page `/dashboard`), en gardant le bandeau de quota d'essai déjà présent |
| « Commandes réelles » | **Total − (double + fictive)** |

---

## Ce qui existe déjà (à réutiliser, ne pas réécrire)

- `orders/stats_views.py` : `GlobalStatsView`, `OrdersStatsDetailView`, `WilayaStatsView`, `SourceStatsView`, `ConfirmationRateView`, + helpers `_pct_delta()`, `_csv_response()`, `StatsPermissionMixin`, constantes `CONFIRMED_STATUSES` / `PROCESSED_STATUSES`
- `orders/utils.py` : `parse_period()` (contrat période partagé), `previous_period()`, `order_channel()` (canal de vente canonique)
- `finance/views.py::ProfitabilitySummaryView` : revenus, coût produit, commission, coûts opérationnels/marketing, `net_profit`
- `frontend/src/pages/orders/stats/statsShared.jsx` : `usePeriod()` / `PeriodFilter` (⚠️ `queryString` est mémoïsé — ne pas casser, cf. bug de boucle infinie Epic 8.1), `Spinner`, `money()`, `PIE_COLORS`
- `recharts` 3.9 déjà installé · `xlsx` + `jspdf` déjà installés · `frontend/src/data/wilayas.js` (58 wilayas id+nom) · `backend/orders/wilaya_codes.py::wilaya_code(name)`
- Les 18 statuts de `STATUS_CHOICES` (dont `duplicate` / `fake`, ajoutés le 2026-08-12)

**~70 % de la donnée existe déjà** — l'essentiel du travail est l'agrégation en un endpoint par onglet + la présentation.

---

## Backend

### 1. Étendre `finance.Cost` (à faire en premier — les autres étapes en dépendent)

`CATEGORY_CHOICES` passe de `operational | marketing` à :

```
operational          Coût opérationnel
marketing            Marketing / publicités
delivery_variance    Écarts de livraison
confirmation_fees    Frais de confirmation
return_cost          Coût de retour
other_debts          Autres dettes
```

- Migration de schéma (`alter_field`), pas de migration de données (les lignes existantes restent valides).
- ⚠️ **Effet de bord à traiter** : `ProfitabilitySummaryView` calcule aujourd'hui
  `net_profit = revenue - product_cost - commission - operational - marketing`.
  Les nouvelles catégories sont de **vrais coûts** → elles doivent aussi réduire le profit net.
  Réécrire en sommant **toutes** les catégories de coût, sinon elles seraient silencieusement ignorées.
  Garder le détail par catégorie dans la réponse (le frontend Rentabilité l'affiche déjà par ligne).
- `CostsPage.jsx` : ajouter les 4 nouvelles catégories au filtre et au formulaire.

> Note pour plus tard (hors périmètre) : `return_cost` est **calculable automatiquement** — Noest et Yalidine exposent tous deux un tarif de retour (`retour_fee` / section `return` de `/fees`). On pourrait figer ce montant sur la commande au passage en `returned`. Laissé en saisie manuelle pour l'instant.

### 2. Trois nouveaux endpoints (un par onglet), tous sur `parse_period()`

Les créer dans `orders/stats_views.py` à côté des vues existantes, avec `StatsPermissionMixin` (donc gatés par `is_owner_or_admin OR has_permission('stats_view')` comme les 8 vues de l'Epic 8.1).

#### `GET /api/orders/stats/dashboard/deliveries/`

```json
{
  "funnel": {
    "total": 12, "real": 11, "confirmed": 7, "shipped": 5,
    "real_pct": 91.7, "confirmed_pct": 63.6, "shipped_pct": 71.4
  },
  "secondary": {
    "in_transit": {"count": 3, "pct": 60.0},
    "delivered":  {"count": 2, "pct": 40.0},
    "returned":   {"count": 1, "pct": 20.0},
    "cancelled":  {"count": 1, "pct": 9.1}
  },
  "timeseries": [{"date": "2026-08-01", "total": 3, "real": 3, "confirmed": 2,
                  "shipped": 2, "delivered": 1, "returned": 0}],
  "by_wilaya": [{"wilaya": "Alger", "wilaya_id": 16, "orders_count": 12,
                 "confirmed_count": 4, "revenue": "48000.00"}],
  "by_source": [{"source": "Boutique en ligne", "total": 5, "real": 5,
                 "confirmed_pct": 40.0, "delivered_pct": 20.0,
                 "returned": 1, "cancelled": 0}],
  "by_status": [{"status": "pending", "label": "En attente de confirmation", "count": 5}],
  "previous_period": { …même forme que funnel/secondary… },
  "deltas": {"total": 12.5, "confirmed": null, …}
}
```

Règles de calcul :
- `real = total − (duplicate + fake)` — **décision figée**
- Taux en **entonnoir** (chaque étape rapportée à la précédente, pas au total) :
  `real_pct = real/total` · `confirmed_pct = confirmed/real` · `shipped_pct = shipped/confirmed`
- `in_transit` = statuts entre l'expédition et la livraison (`shipped`, `out_for_delivery`, `in_progress`)
- `by_wilaya` **doit renvoyer `wilaya_id` numérique** (via `wilaya_codes.wilaya_code()`) — c'est la clé de jointure avec la carte SVG, le nom seul ne suffit pas (accents/orthographes variables)
- `by_status` couvre **tous** les `STATUS_CHOICES`, y compris ceux à 0 (les tuiles doivent toutes s'afficher)
- Deltas via `_pct_delta()` + `previous_period()` — **renvoyer `null` quand non calculable**, jamais 0 ni NaN (c'est exactement le bug visible chez RiseCart : « Livré NaN % »)

#### `GET /api/orders/stats/dashboard/revenue/`

Les 8 cartes de l'onglet Revenus :
- `profit` (net), `revenue` (CA) → réutiliser la logique de `ProfitabilitySummaryView` (**factoriser** dans une fonction partagée plutôt que dupliquer le calcul)
- `ads_cost` → `Cost(category='marketing')`
- `delivery_variance`, `confirmation_fees`, `return_cost`, `other_debts` → `Cost` des nouvelles catégories
- `product_debts` → **`SupplierCredit` total − `SupplierPayment` total** (dettes fournisseurs impayées, données déjà en base depuis l'Epic 3.5)

#### `GET /api/orders/stats/dashboard/kpi/`

```json
{
  "top_sources":  [{"source": "…", "orders": 2, "confirmed": 0, "shipped": 0,
                    "delivered": 0, "paid": 0, "returned": 0}],
  "top_wilayas":  [{"wilaya": "…", "wilaya_id": 16, …mêmes colonnes…}]
}
```
- Top **5** chacun, triés par nombre de commandes, + une ligne `Total`
- **Définition de « Payé »** (à documenter dans CLAUDE.md) :
  `status == 'delivered'` (COD encaissé à la livraison) **OU** (`payment_method == 'chargily'` ET `status in CONFIRMED_STATUSES`) — une commande Chargily n'est confirmée qu'après le webhook `checkout.paid`, donc confirmée ⇒ payée.

#### Onglet Confirmation
**Ne rien construire** — brancher directement sur `ConfirmationRateView` (`/api/orders/stats/confirmation/`), qui existe et fonctionne. C'est l'onglet que RiseCart laisse vide.

---

## Frontend

### Structure

`Dashboard.jsx` devient une coquille (bandeau quota + barre de période + onglets). Le reste dans `frontend/src/pages/dashboard/` :

```
Dashboard.jsx            (coquille, remplace l'existant)
dashboard/DeliveriesTab.jsx
dashboard/RevenueTab.jsx
dashboard/ConfirmationTab.jsx
dashboard/KpiTab.jsx
dashboard/GaugeCard.jsx      (carte à jauge circulaire de l'entonnoir)
dashboard/StatusTiles.jsx    (les 18 tuiles de statut)
dashboard/AlgeriaMap.jsx     (carte choroplèthe)
```

### Barre commune
`PeriodFilter` de `statsShared.jsx` (déjà écrit, déjà mémoïsé) + un sélecteur de regroupement (jour/semaine/mois) pour le graphe.

### Onglet Livraisons
- 3 `GaugeCard` (entonnoir) + 4 cartes secondaires avec barre de progression
- Graphe **6 séries** avec recharts (`LineChart` ou `AreaChart`) : Toutes / Réelles / Confirmées / Expédiées / Livrées / Retour
- Cartes par source (Total, Réelles, mini-grille Confirmé % / Livré % / En retour / Annulé)
- `StatusTiles` — **cliquables**, chaque tuile navigue vers `/dashboard/commandes?status=…` (chez RiseCart elles sont décoratives)

### La carte (à faire en **dernier**, c'est le morceau isolé et le plus risqué)

1. **Sourcer la géométrie** : GeoJSON ADM1 Algérie (58 wilayas), **simplifié** (mapshaper) pour rester léger, commité dans `frontend/src/data/algeria-wilayas.geo.json`.
2. **⚠️ Risque principal — la jointure des noms.** Le GeoJSON aura ses propres libellés (souvent anglicisés/translittérés différemment : « Algiers » vs « Alger », « Bejaia » vs « Béjaïa »). Ne **jamais** joindre sur le nom brut : joindre sur le **code numérique 1-58**, en vérifiant que le GeoJSON porte bien ce code ; sinon construire une table de correspondance explicite dans `frontend/src/data/wilayas.js` et la vérifier wilaya par wilaya.
3. **Rendu** : SVG inline avec un `<path>` par wilaya (projection pré-calculée ou `d3-geo`). Éviter d'ajouter une grosse dépendance cartographique si un SVG simple suffit — on ne fait ni zoom ni tuiles.
4. Échelle de couleur alignée sur leur légende (<20, 20-100, 100-200, 200-300, >300) mais en **teintes violettes du thème**, pas en bleu.
5. Clic sur une wilaya → filtre l'ensemble du dashboard sur cette wilaya.

### Points de vigilance thème
- Utiliser `theme.dark.*` / les classes `.text-app-*` / `.bg-app-*` — **zéro couleur codée en dur** (le mode clair est déjà déployé, cf. chantier `2026-07-08-dark-light-theme-infra-design.md`)
- Tableaux : `theme.dark.borderRowHover`, **jamais** la concaténation `theme.dark.border + '44'` (cassée depuis le passage aux variables CSS)
- Aucun `<select>` natif → `components/Select.jsx`

---

## Ordre d'exécution recommandé

1. `finance.Cost` : nouvelles catégories + migration + **`migrate` sur la base de dev** + correction de `ProfitabilitySummaryView` + `CostsPage.jsx`
2. Les 3 endpoints backend + tests
3. Coquille `Dashboard.jsx` + barre de période + onglets vides
4. Onglet Livraisons (sans la carte)
5. Onglets Revenus + KPI + Confirmation
6. La carte d'Algérie
7. Tests frontend + mise à jour de `CLAUDE.md` (modèles, endpoints, définition de « Payé » et de « Commandes réelles »)

---

## Pièges connus (déjà rencontrés sur ce projet)

- **Toujours lancer `manage.py migrate` après `makemigrations`** — `check` et `test` utilisent une base de test recréée à chaque fois et ne détectent donc pas une base de dev désynchronisée (bug rencontré le 2026-08-12 : page « Toutes les commandes » vide en 500 silencieux à cause d'une colonne manquante).
- **Ne pas casser la mémoïsation de `queryString`** dans `usePeriod()` — sa perte avait provoqué une boucle de fetch infinie sur les 8 pages de stats (Epic 8.1).
- **Pas de `npm run build`** — le bundler plante en mémoire sur cette machine ; vérifier par relecture du code.
- `_pct_delta()` renvoie `null` volontairement : le frontend doit afficher `—`, jamais `NaN %`.
