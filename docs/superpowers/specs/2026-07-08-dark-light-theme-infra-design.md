# Infrastructure bi-thème + dashboard (pilote) — design

Date : 2026-07-08
Chantier 1/2 du mode jour/nuit — le chantier 2 (boutique publique) réutilisera cette infrastructure une fois validée ici.

## Contexte

`frontend/src/theme.js` est aujourd'hui un objet JS exportant des couleurs hexadécimales codées en dur (`theme.dark.card = '#0d0e10'`) et des chaînes de classes Tailwind fixes (`text-gray-200`, `bg-white/6`...). Le dashboard vendeur (~50 pages) est câblé 100% sombre — chaque page consomme `theme.dark.*` via `style={{ background: theme.dark.card }}` ou colle directement des classes Tailwind grises/blanches. La boutique publique (`pages/storefront/`) est câblée 100% claire de la même façon, indépendamment.

Objectif de ce premier chantier : construire l'infrastructure technique du bi-thème (variables CSS + toggle + persistance) et la valider sur un périmètre pilote (layout + composants partagés + 2 pages), sans encore convertir l'intégralité du dashboard. Les ~45 pages restantes du dashboard, puis la boutique publique, seront des chantiers de suivi qui réutilisent ce pattern tel quel.

## Décisions de conception

1. **Variables CSS + attribut `data-theme` sur `<html>`**, pas deux objets JS `theme.dark`/`theme.light` avec logique conditionnelle dans chaque page. Un seul attribut change, toutes les variables CSS suivent instantanément — pas de re-render React nécessaire pour la bascule visuelle.
2. **`theme.js` garde sa forme actuelle** (objet JS exportant des classes/valeurs) — seules les valeurs hexadécimales de `theme.dark.*` deviennent des références `var(--...)`. Le code React qui consomme `theme.dark.card` etc. n'a **pas besoin de changer** ailleurs que dans les fichiers explicitement convertis par ce chantier.
3. **Classes utilitaires custom** (pas le custom variant Tailwind `light:`) pour les classes couleur codées en dur (`text-gray-200`, `bg-white/6`...) dans les fichiers convertis. Une classe comme `.text-app-primary { color: var(--text-primary); }` remplace `text-gray-200` — elle réagit automatiquement au changement de `data-theme` sans avoir besoin d'une classe `light:` dupliquée à chaque usage.
4. **Sombre par défaut**, persistance du choix en `localStorage` (clé `mz-theme`), pas de détection `prefers-color-scheme` automatique — cohérent avec l'identité actuelle 100% sombre du dashboard.
5. **Pas de React Context** — un hook `useTheme()` autonome (lit/écrit `localStorage`, pose l'attribut sur `document.documentElement`) suffit ; seul le bouton toggle a besoin de connaître/changer l'état, tout le reste du rendu suit passivement les variables CSS.
6. **Périmètre de conversion de ce chantier** : `index.css` (variables + classes utilitaires), `theme.js` (hex → `var(--...)`), `DashboardLayout.jsx`, composants partagés (`StatCard.jsx`, `StatusBadge.jsx`, `Select.jsx`, `EmptyState.jsx`, `CheckboxList.jsx`), et 2 pages témoins (`Dashboard.jsx`, `TeamPage.jsx`). Les autres pages du dashboard restent inchangées (toujours sombres en dur) jusqu'aux chantiers de suivi — elles ne sont pas cassées par ce chantier puisque `theme.dark.*` reste utilisable tel quel par les pages non converties (les variables CSS ont juste les valeurs sombres par défaut tant qu'aucune page convertie n'a changé `data-theme`, mais une page non convertie ignore de toute façon `data-theme` puisqu'elle n'utilise pas les nouvelles classes utilitaires).

## Variables CSS (`frontend/src/index.css`)

Ajout d'un bloc `:root` (valeurs sombres, miroir exact des clés actuelles de `theme.dark`) et d'un bloc `[data-theme="light"]` (overrides clairs) :

```css
:root {
  --bg-app: #08090a;
  --bg-sidebar: #0a0b0c;
  --bg-card: #0d0e10;
  --bg-card-alt: #131417;
  --border-color: #1f2023;
  --border-color-hover: #2a2b2f;
  --text-primary: #e5e7eb;
  --text-muted: #6b6d73;
  --text-muted-light: #9a9ca3;
}

[data-theme="light"] {
  --bg-app: #f7f7f8;
  --bg-sidebar: #ffffff;
  --bg-card: #ffffff;
  --bg-card-alt: #f3f4f6;
  --border-color: #e5e7eb;
  --border-color-hover: #d1d5db;
  --text-primary: #111827;
  --text-muted: #6b7280;
  --text-muted-light: #4b5563;
}
```

## Classes utilitaires (`frontend/src/index.css`)

Ajout à la suite des variables, dans le même fichier (pas de nouveau fichier CSS — le projet n'a qu'`index.css` comme point d'entrée styles globaux) :

```css
.text-app-primary { color: var(--text-primary); }
.text-app-muted { color: var(--text-muted); }
.text-app-muted-light { color: var(--text-muted-light); }
.bg-app { background-color: var(--bg-app); }
.bg-app-sidebar { background-color: var(--bg-sidebar); }
.bg-app-card { background-color: var(--bg-card); }
.bg-app-card-alt { background-color: var(--bg-card-alt); }
.border-app { border-color: var(--border-color); }
.border-app-hover:hover { border-color: var(--border-color-hover); }
```

Ces classes remplacent, dans les fichiers convertis par ce chantier uniquement, les usages directs de `text-gray-200`, `text-gray-400`/`text-gray-500` (selon le niveau muted), `bg-white/6`, `border-white/10`, etc. Les endroits qui utilisaient déjà `style={{ background: theme.dark.card }}` (valeur JS, pas classe Tailwind) n'ont pas besoin d'être touchés — voir section `theme.js` ci-dessous, la variable change de valeur sous eux.

## `theme.js`

Les clés de `theme.dark` deviennent des références aux variables CSS au lieu de hex codés en dur :

```js
dark: {
  app:         'var(--bg-app)',
  sidebar:     'var(--bg-sidebar)',
  card:        'var(--bg-card)',
  cardAlt:     'var(--bg-card-alt)',
  border:      'var(--border-color)',
  borderHover: 'var(--border-color-hover)',
  muted:       'var(--text-muted)',
  mutedLight:  'var(--text-muted-light)',
},
```

Tout code existant qui fait `style={{ background: theme.dark.card }}` continue de fonctionner sans modification — `background: 'var(--bg-card)'` est une valeur CSS valide, et elle suit `data-theme` automatiquement. **Aucun changement requis dans les pages non converties par ce chantier** grâce à cette compatibilité ascendante — c'est ce qui permet de livrer un périmètre pilote sans casser le reste du dashboard.

⚠️ Un seul piège à vérifier lors de l'implémentation : les endroits qui font `theme.dark.border + '55'` ou `theme.dark.border + '44'` (opacité par concaténation de chaîne hex, ex. `TeamPage.jsx`) ne fonctionnent plus une fois que `theme.dark.border` est une chaîne `var(--border-color)` — cette concaténation produira une couleur CSS invalide. Ces usages doivent être détectés (`grep -rn "theme.dark.border +" frontend/src`) et adaptés (ex. une variable CSS séparée avec l'opacité déjà appliquée, ou `color-mix()`) — seulement pour les fichiers dans le périmètre de ce chantier (`TeamPage.jsx` en fait partie, donc ce cas doit être traité par le plan).

## Hook `useTheme()` (`frontend/src/hooks/useTheme.js`, nouveau fichier)

```js
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'mz-theme'

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(STORAGE_KEY) || 'dark')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  return { theme, toggleTheme }
}
```

Pas de Context React — chaque composant qui a besoin de lire/changer le thème (dans ce chantier, uniquement le bouton toggle de `DashboardLayout.jsx`) appelle `useTheme()` directement. `document.documentElement.dataset.theme` est posé dès le premier rendu de `DashboardLayout` (le seul endroit qui monte le hook), donc le `data-theme` est présent sur `<html>` avant que les autres composants du dashboard ne se rendent.

## Toggle UI (`DashboardLayout.jsx`)

Bouton icône (soleil `Sun`/lune `Moon`, `lucide-react` — déjà une dépendance du projet, utilisée par `StatCard.jsx`) dans la topbar, à côté du bouton Déconnexion existant (`DashboardLayout.jsx:477` zone). Au clic, `toggleTheme()`. L'icône affichée reflète le thème **courant** (lune si sombre actif, soleil si clair actif — l'icône indique l'état actuel, pas l'action).

## Composants partagés convertis

`StatCard.jsx`, `StatusBadge.jsx`, `Select.jsx`, `EmptyState.jsx`, `CheckboxList.jsx` — chacun audité pour remplacer ses classes Tailwind couleur codées en dur par les classes utilitaires `.text-app-*`/`.bg-app-*`/`.border-app` là où c'est pertinent. `Select.jsx` a déjà un prop `variant="dark"|"light"` pour gérer un cas différent (popup toujours-clair sur `storefront`/`Auth`) — ce prop n'est **pas remplacé** par le nouveau système ; il reste tel quel pour ce cas d'usage spécifique (pages qui restent volontairement dans un seul thème indépendamment du toggle global). Le nouveau bi-thème s'applique au rendu par défaut (`variant` non précisé ou `variant="dark"` actuel), qui doit maintenant suivre `data-theme`.

## Pages témoins

`Dashboard.jsx` (page simple, beaucoup de `StatCard`) et `TeamPage.jsx` (page avec modals, tableau, déjà modifiée par l'epic permissions récent) — converties intégralement pour valider le pattern sur un cas simple et un cas complexe (formulaires, tableaux, badges). Ces deux pages doivent être visuellement cohérentes en mode clair ET sombre après conversion.

## Documentation

Ajout d'une section dans `CLAUDE.md` (sous "Thème — Premium SaaS sombre") documentant : les variables CSS disponibles, les classes utilitaires `.text-app-*`/`.bg-app-*`/`.border-app`, le hook `useTheme()`, et la règle "toute nouvelle page convertie doit suivre ce pattern, jamais recoder des couleurs en dur" — pour que les chantiers de suivi (reste du dashboard, puis boutique publique) s'appuient dessus sans redécouvrir l'approche.

## Tests

Frontend (Vitest + Testing Library) :
- `useTheme()` : défaut `'dark'` si `localStorage` vide, lit la valeur existante si présente, `toggleTheme()` bascule et persiste, pose `document.documentElement.dataset.theme`.
- `DashboardLayout.jsx` : le bouton toggle est présent, son clic appelle bien le changement de thème (icône change).
- Pas de test visuel automatisé (pas d'outil de screenshot-diff dans le projet) — validation manuelle des 2 pages témoins en clair et en sombre dans le navigateur avant de considérer le chantier terminé, comme le exige les instructions générales pour tout changement UI.

## Hors scope (chantiers de suivi)

- Conversion des ~45 pages restantes du dashboard (chantier de suivi séparé, page par page ou par lot, une fois ce pilote validé).
- Boutique publique (`pages/storefront/`) — chantier 2, après validation du chantier 1.
- Détection `prefers-color-scheme` automatique (explicitement écartée, sombre par défaut).
- Préférence de thème liée à un compte utilisateur (reste un réglage par navigateur/`localStorage`, pas synchronisé serveur).
