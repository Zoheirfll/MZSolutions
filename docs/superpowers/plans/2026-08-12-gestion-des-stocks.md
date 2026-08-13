# Plan — Gestion des stocks : registre des mouvements + retour au vendeur

> Analyse faite sur 2 captures du concurrent RiseCart (`/admin/stockstatistic/stock-movement`, `/admin/products/back-to-seller`).
> Décisions produit validées par l'utilisateur le 2026-08-12.

---

## Décisions figées (ne pas re-poser la question)

| Sujet | Décision |
|---|---|
| Modification de stock depuis la fiche produit | **Journalisée** comme mouvement `manual_adjustment` — sinon le registre ment par omission |
| Restockage à la validation d'un retour | **Case à cocher "remettre en stock"**, cochée par défaut, décochable si la marchandise revient abîmée |
| Commande annulée | **Restocke aussi** (mouvement `order_cancelled`) — le stock est déduit dès la création, une annulation doit le rendre |
| Colonne "Actions" du registre | **Aucune — registre en lecture seule**, cohérent avec `OrderStatusHistory`/`ComplaintMessage`, immuables par principe dans ce projet. Corriger une erreur = créer un mouvement inverse |

---

## Ce qui existe déjà (ne pas reconstruire)

- `products.StockMovement` : `store, product, variant_option, quantity (signé), reason, note, created_at`
- Motifs existants : `exchange_return`, `exchange_issue`, `order_sale`, `manual_adjustment`
- `GET /api/products/stock/movements/` (`StockMovementListView`) — filtre par produit, paginé
- `POST /api/products/stock/adjust/` (`StockAdjustmentView`) — ajustement manuel, crée déjà un mouvement
- `StockPage.jsx` — alertes stock bas, seuil, inventaire complet, export CSV, **et une modale d'historique par produit** (c'est cette modale qu'on sort en page globale)
- `Order.return_validated_at` + `ReturnValidationPage.jsx` (construits le 2026-08-12)

---

## Backend

### 1. Centraliser toute mutation de stock (à faire en premier)

**Problème** : `StockMovement.objects.create()` est appelé depuis **6 endroits** (`orders/views.py` ×5, `products/views.py` ×1), chacun mutant le stock à sa façon. Ajouter `stock_before`/`stock_after` dans 6 endroits séparés garantit la dérive.

→ Créer **`products/stock.py::record_stock_movement(store, product, variant_option, quantity, reason, note='')`** qui, en une seule opération :
1. lit le stock courant (`variant_option.stock` si variante, sinon `product.stock`)
2. applique le delta, **plafonné à 0** (comportement actuel, à préserver)
3. sauvegarde
4. crée le `StockMovement` avec `stock_before` / `stock_after` renseignés

Puis **refactoriser les 6 sites d'appel** pour passer par ce helper.

⚠️ **C'est l'étape la plus risquée du chantier** (le stock est critique). Sites concernés :
- `orders/views.py` — `_deduct_stock_for_order()` (vente)
- `orders/views.py` — `OrderDetailView.put` (ajustement par delta quand un confirmateur modifie les quantités)
- `orders/views.py` — `ExchangeStatusView` (les deux mouvements `exchange_return` / `exchange_issue`)
- `products/views.py` — `StockAdjustmentView`

Les tests existants couvrent la déduction à la commande et le flux d'échange — les lancer après chaque site refactorisé, pas à la fin.

### 2. `StockMovement` — nouveaux champs et motifs

```
stock_before (IntegerField, null=True)
stock_after  (IntegerField, null=True)
```
⚠️ **`null` pour tout l'historique existant** — aucun instantané passé n'existe, impossible à reconstituer. Le frontend affiche `—`. Ne pas tenter de rejouer les stocks à l'envers : le moindre changement non tracé (justement ceux de la fiche produit, cf. §3) fausserait toute la chaîne.

Nouveaux motifs :
```
order_return     Retour commande (remis en stock)
order_cancelled  Annulation commande (remis en stock)
```

### 3. Boucher le trou : la fiche produit

Aujourd'hui, modifier `stock` depuis `ProductFormPage` (donc `ProductDetailView.put` et la mise à jour des `VariantOption`) **ne crée aucun mouvement**. C'est ce qui rendrait le registre faux.

→ Dans les vues de mise à jour produit/variante : **comparer l'ancien et le nouveau stock**, et n'appeler `record_stock_movement(..., reason='manual_adjustment', note='Modification fiche produit')` **que si la valeur change réellement** (pas de mouvement à 0 sur chaque sauvegarde de produit).

### 4. Restockage — retours et annulations

Ajouter **`Order.restocked_at`** (DateTimeField, null=True) :
- garde d'**idempotence** partagée par les deux flux (retour validé + annulation) — sans ça, une commande qui repasse par `cancelled` restockerait deux fois
- permet à l'UI d'afficher « déjà restocké »

Deux points de branchement :
- `ReturnValidateView.post` — accepte `restock` (booléen, défaut `true`). Si vrai et `restocked_at` vide : pour chaque `OrderItem`, `record_stock_movement(+quantity, reason='order_return', note=f"Retour commande #{order.id}")`, puis renseigner `restocked_at`
- `_transition_order_status()` — au passage à `cancelled`, si `restocked_at` vide : même chose avec `reason='order_cancelled'`. ⚠️ Ne restocker que si le stock avait bien été déduit (une commande `scheduled` n'a jamais déduit — voir `activate_scheduled_order`)

### 5. Endpoint registre (étendre l'existant, ne pas en créer un second)

`GET /api/products/stock/movements/` — ajouter les filtres :
- `?search=` (nom de produit)
- `?date_from=` / `?date_to=`
- `?reason=` — **accepter une liste séparée par des virgules** (c'est ce qui permet à « Retour au vendeur » de réutiliser le même endpoint : `?reason=order_return,order_cancelled,exchange_return`)
- garder `?product=`

Sérialiseur — champs attendus par les deux pages :
`product_name`, `option` (= `variant_option.value`), `option_group` (= `variant_option.variant.name`, ex. « Couleur »), `quantity` (signé), `stock_before`, `stock_after`, `reason`, `reason_label`, `note`, `created_at`

> Note sur les colonnes « Option / Sous-Option » du concurrent : notre modèle n'a **qu'un seul niveau** de valeur (`VariantOption.value`) ; `ProductVariant.sub_option_name` n'est qu'un libellé de groupe. Exposer `option` + `option_group` et ne pas inventer un second niveau.

---

## Frontend

- **`pages/products/StockMovementsPage.jsx`** — registre global, **lecture seule**. Colonnes : Produit · Option · Mouvement (entrée/sortie) · Qté · Ancien stock · Nouveau stock · Type · Note · Date. Filtres : plage de dates, recherche produit, type de mouvement. Afficher `—` quand `stock_before`/`stock_after` sont `null` (lignes antérieures au chantier)
- **`pages/products/BackToSellerPage.jsx`** — même tableau, pré-filtré sur les motifs entrants (`order_return,order_cancelled,exchange_return`), avec les colonnes de stock précédent mises en avant
- **`ReturnValidationPage.jsx`** — ajouter la case **« remettre en stock »** (cochée par défaut) au moment de confirmer la réception, et un badge « restocké » sur les lignes déjà traitées
- **Sidebar** — « Stock & Inventaire » devient un menu dépliant (**même motif que « Suivi des commandes » et « Expéditions & Retours »**, faits le 2026-08-12) :
  ```
  Stock & Inventaire ▾        (badge stock bas conservé sur le parent)
     ├── Stock & Inventaire   (page actuelle)
     ├── Mouvement des stocks
     └── Retour au vendeur
  ```
  « Statistique vente de stock » **reste sous Statistiques** (c'est de l'analyse, pas de la gestion).

---

## Ordre d'exécution

1. `products/stock.py` + champs `stock_before`/`stock_after` + nouveaux motifs + migration + **`migrate` sur la base de dev**
2. Refactoriser les 6 sites d'appel vers le helper — **relancer `manage.py test orders products` après chaque site**
3. Journaliser les modifications de stock depuis la fiche produit
4. `Order.restocked_at` + restockage retour (case à cocher) + restockage annulation
5. Filtres de l'endpoint + sérialiseur
6. Les 2 pages frontend + réorganisation de la sidebar + case à cocher sur `ReturnValidationPage`
7. Tests + `CLAUDE.md` (fermer le TBD « Pas de restockage automatique », documenter `restocked_at` et les nouveaux motifs)

---

## Pièges connus

- **Toujours `manage.py migrate` après `makemigrations`** — `check`/`test` utilisent une base recréée et ne détectent pas une base de dev désynchronisée (bug du 2026-08-12 : liste de commandes vide sur un 500 silencieux)
- **Pas de `npm run build`** — le bundler plante en mémoire sur cette machine. Vérifier par relecture + `npx --no-install esbuild <fichier> --jsx=automatic --bundle=false` pour un contrôle de syntaxe
- Le plafonnement à 0 du stock (`max(0, ...)`) est le comportement actuel — le conserver dans le helper, sinon des stocks négatifs apparaîtront
- Ne pas créer de mouvement quand une sauvegarde de produit ne change pas réellement le stock (sinon le registre se remplit de lignes à 0)
