# CLAUDE.md — MZSolutions

> **RÈGLE N°1 — À lire avant chaque modification :**
> Consulter ce fichier intégralement avant toute action sur le projet. Respecter les conventions, l'architecture, et l'état des sprints. Ne jamais deviner ce qui existe — lire le code. Ne jamais utiliser de CSS custom — Tailwind uniquement. Toujours utiliser `theme.js` pour les couleurs et styles réutilisables.

---

## Workflow de développement par Epic

Chaque epic envoyée par l'utilisateur suit ce cycle, sans qu'il soit nécessaire de le redemander :

1. **Créer une branche** nommée d'après l'epic (ex. `epic-livraison-yalidine`), à partir de `main` à jour.
2. **Travailler l'epic** jusqu'à ce qu'elle soit complète et peaufinée (pas de demi-mesure — build/tests vérifiés avant de considérer terminé).
3. **Mettre à jour `CLAUDE.md`** systématiquement à la fin (nouveaux modèles, endpoints, composants, conventions, décisions techniques, sprint concerné).
4. **Commit + push** de la branche.
5. **Retour sur `main`** (merge ou PR selon ce que demande l'utilisateur au moment venu — à confirmer avant tout merge vers `main`).
6. Passer à l'epic suivante.

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
components/StatusBadge.jsx      — badge de statut commande, mapping centralisé (remplace les couleurs inline dupliquées par page)
components/EmptyState.jsx       — état vide réutilisable (icône + titre + description)
pages/Auth.jsx                  — login/inscription (split layout)
pages/Dashboard.jsx             — tableau de bord vendeur
pages/StorePage.jsx             — Ma boutique
pages/TeamPage.jsx              — gestion équipe
pages/StockPage.jsx             — alertes stock bas + réglage seuil
pages/products/ProductsPage.jsx       — liste produits (pagination, recherche)
pages/products/ProductFormPage.jsx    — créer/modifier produit (variantes, images, multi-catégories)
pages/products/CategoriesPage.jsx     — gestion catégories (Corbeille, pagination, checkboxes)
pages/products/SuppliersPage.jsx      — CRUD fournisseurs
pages/products/ReviewsPage.jsx        — modération avis
pages/products/SupplierCreditPage.jsx    — crédits fournisseurs
pages/products/SupplierPaymentPage.jsx   — versements fournisseurs
pages/orders/OrdersPage.jsx           — liste commandes (filtre statut, recherche, modal "État de la commande" avec note + wilaya/commune, colonne Note, icône historique)
pages/orders/OrderDetailPage.jsx      — détail commande (changer statut, sélection transporteur si confirmation + affichage tracking, assignation confirmateur, historique en timeline)
pages/orders/OrderFormPage.jsx        — création commande manuelle (vendeur)
pages/orders/CancellationsPage.jsx    — demandes d'annulation / confirmées
pages/orders/FailureReasonsPage.jsx   — raisons d'échec d'appel
pages/orders/ConfirmationRatePage.jsx — taux de confirmation par confirmateur
pages/ParametresLivraisonPage.jsx     — comptes transporteurs (Yalidine/ZR Express) : onglets "Sociétés de livraison" (cartes) / "Mes Sociétés de livraison" (tableau : toggle statut, copier clé/jeton API, badge défaut)
pages/storefront/StorefrontHomePage.jsx     — page d'accueil boutique publique
pages/storefront/StorefrontProductsPage.jsx — liste produits publique
pages/storefront/StorefrontProductPage.jsx  — fiche produit publique (Ajouter au panier / Acheter maintenant)
pages/storefront/CheckoutPage.jsx           — tunnel de commande invité (panier, infos client, COD/Chargily)
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
```

### `team.TeamMember`
```
store (FK → Store), user (OneToOne nullable)
role: admin | confirmateur | dropshipper
first_name, last_name, email, phone
invite_token (auto-généré), is_active, invited_at, activated_at
wilaya, commune, address (extras dropshipper)
```

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

### `orders.Order`
```
store (FK → Store)
status : pending | no_answer_1 | no_answer_2 | no_answer_3 | confirmed | shipped |
         delivered | returned | cancel_requested | cancelled
first_name, last_name, phone, wilaya, commune, address
subtotal, shipping_cost, total (recalculés via order.recalculate())
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
| GET | `/api/products/low-stock/` | Oui | Articles en stock bas |
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

### Commandes
| Méthode | URL | Auth | Description |
|---|---|---|---|
| GET/POST | `/api/orders/` | Oui | Liste paginée (`?status=&search=&page=&per_page=`) + créer (owner/admin) |
| GET/PUT/DELETE | `/api/orders/<id>/` | Oui | Détail / modifier / supprimer |
| POST | `/api/orders/<id>/status/` | Oui | Changer statut + note → log `OrderStatusHistory`. Accepte `carrier_id` optionnel ; si nouveau statut = `confirmed`, crée automatiquement une expédition (mockée) via le transporteur par défaut ou celui précisé — réponse enrichie de `carrier_warning` si aucun transporteur actif |
| GET | `/api/orders/stats/` | Oui | Compteurs par statut |
| GET | `/api/orders/stats/confirmation/` | Oui | Taux de confirmation (période, par confirmateur) |
| GET/PUT | `/api/orders/<id>/assignment/` | Oui | Voir / réassigner confirmateur |
| GET/POST | `/api/orders/<id>/call-attempts/` | Oui | Log d'appel détaillé (legacy, stats) |
| DELETE | `/api/orders/<id>/call-attempts/<cid>/` | Oui | Supprimer tentative |
| GET/POST | `/api/orders/failure-reasons/` | Oui | Raisons d'échec d'appel |
| PUT/DELETE | `/api/orders/failure-reasons/<id>/` | Oui | Modifier / supprimer |

### Boutique publique & Checkout invité
| Méthode | URL | Auth | Description |
|---|---|---|---|
| GET | `/api/public/store/<slug>/` | Non | Infos boutique publique |
| GET | `/api/public/store/<slug>/categories/` | Non | Catégories publiques |
| GET | `/api/public/store/<slug>/products/` | Non | Liste produits publique |
| GET | `/api/public/store/<slug>/products/<id>/` | Non | Détail produit public (variantes, avis) |
| POST | `/api/public/orders/` | Non | Checkout invité — crée Order + OrderItems, quota vérifié. Si `payment_method=chargily` : crée un checkout Chargily et renvoie `payment_url` (sinon `null` + détail explicite si l'appel API échoue). Si `cod` : quota incrémenté immédiatement |
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

### 🔜 Sprint 6 — Paiements & Marketing
- ~~Intégration Chargily Pay~~ ✅ fait en avance (Epic 5.3)
- Pixels Meta / Google Analytics
- Abandoned cart reminders (SMS + email)
- Codes promo

### 🔜 Sprint 7 — Équipe & Dropshipping
- Dropshipping intra-store : revendeur vend les produits du vendeur principal
- Permissions avancées par rôle

### 🔜 Sprint 8 — Abonnements, Shopify Sync & Production
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
