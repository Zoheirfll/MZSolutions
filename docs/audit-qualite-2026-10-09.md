# Audit qualité « anti-vibe-coding » — 2026-10-09

Branche : `epic-landing-page`. Rien n'est commité à ce stade.

**Méthode** : chaque point de la checklist a été vérifié dans le code réel (recherche de fichiers, lecture, tests, build, rendu navigateur) avant d'être déclaré fait. Les points non vérifiés sont marqués comme tels — aucun n'est déclaré « fait » sans preuve.

Légende : ✅ fait et vérifié · 🟡 partiel · ⬜ non fait · ❓ décision requise

## Sécurité / ressenti d'interface

| Point | Statut | Détail |
|---|---|---|
| Bouton qui attend le serveur | 🟡 | Les formulaires de connexion/inscription affichent un état de chargement et se désactivent. Pas audité page par page sur les ~70 pages du dashboard. |
| Squelettes de chargement | 🟡 | Composant `TableSkeleton` appliqué à 16 listes (commandes, produits, clients, clients à risque, liste noire, dropshippers, échanges, règles de dispatch, promotions, coupons, avis, fournisseurs, crédits et versements fournisseurs, coûts, paramètres). Les autres écrans (statistiques, tableaux de bord, pages de l'administration) gardent leur spinner. |
| Écran qui s'ouvre vide | 🟡 | `EmptyState` existe. Sur la landing, les sections apparaissent au défilement (animation) : visibles immédiatement si « réduire les animations » est actif. |
| Animation au tap | ✅ | Tout bouton actif se comprime légèrement (`index.css`), désactivé si `prefers-reduced-motion`. |
| Support hors ligne | 🟡 | Bandeau « hors ligne » global + service worker **minimal** (`public/sw.js`) : page de secours `offline.html` si le réseau tombe pendant une navigation. Aucun asset ni appel API en cache (pas de version périmée). Actif en production uniquement. |

## Mobile / mise en page

| Point | Statut | Détail |
|---|---|---|
| Défilement horizontal | 🟡 | Vérifié à 375 px sur la landing et la connexion (aucun). Pas mesuré sur le reste de l'application. |
| Menu mobile | 🟡 | Landing : oui. Dashboard : existant. Boutique publique : **corrigé**, bouton menu sous 640 px (test ajouté). |
| Dépassement mobile / optimisation mobile | 🟡 | Landing et connexion vérifiées ; reste non audité. |
| Points de rupture mobiles | ✅ | Landing mobile-first (grilles 1/2/4 colonnes, barre CTA mobile). |
| CTA collant mobile | ✅ | Barre « Essai gratuit » après le hero (landing). |
| Test sur un vrai téléphone | ⬜ | Émulation 375 px uniquement. |

## SEO / partage

| Point | Statut | Détail |
|---|---|---|
| Meta description | ✅ | `index.html`, landing, pages boutique. |
| Titre par page | ✅ | Landing, 404, pages du dashboard (`DashboardLayout`), boutique (existant). |
| Favicon | ✅ | Existant (`favicon.svg`). |
| Images Open Graph | ✅ | `public/og-image.png` (1200×630, couleurs de la marque, texte seul — **à remplacer** par un visuel de marque si vous en avez un). |
| robots.txt / sitemap.xml | ✅ / 🟡 | `robots.txt` ajouté. Sitemap : un par boutique (backend) ; pas de sitemap pour la plateforme elle-même. |
| Texte alternatif des images | ✅ | Toutes les images ont un `alt` ; miniatures produit corrigées. |
| Compression d'images | ✅ | `core/images.py` : redimensionnement à 1600 px max + ré-encodage, jamais plus lourd que l'original, GIF intacts. Appliqué au catalogue, catégories, variantes, avis et logo. Les images déjà en base ne sont pas retraitées. |

## Contenu et confiance

| Point | Statut | Détail |
|---|---|---|
| Landing page | ✅ | Route `/`, FR/AR, clair/sombre, sans donnée fictive. |
| CTA au-dessus de la ligne de flottaison | ✅ | Hero. |
| Page 404 | ✅ | `NotFoundPage`. |
| Page de remerciement | ❓ | Non créée : l'inscription mène à la vérification d'email. |
| Textes provisoires | ✅ | FAQ/Contact remplis (admin plateforme), pages légales remplies. Données fictives retirées (hero, « centaines de vendeurs »). |
| Conditions d'utilisation, politique de confidentialité | ✅ 🟡 | Rédigées (`platform_admin/legal_defaults.py`), servies par défaut sur `/legal/terms/` et `/legal/privacy-policy/`, liées depuis la landing et la connexion. **À faire relire par un juriste** ; l'identité de l'exploitant (raison sociale, adresse, RC) n'y figure pas. Français uniquement. |
| Bannière cookies | ✅ | Boutique publique : les pixels ne se chargent qu'après acceptation. |
| Analytics de la plateforme | ❓ | Aucun outil d'analyse sur MZSolutions lui-même (uniquement les pixels des boutiques). |
| Email cliquable | ✅ | `mailto:` (landing, contact). |
| Numéro cliquable | ❓ | Aucun numéro de téléphone public n'existe dans le projet. |
| Adresse de contact réelle | 🟡 | Email seul (`mzsolutions31@gmail.com`) ; pas d'adresse postale. |
| Liens cassés | ✅ | Test `tests/links.test.js` : chaque lien interne en dur doit pointer vers une route de `App.jsx`. Corrigé aussi : `/legal/*` tombait sur la 404 React (proxy Vite et Caddy ajoutés). Les liens externes et dynamiques ne sont pas vérifiés. |
| Messages d'erreur / de succès | 🟡 | Toast et erreurs inline présents ; formulaires non audités un par un. |
| États d'erreur des formulaires | 🟡 | Connexion/inscription : oui. Autres formulaires non audités. |

## Thème jour/nuit (demande en cours de route)

Landing, connexion, mot de passe oublié, réinitialisation et invitation suivent le thème. Le dashboard garde son défaut sombre (une partie de ses pages est encore sombre en dur).

## Limites de ce travail

- Les tests unitaires et le build passent ; le rendu a été contrôlé dans le navigateur sur la landing et la connexion, pas sur toutes les pages touchées.
- Rien n'a été testé sur un appareil réel ni avec un lecteur d'écran.
- L'espace d'administration de la plateforme n'est pas traduit en arabe.

## Décisions en attente

1. Visuel de marque pour le partage (l'image actuelle est typographique).
2. Page de remerciement, numéro de téléphone public, analytics de la plateforme.
3. Relecture juridique et identité de l'exploitant.
4. Squelettes sur les ~70 autres pages ; mode hors ligne complet (cache des données).
