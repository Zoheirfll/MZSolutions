# CLAUDE.md — MZSolutions

> **RÈGLE N°1 — À lire avant chaque modification :**
> Consulter ce fichier intégralement avant toute action sur le projet. Respecter les conventions, l'architecture, et l'état des sprints. Ne jamais deviner ce qui existe — lire le code. Ne jamais utiliser de CSS custom — Tailwind uniquement. Toujours utiliser `theme.js` pour les couleurs et styles réutilisables.

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

### Structure Backend (`backend/`)
```
config/          — settings, urls, wsgi
accounts/        — modèle User custom (login par email), auth JWT
stores/          — Store, SubscriptionQuota
core/            — app Django générique (à utiliser pour utilitaires partagés)
```

### Structure Frontend (`frontend/src/`)
```
api/axios.js          — instance Axios + intercepteurs
context/AuthContext.jsx — état auth global (user, login, logout, register)
theme.js              — couleurs et classes Tailwind centralisées
pages/Auth.jsx        — page login/inscription (split layout)
pages/Dashboard.jsx   — espace vendeur
components/PrivateRoute.jsx — protection des routes
```

### Thème (mauve/violet)
Toujours importer et utiliser `theme.js` — ne jamais hardcoder des classes Tailwind de couleur directement.
```js
import { theme } from '../theme'
// theme.btn.primary, theme.input, theme.logo, theme.hero, theme.badge.*
```
Couleur primaire : `violet-600` (#7c3aed). Gradient hero : `#2e1065 → #6d28d9 → #7c3aed`.

---

## Modèles de données (état actuel)

### `accounts.User`
```
email (unique, USERNAME_FIELD)
first_name, last_name, phone
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
orders_limit (default 50)
orders_used (default 0)
trial_ends_at (default now + 30 jours)
[computed] orders_remaining, is_trial_active
```

---

## API Endpoints (Sprint 1 — implémentés)

| Méthode | URL | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register/` | Non | Crée User + Store + Quota → renvoie pending_verification |
| POST | `/api/auth/verify-email/` | Non | Valide code OTP → retourne tokens JWT |
| POST | `/api/auth/resend-verification/` | Non | Renvoie un nouveau code OTP |
| POST | `/api/auth/login/` | Non | Retourne access + refresh JWT |
| GET | `/api/auth/me/` | Oui | User connecté avec store_slug |
| POST | `/api/auth/password-reset/` | Non | Envoie lien de réinitialisation par email |
| POST | `/api/auth/password-reset/confirm/` | Non | Valide uid+token, met à jour le MDP |
| POST | `/api/auth/google/register/` | Non | Inscription via Google + store_name/slug |
| POST | `/api/auth/google/login/` | Non | Connexion via Google (compte existant requis) |
| GET/PUT | `/api/stores/me/` | Oui | Boutique du vendeur connecté |
| GET | `/api/stores/me/quota/` | Oui | Quota trial restant |
| POST | `/api/token/refresh/` | Non | Renouvelle le token access |

---

## Sprints & User Stories

### ✅ Sprint 1 — Fondations (TERMINÉ)
**Epic 1.1 — Authentification**
- US-1.1.1 : Inscription classique (email + password) + Google OAuth → vérification email par code OTP 6 chiffres (15 min)
- US-1.1.2 : Connexion JWT (classique + Google) avec messages d'erreur clairs, détection compte non vérifié
- US-1.1.3 : Réinitialisation mot de passe par email (Gmail SMTP, lien 1h)

**Epic 1.2 — Boutique & Multi-Tenant**
- US-1.2.1 : Création boutique avec slug unique global → URL publique immédiate
- US-1.2.2 : Isolation des données par vendeur (filtre systématique par store)
- US-1.2.3 : Trial gratuit à la création (50 commandes, 30 jours), quota visible dashboard

---

### 🔜 Sprint 2 — Catalogue Produits
**Epic 2.1 — Catégories**
- US-2.1.1 : Créer/modifier/supprimer des catégories (arborescence)
- US-2.1.2 : Un produit peut appartenir à plusieurs catégories (many-to-many)

**Epic 2.2 — Produits**
- US-2.2.1 : Créer produit (nom, description, prix, stock, images, catégories)
- US-2.2.2 : Modifier / archiver un produit
- US-2.2.3 : Variantes produit (taille, couleur, etc.)
- US-2.2.4 : Import produits en masse (CSV)

---

### 🔜 Sprint 3 — Boutique Publique & Panier
- Page boutique publique (URL : `mzsolutions.app/<slug>`)
- Catalogue produits visible client
- Panier (ajout, suppression, modification quantité)
- Page produit détail

---

### 🔜 Sprint 4 — Commandes & Checkout
- Passage de commande (infos client : nom, téléphone, adresse, wilaya)
- Statuts commande : en attente → confirmée → expédiée → livrée → annulée
- Dashboard commandes vendeur
- Incrémentation `orders_used` à chaque commande (vérification quota)

---

### 🔜 Sprint 5 — Livraison
- Intégration **Yalidine** (API livraison)
- Intégration **ZR Express**
- Calcul automatique des frais de livraison par wilaya
- Génération bon de livraison / étiquette
- Notifications SMS client (provider TBD — voir TBD ci-dessous)

---

### 🔜 Sprint 6 — Paiements & Marketing
- Intégration **Chargily Pay** (paiement en ligne Algérie)
- Paiement à la livraison (COD)
- Pixels Meta / Google Analytics
- Abandoned cart reminders (SMS + email)
- Codes promo

---

### 🔜 Sprint 7 — Équipe & Dropshipping
- Gestion équipe (TeamMember, Role) : propriétaire / manager / staff
- Dropshipping intra-store : revendeur vend les produits du vendeur principal
- Permissions par rôle

---

### 🔜 Sprint 8 — Abonnements, Shopify Sync & Production
- Plans d'abonnement : Starter / Pro / Business (limites TBD)
- Intégration **Shopify** bidirectionnelle (sync produits + commandes)
- Intégration **Meta Commerce** (Facebook/Instagram shop)
- Mise en production (CI/CD, SSL, domaines)
- Tests de charge et sécurité

---

## Conventions de Code

### Backend (Django)
- Login par **email** (pas username) — `USERNAME_FIELD = 'email'`
- Toujours filtrer par `request.user.store` dans les vues (isolation multi-tenant)
- Transactions atomiques pour les opérations multi-modèles (`@transaction.atomic`)
- Serializers dans `serializers.py`, vues dans `views.py`, URLs dans `urls.py`
- Nommage apps : snake_case (`accounts`, `stores`, `orders`, `products`)

### Frontend (React)
- **Zéro CSS custom** — Tailwind uniquement
- **`theme.js`** = source de vérité pour toutes les couleurs/styles
- Composants dans `components/`, pages dans `pages/`
- `AuthContext` pour tout ce qui touche à l'état de l'utilisateur
- `api/axios.js` pour tous les appels HTTP (jamais `fetch` directement)
- Nommage composants : PascalCase. Fichiers : PascalCase.jsx

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

---

## TBD (À Décider)

| Sujet | Statut |
|---|---|
| Provider SMS (abandons panier, notifications) | Non décidé — Sprint 5 |
| Limites exactes plans Starter/Pro/Business | Non décidé — Sprint 8 |
| Domaine de production final | Non décidé |
| Infra de déploiement (VPS, Railway, Render...) | Non décidé — Sprint 8 |

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
