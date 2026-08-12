# Thème boutique publique "Noir" — design

**Date :** 2026-08-12
**Branche :** `epic-boutique-theme-noir`

## Contexte

Le vendeur trouve le rendu actuel de sa boutique publique (thème "Violet", fond clair, hero dégradé violet/vert générique) peu convaincant et demande un thème sombre premium, cohérent avec l'esthétique du dashboard (Linear/Vercel : fonds quasi-noirs, bordures fines, accent violet-600).

## Palette — nouveau template `noir`

Calqué exactement sur les variables CSS du dashboard (`frontend/src/index.css`, bloc `:root` sombre) :

| Variable | Valeur |
|---|---|
| `--sf-body-bg` | `#08090a` |
| `--sf-header-bg` / `--sf-footer-bg` | `#0a0b0c` |
| `--sf-header-border` / `--sf-footer-border` | `#1f2023` |
| `--sf-card-bg` | `#0d0e10` |
| `--sf-primary` | `#7c3aed` |
| `--sf-primary-dark` | `#6d28d9` |
| `--sf-primary-light` | teinte violette translucide pour les accents |
| `--sf-text` | `#f3f4f6` |
| `--sf-text-muted` | `#9a9ca3` |
| `--sf-hero-from/via/to` | dégradé quasi-noir → violet-900 → violet-600, halo radial subtil au lieu d'un dégradé plein saturé |

## Composants affectés

- **Hero (`StorefrontHomePage.jsx`)** : fond quasi-noir + halo radial violet (pattern `StatCard`), logo en tuile arrondie bordée, CTA violet plat sans glow, padding resserré.
- **Cartes produits** (`StorefrontHomePage.jsx`, `StorefrontProductsPage.jsx`) : fond `--sf-card-bg`, bordure fine `--sf-header-border`, léger soulèvement + éclaircissement de bordure au survol, badge réduction en `ring-1 ring-inset` plutôt qu'un pavé plein.
- **Header/nav (`StorefrontLayout.jsx`)** : fond `#0a0b0c`, bordure fine, champ de recherche assombri, liens muets → violet au survol.
- **Footer (`StorefrontLayout.jsx`)** : fond sombre, bordure fine.
- **Fiche produit (`StorefrontProductPage.jsx`)**, **checkout (`CheckoutPage.jsx`)**, **pages personnalisées (`StorefrontPagePage.jsx`)** : héritent automatiquement des variables CSS, ajustements ponctuels si un élément reste codé en dur en clair (ex. inputs de formulaire checkout).

## Portée

Le nouveau template devient le thème actif de cette boutique (`StoreSettings.theme_template = 'noir'`, réglable comme avant depuis `ThemePage.jsx`). Les templates existants (Violet/Midnight/Sahara) restent disponibles, aucune suppression.

## Hors scope

- Pas de refonte du système de thèmes lui-même (toujours `storefront-themes.js` + variables CSS).
- Pas de changement sur le dashboard (déjà dans cette palette).
