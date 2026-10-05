# Interface admin de la plateforme MZSolutions — design (2026-10-04)

Demande : une vraie interface d'administration de la **plateforme** (aujourd'hui seul
l'admin Django, quasi vide, existe), inspirée de plateforme-prof (`administration/`),
Taftech (25 pages admin, composants partagés) et SOMIZ (SUPERADMIN/ADMIN, audit RGPD,
anti-brute-force). Périmètre validé : vue d'ensemble + KPI, abonnements & paiements,
comptes & boutiques, système & sécurité, réglages plateforme, communication,
modération & transporteurs.

## Décisions validées

| Sujet | Décision |
| --- | --- |
| Approche | **A** — étendre l'espace `/platform-admin` et l'app `platform_admin` existants (pas de nouvelle app/SPA, pas de thème Django admin) |
| Niveaux d'accès | **Deux niveaux : admin + superadmin** (pas de matrice fine tant qu'on est seul) |
| Suspension d'une boutique | **Tout bloquer** : plus de connexion vendeur/équipe, vitrine « indisponible », plus de commande. Données conservées, réactivation en un clic, motif obligatoire, tout audité |
| Découpage | 5 phases, chacune avec son plan et ses tests (ci-dessous) |

## Phases

1. **Fondations** — niveaux d'accès, composants/layout partagés, vue d'ensemble + KPI *(détaillée plus bas)*
2. **Comptes & boutiques** — liste de tous les vendeurs/boutiques, fiche détaillée, suspension/réactivation (motif), déconnexion forcée, reset de mot de passe par email, gestion des admins
3. **Abonnements & paiements** — paliers modifiables, historique `SubscriptionPayment`, ajout de quota/prolongation manuelle, remboursement enregistré (motif obligatoire), export CSV
4. **Système, sécurité & réglages** — santé des services, journal des erreurs 500 groupées, tentatives de connexion bloquées, réglages plateforme modifiables (jours d'essai, TVA/identité de facturation, maintenance) qui surchargent le `.env`
5. **Communication, modération & transporteurs** — annonces aux vendeurs (aperçu du nombre exact de destinataires + confirmation), messages de contact, vue des intégrations transporteurs/canaux par boutique

## Phase 1 — Fondations

### 1. Niveaux d'accès

- Nouveau champ `accounts.User.is_platform_superadmin` (bool). `is_platform_admin` (existant) devient le niveau « admin » ; un superadmin a **aussi** le niveau admin.
- Migration de données : tout `is_platform_admin=True` existant devient superadmin (l'accès actuel ne change pas).
- `platform_admin/permissions.py` : `is_platform_admin(request)` (admin **ou** superadmin) et `is_platform_superadmin(request)`.
- **Admin** : voir les boutiques, entrer en mode « Gérer cette boutique », suspendre avec motif, consulter paiements/audit/santé.
- **Superadmin seulement** : modifier paliers/prix/réglages, rembourser, ajouter du quota, créer/retirer des admins, activer le service de confirmation (`toggle`/`bulk-toggle`), inviter/gérer les confirmateurs.
- Contrôle **côté serveur** sur chaque route, avec un test d'intégration par route sensible (un admin simple reçoit 403, un superadmin 200). Le frontend masque seulement les liens.
- `/api/auth/me/` expose `platform_level` : `'superadmin' | 'admin' | null`.
- Anti-brute-force : l'admin Django et les routes de connexion suivent le même plafond (cf. SOMIZ) — vérifié, étendu si absent.

### 2. Vue d'ensemble — `GET /api/platform-admin/overview/` (admin)

- **Boutiques** : total, en essai, abonnées, expirées, suspendues.
- **Revenus** : encaissé ce mois et sur 12 mois (somme des `SubscriptionPayment` `status='success'`), paiements en attente / échoués.
- **Activité** : commandes plateforme sur 30 jours (séries 12 mois), nouvelles boutiques par mois.
- **Alertes cliquables** (renvoient vers la liste filtrée) : essais qui expirent sous 3 jours, quota > 80 %, paiements en attente depuis plus d'1 h, boutiques suspendues.
- Calculs côté serveur (agrégats SQL, jamais de boucle par boutique), un seul appel.
- Graphiques avec la bibliothèque déjà utilisée par les pages de statistiques de la boutique.
- Rafraîchissement toutes les 60 s **uniquement onglet visible**, sans remise à zéro du scroll ni des filtres (`load()` périodique ne repasse jamais l'état en chargement).
- ⚠️ Limite assumée : l'historique des revenus ne démarre qu'avec SofizPay (les anciens paiements Chargily n'ont jamais été enregistrés).

### 3. Composants et layout partagés (`frontend/src/components/admin/`)

- `AdminPageHeader` — icône, titre, sous-titre, actions, bouton « Aide » repliable (état mémorisé par page, `localStorage` en try/catch).
- `AdminList` — recherche (debounce), filtres, pagination serveur, état dans l'URL (`?search=&page=`), actions par ligne avec `ConfirmDialog`. Un seul pattern pour toutes les listes des phases suivantes.
- `AdminState` — `AdminError` (message + « Réessayer ») et `AdminEmpty`.
- Réutilisés tels quels : `StatCard`, `ConfirmDialog`, `Select`, `Toast`.
- `PlatformAdminLayout` : sidebar en groupes (Principal / Boutiques / Finances / Système / Communication), badges d'alerte (valeurs de `overview`, rechargées à chaque navigation), tiroir mobile, liens superadmin masqués pour un admin.
- Conventions du projet : Tailwind uniquement, couleurs via `theme.js`, jamais de `<select>` natif.

### Tests

- Backend : un test par route de niveau (403/200), agrégats de `overview` sur données connues (boutiques essai/abonnée/expirée/suspendue, revenus, alertes), non-régression des 6 routes existantes de `platform_admin`.
- Frontend : rendu du layout selon `platform_level`, `AdminList` (recherche, pagination, état dans l'URL), états erreur/vide.

## Hors périmètre de la phase 1

Suspension de boutique, gestion des comptes, paliers/paiements, réglages, santé système, annonces : phases 2 à 5. Le champ `Store.is_active` existe déjà ; son application effective (blocage connexion + vitrine) est livrée en phase 2.
