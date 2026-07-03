# CLAUDE.md — MZSolutions

> **RÈGLE N°1 — À lire avant chaque modification :**
> Consulter ce fichier intégralement avant toute action sur le projet. Respecter les conventions, l'architecture, et l'état des sprints. Ne jamais deviner ce qui existe — lire le code. Ne jamais utiliser de CSS custom — Tailwind uniquement. Toujours utiliser `theme.js` pour les couleurs et styles réutilisables.

---

## Workflow de développement par Epic

Chaque epic envoyée par l'utilisateur suit ce cycle, sans qu'il soit nécessaire de le redemander :

1. **Créer une branche** nommée d'après l'epic (ex. `epic-livraison-yalidine`), à partir de `main` à jour.
2. **Travailler l'epic** jusqu'à ce qu'elle soit complète et peaufinée (pas de demi-mesure — build/tests vérifiés avant de considérer terminé).
3. **Mettre à jour `CLAUDE.md`** systématiquement à la fin (nouveaux modèles, endpoints, composants, conventions, décisions techniques, sprint concerné).
4. **⚠️ Attendre la validation explicite de l'utilisateur avant tout commit/push/merge.** L'utilisateur veut relire le code d'abord — ne jamais commit/push automatiquement en fin d'epic, même si tout est testé et fonctionnel. Signaler que le travail est prêt et attendre le feu vert.
5. Une fois validé : commit + push de la branche.
6. **Retour sur `main`** (merge ou PR selon ce que demande l'utilisateur au moment venu — à confirmer avant tout merge vers `main`).
7. Passer à l'epic suivante.

---

## Projet

**MZSolutions** — Plateforme SaaS e-commerce multi-vendeur pour le marché algérien.
Concurrent direct de RiseCart, RiseManager, DZ Build. Objectif : les dépasser en fonctionnalité.

- **Durée :** 4 mois, 8 sprints de 2 semaines
- **Développeur :** Solo full-stack
- **Date de début :** 28 juin 2026
- **Document de référence :** `Cahier_des_charges MZSolutions.docx` (à la racine)

---

## Stack Technique

| Couche | Technologie |
|---|---|
| Backend | Django 5.2 + Django REST Framework |
| Base de données | PostgreSQL (base : `mzsolutions`) |
| Auth | JWT via `djangorestframework-simplejwt` |
| Frontend | React 18 + Vite |
| Styles | **Tailwind CSS v4** uniquement — zéro CSS custom |
| Thème | `frontend/src/theme.js` — source unique des couleurs/styles |
| HTTP client | Axios avec intercepteur Bearer + refresh auto |
| Routing | React Router DOM v6 |

---

## Architecture

### Multi-tenant
- **Par clé étrangère** (pas de schémas PostgreSQL séparés)
- `Store` = entité racine multi-tenant (1 vendeur = 1 User + 1 Store)
- Toutes les futures entités (produits, commandes, clients) auront une FK vers `Store`
- Isolation : filtrer systématiquement par `request.user.store` dans chaque vue
- Helper `_get_store(request)` dans chaque view : essaie `user.store`, fallback `user.team_membership.store`

### Structure Backend (`backend/`)
```
config/          — settings, urls, wsgi
accounts/        — modèle User custom (login par email), auth JWT
stores/          — Store, SubscriptionQuota, StoreSettings
team/            — TeamMember, invitation token
products/        — Category, Product, ProductImage, ProductVariant, VariantOption, Supplier, SupplierCredit, SupplierPayment, ProductReview
orders/          — Order, OrderItem, OrderStatusHistory, OrderAssignment, CallAttempt, FailureReason, PaymentWebhookLog, CarrierAccount
orders/carriers/ — clients transporteurs (Yalidine, ZR Express) : base.py (BaseCarrierClient, MockCarrierClient), yalidine.py, zr_express.py, get_carrier_client()
orders/stats_views.py — 8 vues statistiques (Epic 8.1), voir section API Endpoints. `orders/utils.py` expose `parse_period(request)` (contrat période partagé) et `order_channel(order)` (canal de vente, réutilisé aussi par `finance/`)
dropshipping/    — DropshipperProduct, Commission, CommissionEntry, CommissionPayment (voir Epic 7.3)
finance/         — Cost, calcul de rentabilité (voir Epic 7.4)
core/            — app Django générique (utilitaires partagés) : permissions.py (is_owner_or_admin, IsOwnerOrAdminForWrites)
```

### Paiement en ligne — Chargily Pay
- `backend/orders/chargily.py` : `create_checkout(order)` (crée un checkout via l'API REST Chargily) et `verify_webhook_signature(raw_body, signature_header)` (HMAC-SHA256)
- Settings (`.env`, jamais commité) : `CHARGILY_API_KEY`, `CHARGILY_SECRET_KEY`, `CHARGILY_MODE` (test/live), `CHARGILY_API_BASE`, `BACKEND_URL`
- ⚠️ URL de base différente entre modes : **test** = `https://pay.chargily.net/test/api/v2`, **live** = `https://pay.chargily.net/api/v2`
- En dev local, le webhook Chargily (`/api/public/webhooks/chargily/`) doit être exposé via un tunnel public (ngrok) car Chargily ne peut pas appeler `localhost` — mettre à jour `BACKEND_URL` dans `.env` et le champ "Point de terminaison webhook" du dashboard Chargily à chaque nouveau tunnel

### Transporteurs — Yalidine / ZR Express (mock)
- `backend/orders/carriers/` : interface commune `BaseCarrierClient.create_shipment(order)` / `.get_status(tracking_number)`. `YalidineClient` et `ZRExpressClient` héritent de `MockCarrierClient` — **aucun appel réseau réel pour l'instant**, faute d'accès API obtenus. Génèrent un tracking factice `MOCK-{carrier}-{order_id}-{uuid6}` et un statut `created`
- Quand une commande passe au statut `confirmed` (`OrderStatusView.post`), le système crée automatiquement une expédition via le transporteur par défaut de la boutique (`CarrierAccount.is_default`), ou celui précisé par `carrier_id` dans le payload. Idempotent (ne recrée pas si `carrier_tracking_number` déjà rempli). Si aucun compte actif : la commande est quand même confirmée, réponse avec `carrier_warning` (pas d'erreur bloquante)
- Pour brancher les vraies API : remplacer le contenu de `yalidine.py` / `zr_express.py` (utiliser `self.carrier_account.api_id` / `.api_token`), le reste du système n'a pas besoin de changer

### Structure Frontend (`frontend/src/`)
```
api/axios.js                    — instance Axios + intercepteurs Bearer + refresh auto
context/AuthContext.jsx         — état auth global (user, login, logout, register)
theme.js                        — couleurs et classes Tailwind centralisées
components/DashboardLayout.jsx  — layout dashboard (sidebar, topbar, badge stock)
components/PrivateRoute.jsx     — protection des routes
components/Select.jsx           — dropdown custom (remplace TOUT <select> natif, voir note ci-dessous)
components/StatCard.jsx         — carte KPI réutilisable (theme.stat.*, icône lucide-react)
components/CheckboxList.jsx     — liste de checkboxes scrollable pour sélection multiple (produits/catégories ciblés par une promotion)
components/StatusBadge.jsx      — badge de statut commande, mapping centralisé (remplace les couleurs inline dupliquées par page)
components/EmptyState.jsx       — état vide réutilisable (icône + titre + description)
pages/Auth.jsx                  — login/inscription (split layout)
pages/Dashboard.jsx             — tableau de bord vendeur
pages/StorePage.jsx             — Ma boutique
pages/TeamPage.jsx              — gestion équipe
pages/PermissionsPage.jsx       — (owner/admin) matrice de permissions par rôle (Epic 7.5), toggles en direct via `POST /api/team/permissions/`
pages/StockPage.jsx             — alertes stock bas + réglage seuil, et inventaire complet paginé/recherchable (tout ce que possède la boutique, pas que le stock bas)
pages/products/ProductsPage.jsx       — liste produits (pagination, recherche)
pages/products/ProductFormPage.jsx    — créer/modifier produit (variantes, images, multi-catégories). ⚠️ Le bouton "Ajouter une option" doit toujours envoyer une `value` non vide (le backend rejette `value=''` en 400) — bug déjà rencontré une fois (le clic semblait ne rien faire, erreur avalée silencieusement), corrigé en envoyant `'Nouvelle option'` par défaut
pages/products/CategoriesPage.jsx     — gestion catégories (Corbeille, pagination, checkboxes)
pages/products/SuppliersPage.jsx      — CRUD fournisseurs
pages/products/ReviewsPage.jsx        — modération avis
pages/products/CouponsPage.jsx        — CRUD codes promo (`Promotion kind='code'`), copier le code, compteur uses_count/max_uses, ciblage optionnel produits/catégories via checkboxes
pages/products/AutoPromotionsPage.jsx — CRUD offres automatiques (`Promotion kind='auto'`), sélection produits/catégories via checkboxes
pages/products/SupplierCreditPage.jsx    — crédits fournisseurs
pages/products/SupplierPaymentPage.jsx   — versements fournisseurs
pages/orders/OrdersPage.jsx           — liste commandes (filtre statut, recherche, modal "État de la commande" avec note + wilaya/commune, colonne Note, icône historique)
pages/orders/OrderDetailPage.jsx      — détail commande (changer statut, sélection transporteur si confirmation + affichage tracking, assignation confirmateur, historique en timeline)
pages/orders/OrderFormPage.jsx        — création commande manuelle (vendeur)
pages/orders/CancellationsPage.jsx    — demandes d'annulation / confirmées
pages/orders/FailureReasonsPage.jsx   — raisons d'échec d'appel
pages/orders/ConfirmationRatePage.jsx — taux de confirmation par confirmateur (réutilisée aussi comme "Statistique par confirmateur", Epic 8.1)
pages/orders/stats/statsShared.jsx    — utilitaires communs aux 8 pages de statistiques (Epic 8.1) : `usePeriod()`/`PeriodFilter` (jour/semaine/mois/personnalisé, même contrat que `ConfirmationRatePage`), `Spinner`, `money()`, `PIE_COLORS`
pages/orders/stats/GlobalStatsPage.jsx    — StatCards résumé (commandes, taux de confirmation, livrées/retournées/annulées, CA, panier moyen)
pages/orders/stats/OrdersStatsPage.jsx    — évolution quotidienne (bar chart) + répartition par statut (pie chart), esprit RiseCart
pages/orders/stats/ReturnsStatsPage.jsx   — StatCards + évolution quotidienne des retours
pages/orders/stats/FailuresStatsPage.jsx  — répartition des échecs d'appel par `FailureReason`
pages/orders/stats/StockSalesStatsPage.jsx — unités vendues par produit (agrégat `StockMovement reason='order_sale'`)
pages/orders/stats/ProductsStatsPage.jsx  — par produit : commandes, confirmées, meilleure wilaya, meilleure source
pages/orders/stats/WilayaStatsPage.jsx    — par wilaya : commandes, confirmées, revenu
pages/orders/stats/SourceStatsPage.jsx    — par source (canal de vente) : pie chart + tableau commandes/confirmées/revenu
pages/orders/ComplaintsPage.jsx       — liste réclamations (filtres statut, recherche)
pages/orders/ComplaintDetailPage.jsx  — détail réclamation : description, historique des échanges en timeline, changement de statut + note, ajout de message
pages/ParametresLivraisonPage.jsx     — comptes transporteurs (Yalidine/ZR Express) : onglets "Sociétés de livraison" (cartes) / "Mes Sociétés de livraison" (tableau : toggle statut, copier clé/jeton API, badge défaut)
pages/customers/ClientsPage.jsx           — liste clients agrégée par téléphone (nom, email, tél, nb commandes, wilaya, commune, badge risque)
pages/customers/AtRiskCustomersPage.jsx   — clients à risque + panneau réglages (seuil/période), bouton marquer/démarquer manuellement
pages/customers/BlacklistPage.jsx         — liste noire par boutique, modal "Bloquer un numéro de téléphone" (message + téléphone)
pages/dropshipping/DropshippersPage.jsx           — (owner/admin) liste des dropshippers actifs, solde (gagné/payé/à payer), lien vers le détail
pages/dropshipping/DropshipperDetailPage.jsx      — (owner/admin) config commission par produit sélectionné (%/fixe), historique commissions + paiements, bouton "Marquer comme payé"
pages/dropshipping/DropshipperMyProductsPage.jsx  — (dropshipper) sélection de produits du catalogue à revendre (Ajouter/Retirer)
pages/dropshipping/DropshipperMyEarningsPage.jsx  — (dropshipper) solde propre en lecture seule + historique commissions/paiements reçus
pages/finance/CostsPage.jsx           — (owner/admin) CRUD coûts opérationnels/marketing, saisie par période (label libre, montant, dates début/fin)
pages/finance/ProfitabilityPage.jsx   — (owner/admin) résumé global (revenus/coûts/profit net sur une période) + tableau détaillé par produit/wilaya/source
pages/storefront/StorefrontHomePage.jsx     — page d'accueil boutique publique
pages/storefront/StorefrontProductsPage.jsx — liste produits publique
pages/storefront/StorefrontProductPage.jsx  — fiche produit publique (Ajouter au panier / Acheter maintenant), bouton "Laisser un avis" (modal note+commentaire, `POST /api/public/reviews/`, modéré par le vendeur avant publication)
pages/storefront/CheckoutPage.jsx           — tunnel de commande invité (panier, infos client, COD/Chargily), lien "Déposer une réclamation" sur l'écran de confirmation
pages/storefront/ComplaintFormPage.jsx      — formulaire public de réclamation, sans compte : téléphone (+ n° de commande optionnel) → sujet + description
pages/storefront/StorefrontLayout.jsx       — layout boutique publique (recherche, icône panier)
context/CartContext.jsx         — panier storefront (localStorage, scoping par slug boutique)
api/publicApi.js                — instance Axios pour les endpoints publics (`/api/public`)
data/wilayas.js                 — 58 wilayas algériennes
```

### Thème — Premium SaaS sombre (style Linear/Vercel)
Toujours importer et utiliser `theme.js` — ne jamais hardcoder des classes Tailwind de couleur directement. `theme.js` est la source unique : toute page qui consomme `theme.dark.*` / `theme.btn.*` / `theme.badge.*` / `theme.table.*` hérite automatiquement des mises à jour du design system (pas besoin de retoucher chaque page individuellement).
```js
import { theme } from '../theme'
// theme.btn.primary, theme.input, theme.logo, theme.hero, theme.badge.*
// theme.dark.app / sidebar / card / border / muted
```
Couleur primaire : `violet-600` (#7c3aed), réservée aux éléments interactifs/actifs (pas de fond violet saturé décoratif). Fonds quasi-noirs neutres (`#08090a`/`#0a0b0c`/`#0d0e10`), bordures fines "hairline" neutres (pas de teinte violette dans les bordures), rayons resserrés (`rounded-lg`/`rounded-xl`, pas `2xl`), boutons plats sans glow/shadow coloré, badges avec `ring-1 ring-inset` plutôt que fond saturé plein. Gradient hero (page marketing uniquement) : `#2e1065 → #6d28d9 → #7c3aed`.

Police : **Plus Jakarta Sans** (chargée via Google Fonts dans `index.html`), taille de base légèrement agrandie via `font-size: 107%` sur `<html>` (`index.css`) pour un rendu plus aéré sans retoucher chaque classe Tailwind.

⚠️ **Ne jamais utiliser `<select>` natif.** Sur certaines machines Windows, le navigateur ignore tout le CSS (fond, couleur, `appearance: none`, `color-scheme`, `forced-color-adjust`) et affiche le widget OS natif (blanc), cassant le thème sombre. Utiliser systématiquement `components/Select.jsx` (`value`, `onChange(value)`, `options: [{value, label}]`, `variant="dark"|"light"`).

⚠️ **`theme.btn.outline` est un style dark uniquement** (`border-white/12`, `text-gray-300`) — quasi invisible sur fond blanc. Sur les pages **claires** (boutique publique `pages/storefront/`, `Auth.jsx`), utiliser `theme.btn.outline**Light**` à la place (même API, couleurs adaptées fond blanc). Bug déjà rencontré : plusieurs boutons de la boutique publique (`Ajouter au panier`, `Voir les produits`, `Appliquer` code promo) utilisaient `theme.btn.outline` par erreur et paraissaient "délavés"/illisibles.

---

## Modèles de données (état actuel — Sprint 5)

### `accounts.User`
```
email (unique, USERNAME_FIELD)
first_name, last_name, phone
google_id, is_email_verified
```

### `stores.Store`
```
owner (OneToOne → User)
name, slug (unique global), description
phone, email, logo
is_active, created_at
```

### `stores.SubscriptionQuota`
```
store (OneToOne → Store)
orders_limit (default 50), orders_used (default 0)
trial_ends_at (default now + 30 jours)
[computed] orders_remaining, is_trial_active
```

### `stores.StoreSettings`
```
store (OneToOne → Store)
low_stock_threshold (default 5)
risk_threshold_orders (default 3) — nb commandes cancelled/returned déclenchant le risque auto
risk_period_days (default 90) — fenêtre glissante pour le calcul du risque
```

### `team.TeamMember`
```
store (FK → Store), user (OneToOne nullable)
role: admin | confirmateur | dropshipper
first_name, last_name, email, phone
invite_token (auto-généré), is_active, invited_at, activated_at
wilaya, commune, address (extras dropshipper)
```

### `team.RolePermission` (Epic 7.5)
```
store (FK), role : admin | confirmateur | dropshipper
permission (clé du catalogue fixe), enabled
```
Système de permissions **par rôle** (pas par membre individuel — décision produit, plus simple à gérer et suffisant pour "chaque rôle a son layout"). Seuls les **overrides explicites** sont stockés (`unique_together (store, role, permission)`) — l'absence de ligne retombe sur `team.models.DEFAULT_PERMISSIONS[role]`, qui reflète le comportement codé en dur avant cette epic (confirmateur très restreint, dropshipper voit produits/clients/stock mais pas team/finances/dropshipping). Catalogue fixe dans `team.models.PERMISSION_CATALOG` (`orders_view`, `orders_manage`, `complaints_view`, `exchanges_view`, `products_view`, `purchase_prices_view`, `clients_view`, `stock_view`, `store_view`, `shipping_settings_view`, `dropshipping_view`, `finances_view`, `team_view`, `stats_view` — ce dernier ajouté par l'Epic 8.1, même défaut que l'ancien placeholder désactivé : caché pour confirmateur/dropshipper).

**Portée volontairement limitée à la lecture** : ce système ne gate que la *visibilité* (sidebar) et 2 endpoints réels côté serveur — jamais les actions d'écriture (créer/modifier/supprimer restent `is_owner_or_admin` partout, inchangé). Deux enforcements serveur concrets :
- `purchase_prices_view` : `cost_price` retiré de `ProductSerializer`/`VariantOptionSerializer` (`to_representation`) si absent — donnée jamais gatée avant cette epic
- `dropshipping_view` / `finances_view` : `DropshipperListView.get`/`DropshipperDetailView.get` et `CostListCreateView.get`/`ProfitabilityView.get`/`ProfitabilitySummaryView.get` acceptent `is_owner_or_admin(request) OR has_permission(request, key)` — permet au vendeur d'élever un confirmateur/dropshipper en lecture seule sur ces sections normalement owner/admin-only

`core.permissions.has_permission(request, key)` / `get_effective_permissions(request)` — l'owner (pas de `team_membership`) a toujours accès total, non configurable. `UserSerializer` (`/api/auth/me/`) expose `permissions: {clé: bool}` calculées côté serveur pour l'utilisateur courant — le frontend (`DashboardLayout.jsx`) pilote désormais la sidebar via `user.permissions` plutôt que des conditions `teamRole === '...'` codées en dur (celles-ci subsistent uniquement pour ce qui est lié à l'identité, pas configurable : pages propres au dropshipper, qui gère l'équipe).

### `products.Category`
```
store (FK → Store), name
image (ImageField, upload_to='categories/')
parent (FK → self, nullable — hiérarchie 1 niveau)
is_active, is_deleted (soft delete → Corbeille), created_at
```

### `products.Supplier`
```
store (FK → Store)
first_name, last_name, email, phone, address
created_at
```

### `products.SupplierCredit` / `products.SupplierPayment`
```
supplier (FK → Supplier)
amount, note, date, created_at
```

### `products.Product`
```
store (FK → Store)
name, description
price, compare_price (nullable), cost_price (nullable)
stock, sku (blank — UniqueConstraint par store si non vide), weight (nullable)
categories (ManyToMany → Category)   ← UN PRODUIT PEUT APPARTENIR À PLUSIEURS CATÉGORIES
supplier (FK → Supplier, nullable)
free_shipping, allow_out_of_stock, drop_shipping (BooleanField)
is_active, created_at
[computed] total_stock — somme des options si variantes, sinon stock direct
```

### `products.ProductImage`
```
product (FK → Product), image (upload_to='products/'), order
```

### `products.ProductVariant`
```
product (FK → Product)
name (ex: "Couleur"), sub_option_name (ex: "Taille")
order
```

### `products.VariantOption`
```
variant (FK → ProductVariant)
value (ex: "Rouge")
price, cost_price (nullable — prix spécifique à l'option)
stock, sku, image (upload_to='variants/')
allow_out_of_stock, is_active, order
```

### `products.ProductReview`
```
product (FK → Product)
first_name, last_name (optionnel), email (optionnel)
rating (1-5), comment
image (ImageField, upload_to='reviews/', optionnel)
is_approved (default False — modération manuelle)
created_at
```

### `products.Promotion`
```
store (FK → Store)
name
kind : code | auto
code (requis si kind='code', unique par boutique, normalisé en MAJUSCULES)
discount_type : percentage | fixed
discount_value
starts_at, ends_at (nullable — bornes de validité optionnelles)
max_uses (nullable, kind='code' uniquement), uses_count (incrémenté à chaque commande utilisant le code)
is_active
products (M2M → Product), categories (M2M → Category) — cible optionnelle. Requis pour 'auto' (au moins un des deux) ; optionnel pour 'code' (vide = s'applique à tout le panier, sinon limité aux produits/catégories ciblés)
created_at
```
- `is_valid_now()` : vérifie `is_active` + fenêtre `starts_at`/`ends_at` + `uses_count < max_uses` (si `kind='code'`)
- `compute_discount(base_amount)` : calcule le montant de la réduction (%, ou fixe plafonné au montant de base) sur un montant déjà connu
- `compute_discount_for_items(items)` : source unique de calcul pour un panier (`items` = liste de `{product, price, quantity}`) — filtre d'abord les lignes éligibles selon `products`/`categories` du coupon (si scopé), puis applique `compute_discount()` sur la base filtrée. Utilisée à la fois par `PublicOrderView.post()` (commande) et `PublicPromoValidateView` (aperçu checkout) pour ne jamais dupliquer la logique de scope
- **Coupon (kind='code')** : validé et verrouillé (`select_for_update`) côté serveur à la création de commande publique (`PublicOrderView.post()`), pour éviter toute race condition sur `max_uses` en cas de commandes simultanées. `uses_count` incrémenté seulement après création réussie de la commande. Si le panier ne contient aucun article éligible au scope du coupon → 400
- **Offre automatique (kind='auto')** : appliquée à la lecture, pas de recalcul serveur à la commande (cohérent avec l'architecture existante qui fait confiance au prix fourni par le frontend à la création — voir `PublicOrderView`). `Product.active_auto_promotion()` (méthode réutilisée par `ProductSerializer` dashboard, `PublicProductListView` et `PublicProductDetailView`) injecte `price` déjà réduit + `original_price` (prix avant réduction) si une offre auto valide cible le produit ou une de ses catégories
- **Pas de cumul** entre coupon et offre auto sur une même commande (décision Epic 6.2).

### `orders.Order`
```
store (FK → Store)
status : pending | no_answer_1 | no_answer_2 | no_answer_3 | confirmed | shipped |
         delivered | returned | cancel_requested | cancelled
first_name, last_name, phone, wilaya, commune, address
subtotal, shipping_cost, total (recalculés via order.recalculate() : total = max(subtotal - discount_amount, 0) + shipping_cost)
promo_code, discount_amount (renseignés si un code promo — products.Promotion kind='code' — a été appliqué au checkout)
delivery_type, payment_method (cod | chargily), note
chargily_checkout_id, chargily_payment_link
carrier (FK → CarrierAccount, nullable), carrier_tracking_number, carrier_status, carrier_shipment_created_at
created_at, updated_at
```
- Statuts `no_answer_1/2/3` = tentatives d'appel séquentielles intégrées au statut principal (pas de modèle séparé de log d'appel type "CallAttempt" pour ce flux — un seul changement de statut + note suffit)
- Commande `python manage.py cancel_stale_calls` (`backend/orders/management/commands/cancel_stale_calls.py`) : annule automatiquement les commandes bloquées sur `no_answer_3` depuis 3 jours ou plus (basé sur `OrderStatusHistory`, pas `updated_at`), avec note automatique "Client ne répond pas depuis X jours". **Non planifiée automatiquement** — à brancher sur le Planificateur de tâches Windows / cron

### `orders.OrderItem`
```
order (FK → Order), product (FK nullable), variant_option (FK nullable)
product_name, price, quantity
```

### `orders.OrderStatusHistory`
```
order (FK → Order), status, changed_by (User, nullable = système/automatique), changed_at, note
```

### `orders.OrderAssignment`
```
order (OneToOne → Order), confirmateur (FK → TeamMember), assigned_at, assigned_by
```
Assignation automatique round-robin entre confirmateurs actifs (`orders/utils.py::assign_order_round_robin`).

### `orders.CallAttempt` / `orders.FailureReason`
Legacy — logging détaillé d'appel (agent, raison d'échec) conservé pour les statistiques (`ConfirmationRateView`), indépendant du flux principal `no_answer_1/2/3` du statut de commande.

### `orders.CarrierAccount`
```
store (FK → Store)
carrier : yalidine | zr_express
name, departure_wilaya
api_id, api_token (jamais renvoyé en clair par l'API — write_only + api_token_masked)
is_active, is_default (un seul défaut par boutique, forcé dans .save())
created_at
```
Contrainte unique `(store, carrier)` — un seul compte par transporteur par boutique.

### `orders.PaymentWebhookLog`
```
order (FK nullable → Order), event_type, checkout_id
raw_payload (JSONField), signature_valid (bool)
status : received | processed | error
error_message, received_at
```
Chaque webhook Chargily reçu est journalisé ici en premier, avant tout traitement — garantit l'audit même en cas d'erreur de traitement. Le endpoint webhook retourne toujours HTTP 200 (même en erreur interne) pour éviter les tempêtes de retry côté Chargily ; les erreurs internes sont visibles via `status='error'`.

### Clients (pas de modèle `Customer`)
Aucune table `Customer` — un client est identifié uniquement par `Order.phone`. La liste "Clients" et le calcul de risque sont **agrégés à la volée** (`GROUP BY phone` sur `store.orders`, voir `ClientListView`), jamais persistés/synchronisés. Seuls deux petits modèles existent pour ce qui ne peut pas être dérivé des commandes :

### `orders.CustomerRisk`
```
store (FK → Store), phone
manual_risk (bool, default False) — flag manuel, indépendant du calcul auto
note (optionnel)
created_at, updated_at
```
Une seule ligne par `(store, phone)`, créée via `get_or_create` seulement quand le vendeur bascule le flag manuel (`POST /api/orders/clients/<phone>/risk/`). Le risque **automatique** n'est jamais stocké ici — recalculé à chaque lecture : `is_risky = (commandes cancelled/returned du client sur risk_period_days) >= risk_threshold_orders OR manual_risk`.

### `orders.BlacklistedPhone`
```
store (FK → Store), phone
message (optionnel — affiché au client si sa commande est refusée)
blocked_attempts (compteur), last_attempt_at (nullable)
created_at
```
Liste noire **non mutualisée** — un numéro bloqué sur une boutique ne l'est pas sur les autres (contrainte unique `(store, phone)`). Vérifiée dans `PublicOrderView.post()` (`backend/orders/views.py`) **avant toute création** : si le téléphone soumis correspond à une entrée, la commande est refusée (403, message personnalisé du vendeur renvoyé dans `detail` et affiché au client par `CheckoutPage.jsx`), et `blocked_attempts`/`last_attempt_at` sont incrémentés/mis à jour pour que le vendeur voie les tentatives sur la page Liste noire.

### `orders.Complaint` / `orders.ComplaintMessage`
```
Complaint : store (FK), order (FK → Order)
  subject, description, status : open | in_progress | resolved
  created_at, updated_at

ComplaintMessage : complaint (FK, related_name='messages')
  message (optionnel), status (optionnel — rempli si le message accompagne un changement de statut)
  author (FK User, nullable = message du client), created_at
```
Réclamation client déposée **sans compte** (`PublicComplaintCreateView`, `POST /api/public/complaints/`) : le client fournit `store_slug`, `order_id`, `phone`, `subject`, `description` — la commande doit appartenir à la boutique **et** le téléphone doit correspondre à `Order.phone`, sinon 404 générique (pas de distinction commande inexistante / mauvais téléphone, anti-énumération). À la création, un premier `ComplaintMessage` (message = description, `author=None`, `status='open'`) est créé automatiquement — c'est le point de départ de l'historique des échanges (US-7.1.2). Chaque changement de statut côté vendeur (`ComplaintStatusView`) ou message ajouté (`ComplaintMessageCreateView`) crée une nouvelle ligne `ComplaintMessage` — historique jamais modifié/supprimé, même pattern que `OrderStatusHistory`.

### `orders.ExchangeRequest`
```
store (FK), order_item (FK → OrderItem — article livré à échanger)
replacement_option (FK → VariantOption — variante demandée, doit appartenir au même Product que order_item.product)
reason (motif client), status : open | approved | rejected
vendor_note (renseignée à l'approbation/refus)
created_at, updated_at
```
Demande d'échange déposée **sans compte** (US-7.2.1), même principe de vérification double (commande + téléphone) que les réclamations. Flux public en 2 étapes :
1. `GET /api/public/store/<slug>/order-items/?order_id=&phone=` (`PublicOrderItemsView`) — `order_id` optionnel : si fourni, doit correspondre au téléphone (`Order.phone`) ; si omis, retombe sur la commande la plus récente de ce téléphone (même compromis que `PublicComplaintCreateView`). **Jamais un choix parmi plusieurs commandes** — une seule commande révélée à la fois, pour limiter ce qu'un tiers connaissant juste un téléphone peut voir (une commande récente, pas tout l'historique). Retourne, pour chaque article de cette commande précise, les autres variantes disponibles du même produit.
2. `POST /api/public/exchanges/` (`PublicExchangeCreateView`) — revérifie la même appartenance avant de créer `ExchangeRequest(status='open')`.

Validation par le vendeur (`ExchangeStatusView`, US-7.2.1 "workflow de validation avant traitement") : transition possible uniquement depuis `status='open'` (protège contre le double traitement). Si `status='approved'`, **dans la même transaction atomique** (US-7.2.2 "impact automatique") :
- le stock de l'article rendu (`order_item.variant_option` ou `order_item.product` si pas de variante) est **incrémenté** de `order_item.quantity` ;
- le stock de `replacement_option` est **décrémenté** d'autant ;
- deux `products.StockMovement` sont créés (`exchange_return` positif, `exchange_issue` négatif), `note=f"Échange #{id}"` — c'est l'historique traçable demandé par l'AC (`ExchangeDetailView` les rattache via `note` plutôt qu'une FK directe, pour ne pas créer de dépendance `products` → `orders`).

### `products.StockMovement`
```
store (FK), product (FK), variant_option (FK, nullable — absent si le produit n'a pas de variantes)
quantity (signé : positif = entrée, négatif = sortie)
reason : exchange_return | exchange_issue | order_sale (extensible plus tard à d'autres causes)
note (texte libre, ex. "Échange #12" ou "Commande #45"), created_at
```
Premier modèle d'audit de stock du projet — jusqu'ici `Product.stock`/`VariantOption.stock` étaient de simples compteurs sans historique. Immuable une fois créé (jamais modifié/supprimé), même philosophie que `OrderStatusHistory`/`ComplaintMessage`.

**Décrémentation à la commande** : `_deduct_stock_for_order(store, order)` (`backend/orders/views.py`) est appelée à la création d'une commande (`PublicOrderView.post()` **et** `OrderListCreateView.post()` — commande manuelle vendeur), pour chaque `OrderItem` : décrémente `variant_option.stock` (ou `product.stock` si pas de variante), plafonné à 0, et journalise un `StockMovement(reason='order_sale')`. Choix produit : le stock baisse **dès la création** de la commande (pas à la confirmation), pour éviter la survente si deux clients commandent le dernier article simultanément. ⚠️ **Pas de restockage automatique** si une commande est annulée/retournée — TBD, à considérer si besoin.

### `orders.Order.dropshipper` (FK → `team.TeamMember`, nullable)
Ajouté pour Epic 7.3 — identifie le dropshipper qui a réalisé la vente (`None` pour une commande normale du vendeur). Renseigné automatiquement à la création si l'utilisateur authentifié est un `TeamMember` de rôle `dropshipper` (`OrderListCreateView.post()`).

### `dropshipping.DropshipperProduct`
```
store (FK), dropshipper (FK → team.TeamMember, role='dropshipper'), product (FK → products.Product)
created_at
```
Sélection de produits du catalogue du vendeur principal qu'un dropshipper choisit de revendre (US-7.3.1). **Le dropshipper ne gère pas de stock propre** — c'est uniquement une sélection, le stock consommé à la commande reste celui du produit du vendeur (`_deduct_stock_for_order`). Contrainte unique `(dropshipper, product)`.

### `dropshipping.Commission`
```
store (FK), dropshipper (FK), product (FK)
commission_type : percentage | fixed
value
created_at, updated_at
```
Commission configurée par le vendeur pour une combinaison produit × dropshipper (US-7.3.2), upsert via `update_or_create` sur `(dropshipper, product)`. `compute_amount(unit_price, quantity)` : `percentage` = % du montant de la ligne (prix unitaire × quantité) ; `fixed` = montant fixe **par unité vendue** (cohérent avec le prix unitaire de `OrderItem`).

### `dropshipping.CommissionEntry`
```
store (FK), dropshipper (FK), order_item (OneToOne → orders.OrderItem), product (FK, nullable)
amount, created_at
```
Commission calculée pour un article de commande — immuable, une entrée par `OrderItem` (le `OneToOneField` garantit l'idempotence : pas de double calcul si le statut repasse plusieurs fois à `delivered`). Créée uniquement quand la commande passe au statut **`delivered`** (US-7.3.3, `_sync_commission_for_order` dans `backend/orders/views.py`, appelée depuis `OrderStatusView.post()`), et **supprimée** si la commande repasse en `returned`/`cancelled` — pour ne jamais rémunérer une commande annulée ou retournée (relit l'AC "uniquement lorsque la commande est livrée"). Seuls les produits ayant une `Commission` configurée pour ce dropshipper génèrent une entrée (sinon ignoré silencieusement).

### `dropshipping.CommissionPayment`
```
store (FK), dropshipper (FK)
amount, note, paid_at
```
Paiement du solde d'un dropshipper (US-7.3.4, `DropshipperPayView`) — **remet le solde à zéro implicitement** : le solde n'est jamais stocké, il est recalculé à chaque lecture (`sum(CommissionEntry.amount) - sum(CommissionPayment.amount)`, même philosophie que `CustomerRisk.is_risky`). `DropshipperPayView.post()` crée un paiement du montant exact du solde courant — impossible de payer un montant partiel ou arbitraire pour l'instant (choix simple, US ne demande pas de paiement partiel).

### `finance.Cost`
```
store (FK)
category : operational | marketing
label (texte libre, ex: "Facebook Ads", "Loyer local")
amount, period_start, period_end (date), note, created_at
```
Coût saisi manuellement par le vendeur (US-7.4.1). Deux catégories fixes seulement (pas de CRUD de catégories séparé, même compromis simplicité que `Supplier`/`FailureReason`) — le `label` libre permet de préciser le sous-type. `period_start`/`period_end` définissent la période couverte par ce coût (ex: un coût "Facebook Ads" de 15 000 DA pour tout le mois de juillet).

**Calcul de rentabilité (US-7.4.2, `backend/finance/views.py`)** — décision produit : **pas de répartition arbitraire** des coûts opérationnels/marketing sur un produit/wilaya/source précis (aucune clé de répartition fiable n'existe). Deux vues séparées :
- `ProfitabilityView` (`GET /api/finance/profitability/?group_by=product|wilaya|source`) — uniquement les coûts **directement attribuables** : coût produit (`Product.cost_price`/`VariantOption.cost_price`) et commission dropshipper (`dropshipping.CommissionEntry`). `profit = revenu − coût_produit − commission`.
- `ProfitabilitySummaryView` (`GET /api/finance/profitability/summary/`) — rentabilité globale de la période, incluant en plus les `Cost` opérationnels/marketing dont la période chevauche celle demandée. `net_profit = revenu − coût_produit − commission − coût_opérationnel − coût_marketing`.

Dans les deux cas, seules les commandes **actuellement** au statut `delivered` comptent (`_delivered_orders`), filtrées sur la date de la dernière transition vers `delivered` dans `OrderStatusHistory` (`Max('history__changed_at', filter=Q(history__status='delivered'))`) — pas `created_at`. Une commande livrée puis retournée sort naturellement du calcul (`status != 'delivered'`), cohérent avec la réversion de commission de l'Epic 7.3.

**"Source" = canal de vente**, déduit des données existantes sans nouveau champ (`_order_channel`) : `Order.dropshipper` renseigné → "Dropshipper — {nom}" ; sinon première entrée `OrderStatusHistory` sans auteur (`changed_by=None`, créée par `PublicOrderView`) → "Boutique en ligne" ; sinon → "Vente manuelle" (créée par owner/admin/dropshipper authentifié).

---

## API Endpoints (complets — Sprint 1 à 5)

### Auth
| Méthode | URL | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register/` | Non | Crée User + Store + Quota → OTP email |
| POST | `/api/auth/verify-email/` | Non | Valide OTP → tokens JWT |
| POST | `/api/auth/resend-verification/` | Non | Renvoie OTP |
| POST | `/api/auth/login/` | Non | Retourne access + refresh JWT |
| GET | `/api/auth/me/` | Oui | User + store_slug, store_name, team_role |
| POST | `/api/auth/password-reset/` | Non | Lien reset par email |
| POST | `/api/auth/password-reset/confirm/` | Non | Valide uid+token, met à jour MDP |
| POST | `/api/auth/google/register/` | Non | Inscription Google + store_name/slug |
| POST | `/api/auth/google/login/` | Non | Connexion Google |
| POST | `/api/token/refresh/` | Non | Renouvelle access token |

### Boutique
| Méthode | URL | Auth | Description |
|---|---|---|---|
| GET/PUT | `/api/stores/me/` | Oui | Boutique du vendeur connecté |
| GET | `/api/stores/me/quota/` | Oui | Quota trial restant |
| GET/PUT | `/api/stores/me/settings/` | Oui | Paramètres (low_stock_threshold) |
| GET/POST | `/api/stores/me/carriers/` | Oui | Comptes transporteurs (Yalidine/ZR Express) — lister / créer |
| PUT/DELETE | `/api/stores/me/carriers/<id>/` | Oui | Modifier (dont `is_default`, `is_active`) / supprimer un compte |

### Équipe
| Méthode | URL | Auth | Description |
|---|---|---|---|
| POST | `/api/team/invite/` | Oui | Invite membre (email + rôle) |
| GET | `/api/team/members/` | Oui | Liste membres (`?role=`) |
| PUT/DELETE | `/api/team/members/<id>/` | Oui | Modifier rôle / désactiver |
| GET/POST | `/api/team/accept-invitation/` | Non | Vérifie token / active compte |
| GET/POST | `/api/team/permissions/` | Oui (owner/admin) | Matrice de permissions par rôle (Epic 7.5) — GET catalogue+valeurs effectives, POST upsert un toggle (`role`, `permission`, `enabled`) |

### Produits
| Méthode | URL | Auth | Description |
|---|---|---|---|
| GET/POST | `/api/products/` | Oui | Liste paginée + créer (`?search=&category=&page=&per_page=`) |
| GET/PUT/DELETE | `/api/products/<id>/` | Oui | Détail / modifier / supprimer |
| POST | `/api/products/<id>/images/` | Oui | Upload image |
| DELETE | `/api/products/<id>/images/<img_id>/` | Oui | Supprimer image |
| GET/POST | `/api/products/<id>/variants/` | Oui | Variantes du produit |
| PUT/DELETE | `/api/products/<id>/variants/<vid>/` | Oui | Modifier / supprimer variante |
| POST | `/api/products/<id>/variants/<vid>/options/` | Oui | Ajouter option |
| PUT/DELETE | `/api/products/<id>/variants/<vid>/options/<oid>/` | Oui | Modifier / supprimer option |
| GET | `/api/products/low-stock/` | Oui | Articles en stock bas (≤ seuil) |
| GET | `/api/products/inventory/` | Oui | Inventaire complet paginé (`?search=&page=&per_page=`) — tous les produits/variantes avec leur stock, pas seulement ceux sous le seuil |
| GET/POST | `/api/products/categories/` | Oui | Liste paginée (`?tab=publie\|desactive\|corbeille`) + créer |
| GET/PUT/DELETE | `/api/products/categories/<id>/` | Oui | Détail / modifier / corbeille (soft delete) / supprimer définitif |
| POST | `/api/products/categories/<id>/restore/` | Oui | Restaurer depuis corbeille |
| GET/POST | `/api/products/suppliers/` | Oui | Liste + créer fournisseur |
| GET/PUT/DELETE | `/api/products/suppliers/<id>/` | Oui | Détail / modifier / supprimer |
| GET/POST | `/api/products/reviews/` | Oui | Liste paginée (`?approved=0\|1&page=&per_page=`) + ajout manuel |
| PUT/DELETE | `/api/products/reviews/<id>/` | Oui | Approuver/rejeter / supprimer avis |
| POST | `/api/public/reviews/` | Non | Visiteur soumet un avis (store_slug requis, is_approved=False) |
| GET/POST | `/api/products/suppliers/<id>/credits/` | Oui | Crédits fournisseur |
| GET/POST | `/api/products/suppliers/<id>/payments/` | Oui | Versements fournisseur |
| GET | `/api/products/supplier-credits/` | Oui | Tous les crédits (toutes fournisseurs) |
| GET | `/api/products/supplier-payments/` | Oui | Tous les versements |
| GET/POST | `/api/products/promotions/` | Oui | Liste (`?kind=code\|auto`) + créer un coupon/offre auto |
| GET/PUT/DELETE | `/api/products/promotions/<id>/` | Oui | Détail / modifier / supprimer |

### Commandes
| Méthode | URL | Auth | Description |
|---|---|---|---|
| GET/POST | `/api/orders/` | Oui | Liste paginée (`?status=&search=&page=&per_page=`) + créer (owner/admin) |
| GET/PUT/DELETE | `/api/orders/<id>/` | Oui | Détail / modifier / supprimer |
| POST | `/api/orders/<id>/status/` | Oui | Changer statut + note → log `OrderStatusHistory`. Accepte `carrier_id` optionnel ; si nouveau statut = `confirmed`, crée automatiquement une expédition (mockée) via le transporteur par défaut ou celui précisé — réponse enrichie de `carrier_warning` si aucun transporteur actif |
| GET | `/api/orders/stats/` | Oui | Compteurs par statut |
| GET | `/api/orders/stats/confirmation/` | Oui | Taux de confirmation (période, par confirmateur) |
| GET | `/api/orders/stats/orders/` | Oui (owner/admin ou `stats_view`) | Statistiques commandes — évolution quotidienne + répartition par statut (`?period=day\|week\|month\|custom&date_from=&date_to=`) |
| GET | `/api/orders/stats/returns/` | Oui (owner/admin ou `stats_view`) | Statistiques retours — total, taux de retour, évolution quotidienne |
| GET | `/api/orders/stats/failures/` | Oui (owner/admin ou `stats_view`) | Statistiques des échecs d'appel par `FailureReason` |
| GET | `/api/orders/stats/stock-sales/` | Oui (owner/admin ou `stats_view`) | Unités vendues par produit sur la période (agrégat `StockMovement reason='order_sale'`) |
| GET | `/api/orders/stats/products/` | Oui (owner/admin ou `stats_view`) | Par produit : commandes, confirmées, meilleure wilaya, meilleure source |
| GET | `/api/orders/stats/wilayas/` | Oui (owner/admin ou `stats_view`) | Par wilaya : commandes, confirmées, revenu |
| GET | `/api/orders/stats/sources/` | Oui (owner/admin ou `stats_view`) | Par source (canal de vente) : commandes, confirmées, revenu |
| GET | `/api/orders/stats/global/` | Oui (owner/admin ou `stats_view`) | Vue d'ensemble : commandes, taux de confirmation, livrées/retournées/annulées, CA, panier moyen |
| GET/PUT | `/api/orders/<id>/assignment/` | Oui | Voir / réassigner confirmateur |
| GET/POST | `/api/orders/<id>/call-attempts/` | Oui | Log d'appel détaillé (legacy, stats) |
| DELETE | `/api/orders/<id>/call-attempts/<cid>/` | Oui | Supprimer tentative |
| GET/POST | `/api/orders/failure-reasons/` | Oui | Raisons d'échec d'appel |
| PUT/DELETE | `/api/orders/failure-reasons/<id>/` | Oui | Modifier / supprimer |
| GET | `/api/orders/clients/` | Oui | Liste clients agrégée par téléphone (`?search=&risk_only=&page=&per_page=`) — `is_risky`/`manual_risk`/`risky_count` calculés à la volée |
| POST | `/api/orders/clients/<phone>/risk/` | Oui | Bascule le flag de risque manuel (`CustomerRisk.manual_risk`), indépendant du calcul automatique |
| GET/POST | `/api/orders/blacklist/` | Oui | Liste noire de la boutique — lister / bloquer un numéro (`phone`, `message` optionnel) |
| PUT/DELETE | `/api/orders/blacklist/<id>/` | Oui | Modifier le message / débloquer (supprimer) un numéro |
| GET | `/api/orders/complaints/` | Oui | Liste paginée (`?status=&search=&page=&per_page=`) |
| GET | `/api/orders/complaints/<id>/` | Oui | Détail + historique des échanges (`messages`) |
| POST | `/api/orders/complaints/<id>/status/` | Oui | Change le statut (`open\|in_progress\|resolved`) + note → log `ComplaintMessage` |
| POST | `/api/orders/complaints/<id>/messages/` | Oui | Ajoute un message sans changer le statut |

### Dropshipping & Commissions (Epic 7.3)
| Méthode | URL | Auth | Description |
|---|---|---|---|
| GET/POST | `/api/dropshipping/products/` | Oui | Sélection de produits d'un dropshipper (le sien) ; owner/admin via `?dropshipper=<id>` |
| DELETE | `/api/dropshipping/products/<id>/` | Oui | Retire un produit de la sélection (le dropshipper lui-même, ou owner/admin) |
| GET/POST | `/api/dropshipping/commissions/` | Oui (owner/admin) | Liste (`?dropshipper=<id>`) / configure une commission produit × dropshipper (upsert) |
| PUT/DELETE | `/api/dropshipping/commissions/<id>/` | Oui (owner/admin) | Modifier / supprimer une commission |
| GET | `/api/dropshipping/dropshippers/` | Oui (owner/admin) | Liste des dropshippers actifs avec solde (gagné/payé/à payer) |
| GET | `/api/dropshipping/dropshippers/<id>/` | Oui | Détail solde + historique commissions/paiements — owner/admin pour n'importe quel dropshipper, ou le dropshipper pour ses propres données |
| POST | `/api/dropshipping/dropshippers/<id>/pay/` | Oui (owner/admin) | Marque le solde courant comme payé (crée un `CommissionPayment` du montant exact du solde, remet le solde à 0) |

Commande manuelle par un dropshipper : `POST /api/orders/` accepte désormais aussi le rôle `dropshipper` (pas seulement owner/admin), avec vérification serveur que chaque `product` de `items` fait partie de sa sélection (`DropshipperProduct`), et `Order.dropshipper` renseigné automatiquement. `GET /api/orders/` filtre aussi les résultats à ses propres ventes pour ce rôle (même pattern que le filtre confirmateur → assignation).

### Finances (Epic 7.4)
| Méthode | URL | Auth | Description |
|---|---|---|---|
| GET/POST | `/api/finance/costs/` | Oui (owner/admin) | Liste (`?category=&period_start=&period_end=`, chevauchement de période) / création d'un coût opérationnel ou marketing |
| PUT/DELETE | `/api/finance/costs/<id>/` | Oui (owner/admin) | Modifier / supprimer un coût |
| GET | `/api/finance/profitability/` | Oui (owner/admin) | Rentabilité détaillée (`?group_by=product\|wilaya\|source&period_start=&period_end=`) — coûts directement attribuables uniquement (produit + commission) |
| GET | `/api/finance/profitability/summary/` | Oui (owner/admin) | Rentabilité globale de la période (`?period_start=&period_end=`) — inclut aussi les coûts opérationnels/marketing |

### Boutique publique & Checkout invité
| Méthode | URL | Auth | Description |
|---|---|---|---|
| GET | `/api/public/store/<slug>/` | Non | Infos boutique publique |
| GET | `/api/public/store/<slug>/categories/` | Non | Catégories publiques |
| GET | `/api/public/store/<slug>/products/` | Non | Liste produits publique |
| GET | `/api/public/store/<slug>/products/<id>/` | Non | Détail produit public (variantes, avis). Injecte `price` réduit + `original_price` si une offre automatique (`Promotion kind='auto'`) cible le produit ou une de ses catégories |
| POST | `/api/public/store/<slug>/promo/<code>/` | Non | Valide un code promo pour le panier fourni (`items`) — vérifie existence/validité puis calcule `discount_amount` réel via `compute_discount_for_items` (respecte le scope produits/catégories du coupon). 404/400 avec détail si invalide ou si aucun article éligible |
| POST | `/api/public/orders/` | Non | Checkout invité — crée Order + OrderItems, quota vérifié. **Vérifie d'abord `BlacklistedPhone`** : si le `phone` soumis est bloqué pour cette boutique, refuse (403, message du vendeur) avant toute création et incrémente `blocked_attempts`. Accepte `promo_code` optionnel : revalidé et verrouillé côté serveur (`select_for_update`) avant toute création, applique `discount_amount` sur la commande et incrémente `Promotion.uses_count`. Si `payment_method=chargily` : crée un checkout Chargily et renvoie `payment_url` (sinon `null` + détail explicite si l'appel API échoue). Si `cod` : quota incrémenté immédiatement |
| POST | `/api/public/complaints/` | Non | Dépose une réclamation sans compte (`store_slug`, `order_id`, `phone`, `subject`, `description`) — la commande doit appartenir à la boutique et le téléphone doit correspondre, sinon 404 générique |
| POST | `/api/public/webhooks/chargily/` | Non (signature HMAC) | Webhook Chargily — `checkout.paid` confirme la commande + incrémente le quota ; `checkout.failed`/`checkout.expired` laisse la commande en attente + email au vendeur (`Store.email`). Toujours 200, toujours journalisé (`PaymentWebhookLog`) |

---

## Sprints & User Stories

### ✅ Sprint 1 — Fondations (TERMINÉ — commit 31a6a97)
- Auth complète : OTP email, reset password Gmail SMTP, Google OAuth
- Multi-tenant : Store + SubscriptionQuota, isolation par `request.user.store`
- Trial : 50 commandes + 30 jours

### ✅ Sprint 2 — Équipe multi-rôles + modèle produit (TERMINÉ — commit cbd9919)
- TeamMember (Admin/Confirmateur/Dropshipper) + invitation email
- Permissions frontend par `team_role`
- Dashboard sombre (RiseCart-inspiré), sidebar expandable
- Page Ma Boutique, Page Équipe, AcceptInvitation

### ✅ Epic 2.2 — Catalogue produits (TERMINÉ — non encore commité séparément)
- CRUD produits complet (liste, formulaire, images)
- CategoriesPage avec sous-catégories

### ✅ Sprint 3 — Variantes, Fournisseurs, Avis, Catégories M2M (EN COURS)
- **Epic 3.1** ✅ : Variantes (ProductVariant + VariantOption) avec stock/prix/image/SKU par option
- **Epic 3.2** ✅ : Alerte stock bas (StoreSettings threshold, badge cloche, page /stock)
- **Epic 3.2 catégories** ✅ :
  - Product.categories = ManyToMany (un produit → plusieurs catégories)
  - Category.is_deleted = soft delete (Corbeille)
  - CategoriesPage : tabs Tous/Publié/Désactivé/Corbeille, pagination, checkboxes, restaurer
- **Epic 3.3** ✅ : Fournisseurs (Supplier CRUD, lié au produit)
- **Epic 3.4** ✅ : Avis clients modérés — ProductReview refactorisé (first/last_name, email, image),
  endpoint public `/api/public/reviews/` (no-auth), pagination + checkboxes + modal ajout dans ReviewsPage
- **Epic 3.5** ✅ : Crédits & versements fournisseurs (SupplierCredit, SupplierPayment)

---

### ✅ Sprint 4 — Commandes & Checkout (TERMINÉ)
- Dashboard commandes vendeur complet : liste (filtre statut, recherche, pagination), détail, création manuelle, assignation confirmateur (round-robin), statistiques, taux de confirmation
- Modal "État de la commande" directement depuis la liste (changer statut + note + wilaya/commune sans ouvrir le détail), colonne Note visible, icône historique (timeline note + statuts)
- Statuts d'appel séquentiels intégrés au statut principal : `no_answer_1/2/3` ("Non joignable — 1ère/2ème/3ème tentative"), remplace l'ancien flux `called`/`call_failed`
- Annulation automatique après 3 jours bloqué sur `no_answer_3` (`cancel_stale_calls`, note automatique) — **planification cron/Tâches Windows non configurée**

### ✅ Epic 5.1/5.2 — Boutique publique & Checkout invité (TERMINÉ)
- Storefront public : accueil, liste produits, fiche produit (`/store/:slug/...`) via endpoints `/api/public/store/<slug>/...`
- Panier (`CartContext`, localStorage, scoping par boutique) : Ajouter au panier / Acheter maintenant
- Tunnel de commande invité (`CheckoutPage`) : nom, téléphone, wilaya, commune, adresse — pas de compte requis, client identifié par téléphone
- Choix du mode de paiement : COD (fonctionnel) ou Chargily (en ligne)
- Incrémentation `orders_used` immédiate pour COD ; différée à la confirmation du paiement pour Chargily

### ✅ Epic 5.3 — Paiement en ligne Chargily (TERMINÉ)
- Création automatique d'un checkout Chargily à la commande (`orders/chargily.py::create_checkout`), redirection client vers la page de paiement hébergée
- Webhook `checkout.paid` → commande confirmée automatiquement + quota incrémenté, sans intervention manuelle
- Webhook `checkout.failed`/`checkout.expired` → commande non confirmée + email de notification au vendeur
- Chaque webhook journalisé dans `PaymentWebhookLog` (audit/débogage), signature HMAC vérifiée, toujours réponse HTTP 200
- Testé de bout en bout en mode test Chargily (checkout réel + webhook réel via tunnel ngrok)

### 🔜 Sprint 5 (suite) — Livraison
- **Epic 6.1 (US-6.1.1/6.1.2)** ✅ architecture faite, **mockée** : `CarrierAccount` (connexion comptes Yalidine/ZR Express, clé/jeton API, transporteur par défaut), création automatique de l'expédition à la confirmation de commande. Page `ParametresLivraisonPage.jsx`. **Vrais appels API non branchés** — en attente des accès (voir Risques) ; voir `docs/superpowers/specs/2026-07-02-carrier-integration-design.md` et `docs/superpowers/plans/2026-07-02-carrier-integration.md`
- Calcul automatique des frais de livraison par wilaya
- Génération bon de livraison / étiquette
- Notifications SMS client (provider TBD)

### ✅ Epic 6.2 — Promotions (TERMINÉ — branche `epic-6.2-promotions`)
- **US-6.2.1 — Coupons** : code promo (%/montant fixe), fenêtre de validité optionnelle, nombre d'utilisations max optionnel, ciblage optionnel produits/catégories (vide = tout le panier). Validation + verrouillage (`select_for_update`) côté serveur à la commande, protège contre la race condition sur `max_uses`. Page dashboard `CouponsPage.jsx`, champ + bouton "Appliquer" sur `CheckoutPage.jsx` (aperçu via `POST .../promo/<code>/` avec le panier, montant exact calculé serveur)
- **US-6.2.2 — Offre automatique** : réduction sur produit(s)/catégorie(s) ciblés, sans code, injectée directement dans `PublicProductDetailView`/`PublicProductListView`/`ProductSerializer` dashboard via `Product.active_auto_promotion()` (`price` réduit + `original_price`). Visible sur `StorefrontProductPage.jsx`, `StorefrontProductsPage.jsx`, `StorefrontHomePage.jsx` et badge `-X%` dans `ProductsPage.jsx` (colonne PRIX PROMO). Page dashboard `AutoPromotionsPage.jsx`
- Bug préexistant corrigé au passage : `ProductDetailView` référençait un champ `category` inexistant sur `Product` dans `select_related()`, faisant planter `GET /api/products/<id>/` en 500 (formulaire d'édition produit vide côté frontend, erreur avalée silencieusement)
- Modèle unique `products.Promotion` (`kind='code'|'auto'`) — voir section Modèles de données
- Pas de cumul coupon + offre auto sur une même commande (décision produit)
- Testé de bout en bout via `manage.py shell` (application, incrément `uses_count`, épuisement `max_uses`, injection prix réduit sur fiche produit)

### ✅ Epic 6.3 — Clients à risque et liste noire (TERMINÉ — branche `epic-6.3-clients-risque`)
- **Page Clients** (`ClientsPage.jsx`) : liste agrégée à la volée par téléphone (pas de modèle `Customer`), demandée en plus des US
- **US-6.3.1 — Détection de risque** : automatique si commandes `cancelled`/`returned` sur `risk_period_days` ≥ `risk_threshold_orders` (les deux configurables, `StoreSettings`, réglages éditables directement dans `AtRiskCustomersPage.jsx`) OU marquage manuel indépendant (`CustomerRisk.manual_risk`, bouton toggle par ligne)
- **US-6.3.2 — Liste noire** : `BlacklistedPhone` scopé par boutique (contrainte unique `(store, phone)` — non mutualisé). Une commande avec un numéro bloqué est refusée (403) avant toute création, avec le message personnalisé du vendeur affiché au client (`CheckoutPage.jsx` affiche déjà `err.response.data.detail`, aucun changement nécessaire côté storefront) ; `blocked_attempts`/`last_attempt_at` journalisés pour visibilité vendeur sur `BlacklistPage.jsx`
- Testé de bout en bout via `manage.py shell` (détection auto sur vraies données boutique, toggle manuel, création liste noire + tentative de commande bloquée + vérification qu'aucune commande n'est créée)

### 🔜 Sprint 6 — Paiements & Marketing
- ~~Intégration Chargily Pay~~ ✅ fait en avance (Epic 5.3)
- Pixels Meta / Google Analytics
- Abandoned cart reminders (SMS + email)
- ~~Codes promo~~ ✅ fait en avance (Epic 6.2)

### ✅ Epic 7.1 — Réclamations (TERMINÉ — branche `epic-7.1-reclamations`)
- **US-7.1.1 — Dépôt de réclamation** : formulaire public sans compte (`ComplaintFormPage.jsx`, route `/store/:slug/reclamation`) — le client fournit son téléphone (+ n° de commande optionnel, pré-rempli depuis l'écran de confirmation de `CheckoutPage.jsx` s'il vient de commander). `PublicComplaintCreateView` associe automatiquement la commande la plus récente correspondant au téléphone (ou celle précisée si `order_id` fourni), **sans jamais renvoyer de détails de commande au client** — un premier design exposait une liste de commandes par téléphone (`?phone=`), abandonné car il permettait à un tiers de deviner un numéro et consulter les commandes/montants de quelqu'un d'autre. 404 générique si aucune commande ne correspond. Accessible depuis le footer de toute la boutique (`StorefrontLayout.jsx`)
- **US-7.1.2 — Suivi de résolution** : workflow de statuts `open → in_progress → resolved` (`ComplaintStatusView`), historique des échanges **jamais supprimé** — chaque changement de statut ou message ajouté crée une nouvelle ligne `ComplaintMessage` (même pattern que `OrderStatusHistory`). Dashboard `ComplaintsPage.jsx` (liste + filtres) et `ComplaintDetailPage.jsx` (timeline + changement de statut + ajout de message)
- Modèles `orders.Complaint` / `orders.ComplaintMessage` — voir section Modèles de données
- Badge "réclamations ouvertes" dans la sidebar (même pattern que le badge stock bas)
- Testé de bout en bout via `manage.py shell` (mauvais téléphone rejeté en 404, bon téléphone crée la réclamation + message initial, changement de statut + ajout de message enrichissent bien l'historique, endpoint liste n'accepte pas POST)

### ✅ Epic 7.2 — Échanges produit (TERMINÉ — branche `epic-7.2-echanges`)
- **US-7.2.1 — Demande d'échange** : formulaire public sans compte (`ExchangeFormPage.jsx`, route `/store/:slug/echange`) — téléphone (+ n° commande optionnel, fallback commande la plus récente comme les réclamations) → `PublicOrderItemsView` révèle les articles d'**une seule** commande (jamais une liste) avec les variantes de remplacement disponibles du même produit → le client choisit l'article + la nouvelle variante + un motif. Workflow de validation vendeur (`ExchangeStatusView`, statuts `open → approved/rejected`), transition possible uniquement depuis `open` (protège du double traitement)
- **US-7.2.2 — Impact automatique sur le stock** : dans la même transaction que l'approbation, le stock de l'article rendu est incrémenté, celui du remplacement décrémenté, et 2 `products.StockMovement` sont créés (`exchange_return`/`exchange_issue`) — traçables dans `ExchangeDetailPage.jsx`
- Modèles `orders.ExchangeRequest` / `products.StockMovement` — voir section Modèles de données
- Badge "échanges ouverts" dans la sidebar (même pattern que réclamations/stock bas)
- **Ajouts complémentaires demandés en cours d'epic** : bouton "Laisser un avis" sur la fiche produit publique (modal note+commentaire, `POST /api/public/reviews/`, modéré comme avant) ; page `StockPage.jsx` étendue avec un inventaire complet paginé/recherchable (`GET /api/products/inventory/`), pas seulement le stock bas ; **décrémentation automatique du stock à la création de commande** (`_deduct_stock_for_order`, n'existait nulle part avant — voir section `products.StockMovement`)
- **Bugs corrigés au passage** : bouton "Ajouter une option" variante envoyait `value=''` (rejeté 400 par le backend, échouait silencieusement) ; plusieurs boutons de la boutique publique utilisaient `theme.btn.outline` (style dark) au lieu de `theme.btn.outlineLight`, quasi invisibles sur fond blanc ; produit avec une variante vide (sans aucune option) invisible du stock bas/inventaire, corrigé en retombant sur `product.stock`
- Testé de bout en bout via `manage.py shell` (stock ajusté correctement des deux côtés, mouvements tracés, double-approbation bloquée, décrémentation à la commande vérifiée)

### ✅ Epic 7.3 — Dropshipping et commissions (TERMINÉ — branche `epic-7.3-dropshipping`)
- **US-7.3.1 — Sélection de produits** : `DropshipperProduct` — le dropshipper choisit dans le catalogue du vendeur principal les produits à revendre (`DropshipperMyProductsPage.jsx`, recherche + toggle Ajouter/Retirer). Pas de stock propre, acté : le stock consommé reste celui du produit vendeur
- **US-7.3.2 — Configuration des commissions** : `Commission` (`dropshipper` × `product`, `commission_type` percentage/fixed) configurée par le vendeur (`DropshipperDetailPage.jsx`, un formulaire inline par produit sélectionné). `fixed` = montant par unité vendue, cohérent avec le prix unitaire des `OrderItem`
- **US-7.3.3 — Calcul automatique** : `_sync_commission_for_order` (`backend/orders/views.py`, appelée depuis `OrderStatusView.post()`) crée un `CommissionEntry` par `OrderItem` **uniquement** quand la commande passe à `delivered` (idempotent via `OneToOneField(order_item)`), et les **supprime** si la commande repasse en `returned`/`cancelled` — jamais de commission sur une commande annulée/retournée, y compris si elle avait déjà été livrée puis retournée
- **US-7.3.4 — Paiement de commission** : `CommissionPayment`, solde jamais stocké (recalculé à la lecture : gagné − payé, même philosophie que `CustomerRisk`), `DropshipperPayView` crée un paiement du montant exact du solde courant et l'historise (`DropshipperDetailPage.jsx` côté vendeur, `DropshipperMyEarningsPage.jsx` en lecture seule côté dropshipper)
- **Commande manuelle par le dropshipper** : `POST /api/orders/` étendu au rôle `dropshipper` (jusqu'ici réservé owner/admin), restreint côté serveur aux produits de sa sélection, `Order.dropshipper` auto-renseigné ; `GET /api/orders/` filtré à ses propres ventes (même pattern que le filtre confirmateur). `OrderFormPage.jsx` adapté pour ne proposer que les produits sélectionnés au dropshipper
- Nouvelle app Django `dropshipping/` (séparée de `orders`/`products` pour éviter les dépendances circulaires, même choix que `products.StockMovement` en son temps)
- Sidebar : "Dropshipping" (owner/admin) pointant vers la liste des dropshippers + solde ; "Mes produits"/"Mes commissions" pour le rôle `dropshipper`
- `UserSerializer` (`/api/auth/me/`) expose désormais `team_member_id`, nécessaire au dropshipper pour retrouver son propre solde
- Testé de bout en bout via `manage.py shell` (calcul de commission %, idempotence sur double passage à `delivered`, réversion sur `returned`, paiement soldant le solde à zéro) + build frontend

### ✅ Epic 7.4 — Finances et rentabilité (TERMINÉ — branche `epic-7.4-finances`)
- **US-7.4.1 — Saisie des coûts** : `finance.Cost` — deux catégories fixes (`operational`/`marketing`) + `label` libre pour préciser le sous-type (ex: "Facebook Ads", "Loyer local"), saisi par période (`period_start`/`period_end`). Pas de CRUD de catégories séparé (décision produit, cohérent avec `Supplier`/`FailureReason`). `CostsPage.jsx` — filtres par catégorie, modal d'ajout, suppression
- **US-7.4.2 — Calcul automatique de la rentabilité** : décision produit — **pas de répartition arbitraire** des coûts opérationnels/marketing sur un produit/wilaya/source (aucune clé fiable). Deux vues séparées : `ProfitabilityView` (par produit/wilaya/source, coûts directement attribuables uniquement : coût produit + commission dropshipper) et `ProfitabilitySummaryView` (rentabilité globale de la période, incluant en plus les coûts opérationnels/marketing saisis). Seules les commandes **actuellement** `delivered` comptent, filtrées sur la date de la dernière transition vers ce statut (pas `created_at`) — une commande livrée puis retournée sort naturellement du calcul, cohérent avec la réversion de commission de l'Epic 7.3
- **"Source" = canal de vente**, déduit sans nouveau champ (`_order_channel`) : dropshipper (`Order.dropshipper`) / boutique en ligne (première entrée d'historique sans auteur) / vente manuelle (créée par un membre authentifié)
- `ProfitabilityPage.jsx` — sélecteur de période, StatCards du résumé global (revenus/coût produit/commission/coût opérationnel/coût marketing/profit net), tableau détaillé avec bascule produit/wilaya/source
- Nouvelle app Django `finance/` (même choix d'isolation que `dropshipping/`)
- Sidebar : section "Finances" (owner/admin uniquement) → Rentabilité / Coûts
- Testé de bout en bout via `manage.py shell` + requêtes HTTP réelles (3 commandes livrées sur 3 canaux différents, coûts operational/marketing, vérification des totaux revenus/coût produit/commission/coûts/profit net et des ventilations par produit et par source) + build frontend

### ✅ Epic 7.5 — Permissions avancées par rôle (TERMINÉ — branche `epic-7.5-permissions`)
- Matrice de permissions **par rôle** (admin/confirmateur/dropshipper), pas par membre individuel (décision produit : "chaque rôle a son layout", plus simple à gérer). `team.RolePermission` stocke uniquement les overrides ; `team.models.DEFAULT_PERMISSIONS` reflète le comportement précédent (codé en dur avant cette epic) comme valeur par défaut
- Catalogue fixe de 12 permissions (`team.models.PERMISSION_CATALOG`) couvrant les sections principales de la sidebar + une nouveauté : `purchase_prices_view` (les prix d'achat/coûts n'étaient gatés nulle part avant)
- **Portée volontairement limitée à la lecture** — les actions d'écriture (créer/modifier/supprimer) restent réservées owner/admin partout, inchangé (`is_owner_or_admin`). Deux enforcements serveur réels : `cost_price` retiré de `ProductSerializer`/`VariantOptionSerializer` sans `purchase_prices_view` ; `dropshipping_view`/`finances_view` permettent d'élever un confirmateur/dropshipper en lecture seule sur les vues Dropshipping/Finances normalement owner/admin-only (`is_owner_or_admin(request) OR has_permission(request, key)`)
- `UserSerializer` (`/api/auth/me/`) expose `permissions: {clé: bool}` — `DashboardLayout.jsx` refactorisé pour piloter la sidebar via `user.permissions` plutôt que des `teamRole === '...'` codés en dur (ce qui reste identitaire — pages propres au dropshipper, qui gère l'équipe — n'est pas passé par le catalogue)
- `PermissionsPage.jsx` (owner/admin, `/dashboard/equipe/permissions`) — matrice de toggles, sauvegarde immédiate par case via `POST /api/team/permissions/`
- Testé de bout en bout via `manage.py shell` + requêtes HTTP réelles (permissions par défaut d'un confirmateur, `cost_price` masqué/visible selon le rôle, 403 puis 200 sur Finances après octroi de `finances_view`, écriture toujours bloquée malgré l'octroi de la vue, matrice elle-même inaccessible à un non-admin) + build frontend

### ✅ Epic 8.1 — Statistiques complètes (TERMINÉ — branche `epic-8.1-statistiques`)
- **US-8.1.1 — Tableau de bord statistique** : 8 pages sous un nouveau menu "Statistiques" (remplace l'ancien placeholder désactivé) — Statistiques globales, Statistiques commandes (bar quotidien + pie par statut), Statistique retours, Statistique des échecs (par `FailureReason`), Statistique vente de stock (par produit, via `StockMovement`), Statistiques des produits (meilleure wilaya/source), Statistique par confirmateur (réutilise `ConfirmationRatePage` existante), Statistiques par wilaya, Statistiques des sources (pie + tableau)
- **Filtrage par période partout** : même contrat que `ConfirmationRatePage` (`?period=day|week|month|custom&date_from=&date_to=`), factorisé dans `orders/utils.py::parse_period()` et côté frontend dans `pages/orders/stats/statsShared.jsx::usePeriod()`/`PeriodFilter`
- **"Source" (canal de vente)** factorisée dans `orders/utils.py::order_channel()` — déplacée depuis `finance/views.py` (qui l'importe désormais) pour devenir la version canonique partagée, plutôt que deux implémentations dupliquées
- Nouvelle permission `stats_view` dans le catalogue Epic 7.5, même défaut que l'ancien comportement codé en dur (masqué pour confirmateur/dropshipper) ; les 8 endpoints + `ConfirmationRateView` acceptent `is_owner_or_admin(request) OR has_permission(request, 'stats_view')`
- ⚠️ **Bug rencontré et corrigé pendant le développement** : `usePeriod()` retournait une fonction `queryString` recréée à chaque rendu (non mémoïsée) — cassait la dépendance `useCallback` des pages appelantes et provoquait une **boucle de fetch infinie** (spinner bloqué indéfiniment sur "Chargement…", API martelée en continu). Corrigé en mémoïsant `queryString` avec `useCallback([period, dateFrom, dateTo])` dans `statsShared.jsx` — un seul correctif a réparé les 8 pages d'un coup puisqu'elles partagent toutes ce hook
- Testé de bout en bout via `manage.py shell` + requêtes HTTP réelles sur les 8 endpoints (commandes/retours/échecs/vente de stock/produits/wilayas/sources/global) + build frontend

### 🔜 Sprint 8 (suite) — Canaux de vente, marketing, webhooks, abonnement
- Plans d'abonnement : Starter / Pro / Business (limites TBD)
- Intégration **Shopify** bidirectionnelle
- Intégration **Meta Commerce** (Facebook/Instagram shop)
- Mise en production (CI/CD, SSL, domaines)

---

## Conventions de Code

### Backend (Django)
- Login par **email** (pas username) — `USERNAME_FIELD = 'email'`
- Helper `_get_store(request)` dans chaque view pour isolation multi-tenant
- Transactions atomiques pour les opérations multi-modèles (`@transaction.atomic`)
- Serializers dans `serializers.py`, vues dans `views.py`, URLs dans `urls.py`
- Nommage apps : snake_case (`accounts`, `stores`, `orders`, `products`)
- Images servies via MEDIA_URL/MEDIA_ROOT en dev (`/media/`)
- Pagination : `?page=&per_page=` → retourne `{count, page, per_page, results}`

### Frontend (React)
- **Zéro CSS custom** — Tailwind uniquement
- **`theme.js`** = source de vérité pour toutes les couleurs/styles
- Composants dans `components/`, pages dans `pages/`
- `AuthContext` pour tout ce qui touche à l'état de l'utilisateur
- `api/axios.js` pour tous les appels HTTP (jamais `fetch` directement)
- Nommage composants : PascalCase. Fichiers : PascalCase.jsx
- Tailwind v4 : utiliser les classes canoniques (ex: `shrink-0` et non `flex-shrink-0`)

---

## Décisions Techniques Prises

| Décision | Choix |
|---|---|
| Multi-tenant | FK (pas de schemas séparés) |
| Auth | JWT (simplejwt) — pas de sessions Django |
| Login | Email (pas username) |
| Trial | 50 commandes + 30 jours |
| Thème | Mauve/Violet (violet-600) |
| CSS | Tailwind v4 uniquement |
| Catégories produit | ManyToMany — un produit peut appartenir à plusieurs catégories |
| Suppression catégorie | Soft delete (Corbeille) avant suppression définitive |
| Stock variante | Indépendant par VariantOption (price, cost_price, stock, sku, image propres) |
| Alerte stock bas | Seuil configurable par boutique (StoreSettings.low_stock_threshold, défaut 5) |
| Checkout invité | Pas de compte client — identifié par téléphone. Pas de modèle Customer/blacklist pour l'instant (différé) |
| Panier storefront | CartContext + localStorage, scoping par slug boutique (pas de backend cart) |
| Suivi appel commande | Statuts `no_answer_1/2/3` intégrés au statut principal de la commande (pas de sous-état séparé) |
| Quota commandes | Incrémenté à la création pour COD ; incrémenté au webhook `checkout.paid` pour Chargily (évite de compter les paniers Chargily abandonnés) |
| Paiement Chargily | URL API différente en test (`/test/api/v2`) vs live (`/api/v2`) — à vérifier à chaque déploiement |
| Intégration transporteurs | Architecture complète construite avec clients mockés (`MockCarrierClient`) en attendant les accès API réels Yalidine/ZR Express — permet de livrer le flux métier (connexion compte, confirmation → expédition, tracking) sans bloquer sur des accès externes non obtenus |
| Design system frontend | Style "Premium SaaS sombre" (Linear/Vercel) centralisé dans `theme.js` — fonds neutres quasi-noirs, bordures hairline, accent violet réservé aux états interactifs |

---

## TBD (À Décider)

| Sujet | Statut |
|---|---|
| Provider SMS (abandons panier, notifications) | Non décidé — Sprint 5 |
| Limites exactes plans Starter/Pro/Business | Non décidé — Sprint 8 |
| Domaine de production final | Non décidé |
| Infra de déploiement (VPS, Railway, Render...) | Non décidé — Sprint 8 |
| Planification `cancel_stale_calls` | Commande management prête mais non planifiée (cron/Tâches Windows à configurer) |
| Modèle Customer / liste noire | Différé — US-5.2.1 mentionne l'identification client par téléphone mais pas de modèle dédié encore |
| Clés Chargily production | Seules les clés de test sont configurées (`.env` local, non commité) |
| Accès API Yalidine / ZR Express | Non obtenus — `orders/carriers/` utilise des clients mockés (`MOCK-{carrier}-...`) en attendant. Brancher les vrais clients dans `yalidine.py`/`zr_express.py` dès réception des accès |

---

## Risques Identifiés

- **Délai serré** : 4 mois pour ~25 modules est ambitieux en solo → réévaluer à chaque sprint
- **APIs externes** : Yalidine, ZR Express, Chargily, Meta → initier les demandes d'accès dès maintenant
- **Sync Shopify** : risques de conflits bidirectionnels → traiter en dernier (Sprint 8)

---

## Commandes Utiles

```bash
# Backend
cd backend
venv/Scripts/python manage.py runserver          # Démarrer
venv/Scripts/python manage.py makemigrations     # Après modification models
venv/Scripts/python manage.py migrate            # Appliquer migrations
venv/Scripts/python manage.py createsuperuser    # Admin Django

# Frontend
cd frontend
npm run dev      # Démarrer Vite (port 5173)
npm run build    # Build production
```
