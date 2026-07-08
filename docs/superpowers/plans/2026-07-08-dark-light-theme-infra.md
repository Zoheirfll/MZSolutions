# Infrastructure bi-thème + dashboard (pilote) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the light/dark theme toggle infrastructure (CSS variables, `data-theme` attribute, `useTheme()` hook, toggle button) and validate it end-to-end on a pilot scope: `DashboardLayout.jsx`, 5 shared components, and 2 witness pages (`Dashboard.jsx`, `TeamPage.jsx`).

**Architecture:** CSS custom properties defined in `index.css` under `:root` (dark values, current defaults) and `[data-theme="light"]` (light overrides). `theme.js`'s `dark.*` keys become `var(--...)` references instead of hex literals, so existing `style={{ background: theme.dark.card }}` usages keep working unchanged. New `.text-app-*`/`.bg-app-*`/`.border-app` utility classes in `index.css` replace hardcoded Tailwind gray/white classes (`text-gray-200`, `bg-white/6`...) in the files this plan touches. A `useTheme()` hook (no Context) reads/writes `localStorage`, toggled from a button in `DashboardLayout.jsx`'s header.

**Tech Stack:** React 18, Tailwind CSS v4, Vite, Vitest + Testing Library — no new dependencies.

## Global Constraints

- Zéro CSS custom en dehors d'`index.css` — Tailwind uniquement dans les composants (per CLAUDE.md); `index.css` is the one file where raw CSS (variables, utility classes) belongs.
- Sombre par défaut, persistance via `localStorage` clé `mz-theme` — pas de détection `prefers-color-scheme`.
- Pas de React Context pour le thème — `useTheme()` est un hook autonome.
- `theme.dark.*` doit rester utilisable tel quel (`style={{ background: theme.dark.card }}`) par les pages **non converties** par ce plan — aucune page hors scope ne doit régresser.
- Le pattern `theme.dark.border + '44'` / `theme.dark.border + '55'` (concaténation de chaîne pour simuler une opacité sur un hex) casse dès que `theme.dark.border` devient une chaîne `var(--border-color)` (produit du CSS invalide) — ce pattern existe dans ~42 fichiers du projet (pas seulement ceux de ce plan) et doit être corrigé partout, pas seulement dans les fichiers pilotes, sinon ce plan introduit une régression visuelle silencieuse sur tout le dashboard non converti.
- Scope de conversion complète (classes + styles) de ce plan : `index.css`, `theme.js`, `DashboardLayout.jsx`, `StatCard.jsx`, `StatusBadge.jsx`, `Select.jsx`, `EmptyState.jsx`, `CheckboxList.jsx`, `Dashboard.jsx`, `TeamPage.jsx`. Toute autre page reste inchangée visuellement (toujours sombre) après ce plan.

---

### Task 1: CSS variables + utility classes

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: CSS custom properties `--bg-app`, `--bg-sidebar`, `--bg-card`, `--bg-card-alt`, `--border-color`, `--border-color-hover`, `--text-primary`, `--text-muted`, `--text-muted-light`, `--border-color-row-hover`, `--border-color-row-hover-strong` (the last two power the opacity-border-hover pattern fixed in Task 2). Also produces utility classes `.text-app-primary`, `.text-app-muted`, `.text-app-muted-light`, `.bg-app`, `.bg-app-sidebar`, `.bg-app-card`, `.bg-app-card-alt`, `.border-app`, `.border-app-hover:hover`.

- [ ] **Step 1: Add the CSS variable blocks**

Add this block immediately after the `@theme { ... }` block (after line 5) in `frontend/src/index.css`:

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
  --border-color-row-hover: rgba(148, 150, 156, 0.27);
  --border-color-row-hover-strong: rgba(148, 150, 156, 0.33);
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
  --border-color-row-hover: rgba(107, 114, 128, 0.18);
  --border-color-row-hover-strong: rgba(107, 114, 128, 0.24);
}
```

- [ ] **Step 2: Add the utility classes**

Add this block at the end of `frontend/src/index.css` (after the existing `select { ... }` block):

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

- [ ] **Step 3: Verify the build still succeeds**

Run: `cd frontend && npm run build`
Expected: build succeeds with no CSS errors (existing warning about chunk size is pre-existing and unrelated, ignore it).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: ajoute les variables CSS et classes utilitaires du bi-thème"
```

---

### Task 2: `theme.js` conversion + global fix for the `theme.dark.border + 'NN'` pattern

**Files:**
- Modify: `frontend/src/theme.js:120-129` (the `dark` object), `frontend/src/theme.js:92` (`emptyState`)
- Modify (mechanical, repo-wide): every file matching `theme.dark.border + '44'` or `theme.dark.border + '55'`

**Interfaces:**
- Consumes: CSS variables from Task 1 (`--bg-app`, `--bg-sidebar`, `--bg-card`, `--bg-card-alt`, `--border-color`, `--border-color-hover`, `--text-muted`, `--text-muted-light`, `--border-color-row-hover`, `--border-color-row-hover-strong`).
- Produces: `theme.dark.app/sidebar/card/cardAlt/border/borderHover/muted/mutedLight` now resolve to `var(--...)` strings (same key names, same call sites, no changes needed at consuming call sites). New keys `theme.dark.borderRowHover` and `theme.dark.borderRowHoverStrong` — later tasks and all other files in the repo must use these instead of `theme.dark.border + '44'` / `+ '55'`.

- [ ] **Step 1: Convert the `dark` object in `theme.js`**

Replace the `dark: { ... }` block (current lines 120-129) in `frontend/src/theme.js` with:

```js
  dark: {
    app:              'var(--bg-app)',
    sidebar:          'var(--bg-sidebar)',
    card:             'var(--bg-card)',
    cardAlt:          'var(--bg-card-alt)',
    border:           'var(--border-color)',
    borderHover:      'var(--border-color-hover)',
    muted:            'var(--text-muted)',
    mutedLight:       'var(--text-muted-light)',
    borderRowHover:       'var(--border-color-row-hover)',
    borderRowHoverStrong: 'var(--border-color-row-hover-strong)',
  },
```

- [ ] **Step 2: Convert `theme.emptyState`**

In `frontend/src/theme.js`, find the line (current line 92):

```js
  emptyState: 'flex flex-col items-center justify-center text-center py-16 px-6 text-gray-500',
```

Replace with:

```js
  emptyState: 'flex flex-col items-center justify-center text-center py-16 px-6 text-app-muted',
```

- [ ] **Step 3: Find every occurrence of the broken concatenation pattern**

Run: `cd frontend && grep -rln "theme.dark.border + '44'" src/pages | wc -l`
Expected: a count around 41 (confirms the scope before starting the mechanical fix).

Run: `cd frontend && grep -rln "theme.dark.border + '55'" src/pages`
Expected: `src/pages/TeamPage.jsx` (this one is also touched directly by Task 7 of this plan, but must be fixed now since Task 2 lands before Task 7 and nothing in the repo should be left broken between tasks).

- [ ] **Step 4: Mechanically replace both patterns repo-wide**

Run (PowerShell, from repo root):

```powershell
Get-ChildItem -Path frontend/src/pages -Recurse -Filter *.jsx | ForEach-Object {
  $content = Get-Content $_.FullName -Raw
  $updated = $content -replace "theme\.dark\.border \+ '44'", 'theme.dark.borderRowHover' -replace "theme\.dark\.border \+ '55'", 'theme.dark.borderRowHoverStrong'
  if ($updated -ne $content) {
    Set-Content -Path $_.FullName -Value $updated -NoNewline
    Write-Output "Updated: $($_.FullName)"
  }
}
```

Expected output: a list of ~42 updated file paths, including `frontend/src/pages/TeamPage.jsx`.

- [ ] **Step 5: Verify no occurrences remain**

Run: `cd frontend && grep -rn "theme.dark.border + '" src/pages`
Expected: no output (empty — all occurrences replaced).

- [ ] **Step 6: Run the full frontend test suite to check for regressions**

Run: `cd frontend && npm run test`
Expected: all test files pass (293+ tests), no failures introduced by the mechanical replacement (the replaced expression only changes a computed `style` value, not any text/DOM structure tests assert on).

- [ ] **Step 7: Verify production build succeeds**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/theme.js frontend/src/pages
git commit -m "fix: theme.dark.* référence désormais des variables CSS bi-thème (+ fix repo-wide du pattern border+opacité cassé par ce changement)"
```

---

### Task 3: `useTheme()` hook

**Files:**
- Create: `frontend/src/hooks/useTheme.js`
- Test: `frontend/src/tests/hooks/useTheme.test.js`

**Interfaces:**
- Consumes: `data-theme` attribute contract from Task 1 (CSS variables switch based on this attribute on `<html>`).
- Produces: `useTheme()` — returns `{ theme: 'dark' | 'light', toggleTheme: () => void }`. Used by Task 4 (`DashboardLayout.jsx`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/tests/hooks/useTheme.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from '../../hooks/useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to dark when localStorage is empty', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('reads an existing value from localStorage', () => {
    localStorage.setItem('mz-theme', 'light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('toggleTheme flips the theme and persists it', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('light')
    expect(localStorage.getItem('mz-theme')).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')

    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('dark')
    expect(localStorage.getItem('mz-theme')).toBe('dark')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- useTheme`
Expected: FAIL — `Failed to resolve import "../../hooks/useTheme"` (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Create `frontend/src/hooks/useTheme.js`:

```javascript
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- useTheme`
Expected: PASS — 3 tests OK

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useTheme.js frontend/src/tests/hooks/useTheme.test.js
git commit -m "feat: ajoute le hook useTheme (état + persistance localStorage + attribut data-theme)"
```

---

### Task 4: `DashboardLayout.jsx` — toggle button + class conversion

**Files:**
- Modify: `frontend/src/components/DashboardLayout.jsx`
- Test: `frontend/src/tests/components/DashboardLayout.test.jsx` (extend if it exists, otherwise check `frontend/src/tests/components/` for the existing file name first)

**Interfaces:**
- Consumes: `useTheme()` from Task 3.
- Produces: a toggle button rendered in the header, `data-testid="theme-toggle"`, clicking it calls `toggleTheme()`. No other component depends on this task's internals.

- [ ] **Step 1: Locate the existing DashboardLayout test file**

Run: `ls frontend/src/tests/components/DashboardLayout.test.jsx 2>/dev/null || echo "NO FILE"`

If it prints a path, that's the file to extend in Step 2. If it prints `NO FILE`, skip directly to Step 4 (no test to add — this codebase does not have a DashboardLayout test file to extend, and creating one from scratch is out of scope for this task; the existing test suites for pages that render `DashboardLayout` as part of their own tests, e.g. `TeamPage.test.jsx`, provide indirect coverage, and Task 4's Step 6 below runs a manual browser check).

- [ ] **Step 2: If the file exists, write the failing test**

Add this test to the existing `describe` block in `frontend/src/tests/components/DashboardLayout.test.jsx` (adapt the `render(...)` wrapper to match whatever setup the existing tests in that file already use — mocks for `useAuth`, `api`, `MemoryRouter`):

```javascript
  it('toggles the theme and persists it to localStorage', async () => {
    const user = userEvent.setup()
    localStorage.clear()
    renderLayout()

    const toggle = screen.getByTestId('theme-toggle')
    expect(document.documentElement.dataset.theme).toBe('dark')

    await user.click(toggle)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('mz-theme')).toBe('light')
  })
```

(Adjust `renderLayout()` to whatever helper function the existing file already defines for rendering `DashboardLayout` with children — do not invent a new one if one exists.)

- [ ] **Step 3: Run test to verify it fails (only if Step 2 applied)**

Run: `cd frontend && npm run test -- DashboardLayout`
Expected: FAIL — `Unable to find an element by: [data-testid="theme-toggle"]`

- [ ] **Step 4: Add the `useTheme` import and toggle button**

In `frontend/src/components/DashboardLayout.jsx`, add the import (after line 6, `import { theme } from '../theme'`):

```javascript
import { useTheme } from '../hooks/useTheme'
```

Add the hook call inside `export default function DashboardLayout({ children, title }) {` (after line 107, `const { user, logout } = useAuth()`):

```javascript
  const { theme: currentTheme, toggleTheme } = useTheme()
```

Replace the hardcoded `colorScheme: 'dark'` (current line 197) — find:

```javascript
    <div className="flex h-dvh overflow-hidden" style={{ background: theme.dark.app, colorScheme: 'dark' }}>
```

Replace with:

```javascript
    <div className="flex h-dvh overflow-hidden" style={{ background: theme.dark.app, colorScheme: currentTheme }}>
```

Add the toggle button in the header, inside the `<div className="flex items-center gap-2 sm:gap-3 shrink-0">` block (current lines 495-519), immediately before the "Voir ma boutique" `<a>` tag (before current line 509):

```javascript
            <button
              onClick={toggleTheme}
              data-testid="theme-toggle"
              aria-label={currentTheme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              className="w-9 h-9 rounded-lg border-app flex items-center justify-center text-app-muted hover:text-app-primary hover:bg-white/5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              style={{ borderWidth: 1, borderStyle: 'solid' }}
            >
              {currentTheme === 'dark' ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
```

- [ ] **Step 5: Convert this file's own hardcoded text/bg classes**

Run (PowerShell, from repo root) to replace the most common hardcoded classes in this specific file only:

```powershell
$path = 'frontend/src/components/DashboardLayout.jsx'
$content = Get-Content $path -Raw
$content = $content -replace 'text-gray-100', 'text-app-primary'
$content = $content -replace 'text-gray-200(?!\d)', 'text-app-primary'
$content = $content -replace 'text-gray-300(?!\d)', 'text-app-primary'
$content = $content -replace 'text-gray-500(?!\d)', 'text-app-muted'
Set-Content -Path $path -Value $content -NoNewline
```

Manually review the diff after running this (`git diff frontend/src/components/DashboardLayout.jsx`) — this file uses `text-gray-500` for both the disabled nav-link state and the "not active" nav-link state (current lines 152, 168, 189); both read fine as `.text-app-muted` in both themes, no further adjustment needed. Leave `text-gray-400` occurrences (icon buttons, current lines 189, 489, 497) as-is for this task — they are not in the mechanical replacement list above and converting every remaining shade is not required for the pilot to be visually coherent (icons at `text-gray-400` remain readable enough in light mode via existing hover states); a full-fidelity pass belongs to the follow-up chantier that converts the rest of the dashboard.

- [ ] **Step 6: Run test to verify it passes (only if Step 2 applied), then check the full suite**

Run: `cd frontend && npm run test -- DashboardLayout` (if the file exists)
Expected: PASS

Run: `cd frontend && npm run test`
Expected: all tests pass, no regressions (many page test files render `DashboardLayout` indirectly).

- [ ] **Step 7: Manual browser verification**

Run: `cd frontend && npm run dev`, open the dashboard, click the new toggle button in the header. Expected: background/text colors of the sidebar, header, and card surfaces visibly switch between the current dark look and a light look; clicking again reverts; reloading the page keeps the last-chosen theme (via `localStorage`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/DashboardLayout.jsx frontend/src/tests/components/DashboardLayout.test.jsx
git commit -m "feat: ajoute le toggle jour/nuit dans DashboardLayout et convertit ses classes codées en dur"
```

---

### Task 5: Shared components — `StatCard`, `StatusBadge`, `Select`, `EmptyState`, `CheckboxList`

**Files:**
- Modify: `frontend/src/components/StatCard.jsx`
- Modify: `frontend/src/components/EmptyState.jsx`
- Modify: `frontend/src/components/CheckboxList.jsx`
- Modify: `frontend/src/components/Select.jsx` (verify only — see Step 3)
- Modify: `frontend/src/components/StatusBadge.jsx` (verify only — see Step 4)
- Test: `frontend/src/tests/components/StatCard.test.jsx`, `frontend/src/tests/components/EmptyState.test.jsx` (extend if present, else skip per Step 1's pattern)

**Interfaces:**
- Consumes: `.text-app-primary`, `.text-app-muted` utility classes (Task 1); `theme.dark.*` (now `var(--...)`, Task 2).
- Produces: no interface changes — these are leaf presentational components, prop signatures untouched. Later tasks (Dashboard.jsx, TeamPage.jsx) just render them as before.

- [ ] **Step 1: Check for existing test files to extend**

Run: `ls frontend/src/tests/components/StatCard.test.jsx frontend/src/tests/components/EmptyState.test.jsx frontend/src/tests/components/CheckboxList.test.jsx frontend/src/tests/components/Select.test.jsx frontend/src/tests/components/StatusBadge.test.jsx 2>/dev/null`

For any file that exists, note it — Step 6 will run its existing suite as a regression check (no new test content required for this task since these are pure styling changes to leaf components with no new behavior; the existing tests already assert rendered text/interactions, which the styling change must not break).

- [ ] **Step 2: Convert `StatCard.jsx`**

In `frontend/src/components/StatCard.jsx`, no hardcoded Tailwind gray/white classes exist in this file (it uses `style={{ color: theme.dark.mutedLight }}` etc. throughout, all of which already resolve to CSS variables via Task 2) — no changes needed to this file. Confirm with:

Run: `grep -n "text-gray-\|bg-white/" frontend/src/components/StatCard.jsx`
Expected: no output (confirms nothing to convert).

- [ ] **Step 3: Verify `Select.jsx` needs no change**

`Select.jsx` already branches on a `variant` prop (`'dark'` vs `'light'`) and uses inline `style={variant === 'light' ? {...} : { background: theme.dark.sidebar, borderColor: theme.dark.border }}` — since `theme.dark.sidebar`/`theme.dark.border` now resolve through CSS variables (Task 2), the `variant='dark'` (default) branch automatically follows the site-wide toggle. No code change required.

Run: `grep -n "text-gray-\|bg-white/" frontend/src/components/Select.jsx`
Expected: matches only inside the `variant === 'light' ? ... : ...` ternary's dark branch (`text-gray-300`, `text-gray-700` for light, `hover:bg-white/6` for dark) — these are intentionally kept as literal Tailwind classes since `Select.jsx`'s `variant` prop is an independent concept from the global theme (documented in the spec, section "Composants partagés convertis") — leave unchanged.

- [ ] **Step 4: Verify `StatusBadge.jsx` needs no change**

`StatusBadge.jsx` only consumes `theme.badge.*` (opacity-based colors like `bg-emerald-500/10 text-emerald-400`), never `theme.dark.*` or raw gray/white classes — these badge colors are legible on both light and dark surfaces already (10% opacity fills with saturated text color). No change needed.

Run: `grep -n "text-gray-\|bg-white/\|theme.dark" frontend/src/components/StatusBadge.jsx`
Expected: no output.

- [ ] **Step 5: Convert `EmptyState.jsx` and `CheckboxList.jsx`**

In `frontend/src/components/EmptyState.jsx`, replace line 12:

```javascript
      {title && <p className="text-gray-300 text-sm font-medium">{title}</p>}
```

with:

```javascript
      {title && <p className="text-app-primary text-sm font-medium">{title}</p>}
```

(The `description` on line 13 already uses `style={{ color: theme.dark.muted }}`, which resolves via Task 2 — no change needed there. `theme.emptyState` used on line 5 was already converted in Task 2 Step 2.)

In `frontend/src/components/CheckboxList.jsx`, replace line 5:

```javascript
    return <p className="text-xs text-gray-500 py-2">{emptyLabel}</p>
```

with:

```javascript
    return <p className="text-xs text-app-muted py-2">{emptyLabel}</p>
```

Replace line 10 (the `<label>` text color):

```javascript
        <label key={item.id} className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 cursor-pointer hover:bg-white/5 transition" style={{ borderColor: theme.dark.border }}>
```

with:

```javascript
        <label key={item.id} className="flex items-center gap-2.5 px-3 py-2 text-sm text-app-primary cursor-pointer hover:bg-white/5 transition" style={{ borderColor: theme.dark.border }}>
```

- [ ] **Step 6: Run the existing suites for these components (whichever were found in Step 1) plus the full suite**

Run: `cd frontend && npm run test`
Expected: all tests pass — no test asserts on the literal class string `text-gray-300`/`text-gray-500` (Testing Library queries target text content and roles, not class names), so this is a safe rename.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/EmptyState.jsx frontend/src/components/CheckboxList.jsx
git commit -m "feat: convertit EmptyState et CheckboxList vers les classes utilitaires bi-thème"
```

---

### Task 6: `Dashboard.jsx` conversion (witness page 1)

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`
- Test: `frontend/src/tests/pages/Dashboard.test.jsx` (regression check only — no new test content, this is a pure styling change)

**Interfaces:**
- Consumes: `.text-app-primary` (Task 1), `theme.dark.*` (Task 2, already resolved via CSS variables — no code change needed for `style={{...}}` usages in this file).
- Produces: none — leaf page, nothing depends on it.

- [ ] **Step 1: Replace hardcoded text classes**

In `frontend/src/pages/Dashboard.jsx`, make these exact replacements:

Line 97, replace:
```javascript
          <h2 className="text-2xl font-bold text-gray-100">
```
with:
```javascript
          <h2 className="text-2xl font-bold text-app-primary">
```

Line 185, replace:
```javascript
          <p className="text-sm font-semibold text-gray-200">Commandes — 15 derniers jours</p>
```
with:
```javascript
          <p className="text-sm font-semibold text-app-primary">Commandes — 15 derniers jours</p>
```

Line 216, replace:
```javascript
                <p className="text-sm font-semibold text-gray-200">Commandes par wilaya — 30 derniers jours</p>
```
with:
```javascript
                <p className="text-sm font-semibold text-app-primary">Commandes par wilaya — 30 derniers jours</p>
```

Line 222, replace:
```javascript
                    <span className="text-gray-300">{w.wilaya}</span>
```
with:
```javascript
                    <span className="text-app-primary">{w.wilaya}</span>
```

Line 234, replace:
```javascript
                <p className="text-sm font-semibold text-gray-200">Par source de vente — 30 derniers jours</p>
```
with:
```javascript
                <p className="text-sm font-semibold text-app-primary">Par source de vente — 30 derniers jours</p>
```

Line 239, replace:
```javascript
                    <span className="text-sm text-gray-300 truncate pr-2">{s.source}</span>
```
with:
```javascript
                    <span className="text-sm text-app-primary truncate pr-2">{s.source}</span>
```

- [ ] **Step 2: Verify no hardcoded text-gray-1xx/2xx/3xx classes remain in this file**

Run: `grep -n "text-gray-1\|text-gray-2\|text-gray-3" frontend/src/pages/Dashboard.jsx`
Expected: no output.

- [ ] **Step 3: Run the existing Dashboard test suite**

Run: `cd frontend && npm run test -- Dashboard.test`
Expected: all existing tests pass — Testing Library queries in this suite target text content, not class names, so renaming classes doesn't affect them.

- [ ] **Step 4: Manual browser verification**

With `npm run dev` running (from Task 4 Step 7, or restart it), navigate to `/dashboard`, toggle the theme. Expected: all headings, wilaya/source labels switch color correctly in both themes; StatCards (already theme-aware via Task 5) remain legible.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat: convertit Dashboard.jsx vers les classes utilitaires bi-thème (page témoin 1/2)"
```

---

### Task 7: `TeamPage.jsx` conversion (witness page 2)

**Files:**
- Modify: `frontend/src/pages/TeamPage.jsx`
- Test: `frontend/src/tests/pages/TeamPage.test.jsx` (regression check only)

**Interfaces:**
- Consumes: `.text-app-primary`, `.text-app-muted` (Task 1); `theme.dark.borderRowHover`/`borderRowHoverStrong` (Task 2 — this file's `theme.dark.border + '55'` was already mechanically replaced with `theme.dark.borderRowHoverStrong` in Task 2 Step 4, so this task does not need to touch that line again).
- Produces: none — leaf page.

- [ ] **Step 1: Confirm Task 2's mechanical replacement already landed in this file**

Run: `grep -n "borderRowHoverStrong" frontend/src/pages/TeamPage.jsx`
Expected: one match, on the `MembersTable` row (`style={{ borderColor: theme.dark.borderRowHoverStrong }}`) — confirms Task 2 already fixed this line; no action needed here.

- [ ] **Step 2: Replace hardcoded text classes**

Make these exact replacements in `frontend/src/pages/TeamPage.jsx`:

Line 64, replace:
```javascript
  const inputCls = `w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]`
```
with:
```javascript
  const inputCls = `w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]`
```

Line 71, replace:
```javascript
          <h3 className="text-base font-semibold text-gray-200">
```
with:
```javascript
          <h3 className="text-base font-semibold text-app-primary">
```
(this pattern repeats at line 209 — `MemberPermissionsModal`'s heading — apply the same replacement there too)

Lines 84, 88, 95, 99, 106, 120, 130, 135, 143 — all follow the pattern `<label className="block text-xs text-gray-400 mb-1">` or `mb-2`. Replace every occurrence of `text-gray-400` with `text-app-muted` on these label lines (9 occurrences total in the `Modal` function).

Line 146, replace:
```javascript
                  <label key={key} className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 cursor-pointer hover:bg-white/5 transition">
```
with:
```javascript
                  <label key={key} className="flex items-center gap-2.5 px-3 py-2 text-sm text-app-primary cursor-pointer hover:bg-white/5 transition">
```

Line 220, replace:
```javascript
          <p className="text-sm text-gray-500 py-6 text-center">Chargement…</p>
```
with:
```javascript
          <p className="text-sm text-app-muted py-6 text-center">Chargement…</p>
```

Line 229, replace:
```javascript
                  className="text-sm text-gray-300 text-left flex items-center gap-2 disabled:opacity-60"
```
with:
```javascript
                  className="text-sm text-app-primary text-left flex items-center gap-2 disabled:opacity-60"
```

Lines 257, 261 (`MembersTable` empty state — note: this duplicates `EmptyState.jsx`'s markup manually instead of using the component, pre-existing in this file, not something to refactor in this task), replace:
```javascript
      <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-gray-500">
```
with:
```javascript
      <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-app-muted">
```
and:
```javascript
        <p className="text-sm">Aucun membre dans cette catégorie.</p>
```
stays unchanged (no color class on this line).

Line 269, replace:
```javascript
          <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
```
with:
```javascript
          <tr className="text-left text-xs text-app-muted border-b" style={{ borderColor: theme.dark.border }}>
```

Lines 282-284, replace:
```javascript
              <td className="py-3 pr-4 text-gray-200 font-medium">{m.first_name} {m.last_name}</td>
              <td className="py-3 pr-4 text-gray-400">{m.email}</td>
              <td className="py-3 pr-4 text-gray-400">{m.phone || '—'}</td>
```
with:
```javascript
              <td className="py-3 pr-4 text-app-primary font-medium">{m.first_name} {m.last_name}</td>
              <td className="py-3 pr-4 text-app-muted">{m.email}</td>
              <td className="py-3 pr-4 text-app-muted">{m.phone || '—'}</td>
```

Line 295, replace:
```javascript
              <td className="py-3 pr-4 text-gray-500 text-xs">
```
with:
```javascript
              <td className="py-3 pr-4 text-app-muted text-xs">
```

Line 302, replace:
```javascript
                    className="text-xs text-gray-400 hover:text-gray-200 transition"
```
with:
```javascript
                    className="text-xs text-app-muted hover:text-app-primary transition"
```

Line 415, replace:
```javascript
            <p className="text-gray-400 font-medium">Relevés de paiement</p>
```
with:
```javascript
            <p className="text-app-muted font-medium">Relevés de paiement</p>
```

- [ ] **Step 3: Verify no hardcoded text-gray-2/3/4/5xx classes remain in this file**

Run: `grep -n "text-gray-2\|text-gray-3\|text-gray-4\|text-gray-5" frontend/src/pages/TeamPage.jsx`
Expected: no output (the only remaining `text-gray-` in this file, if any, should be `text-gray-600` on the empty-state SVG icon at line 258/412 — leave those unchanged, icon strokes are not in scope for this task's text/label conversion).

- [ ] **Step 4: Run the existing TeamPage test suite**

Run: `cd frontend && npm run test -- TeamPage.test`
Expected: all tests pass (queries target text content/roles, not classes).

- [ ] **Step 5: Manual browser verification**

Navigate to `/dashboard/equipe`, toggle the theme, open the invite modal and the per-member permissions modal in both themes. Expected: all text, labels, table rows, and modals remain legible and visually coherent in both light and dark.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/TeamPage.jsx
git commit -m "feat: convertit TeamPage.jsx vers les classes utilitaires bi-thème (page témoin 2/2)"
```

---

### Task 8: Documentation

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing — this is the terminal task.

- [ ] **Step 1: Add a subsection to CLAUDE.md**

In `c:\Users\filali\MZSolutions\CLAUDE.md`, find the section starting with `### Thème — Premium SaaS sombre (style Linear/Vercel)` and add the following paragraph immediately after its existing content (before the next `---` or section header):

```markdown
**Mode jour/nuit (chantier `docs/superpowers/specs/2026-07-08-dark-light-theme-infra-design.md`, en cours de rollout)** — le dashboard supporte désormais un bi-thème clair/sombre, construit sur des variables CSS (`frontend/src/index.css`, blocs `:root` et `[data-theme="light"]`) plutôt que deux objets JS séparés. `theme.dark.*` référence ces variables (`var(--bg-card)`, etc.) — tout code qui consomme déjà `theme.dark.card` via `style={{...}}` suit automatiquement le thème actif, sans modification. Pour les classes Tailwind couleur codées en dur (`text-gray-200`, etc.), utiliser les classes utilitaires dédiées `.text-app-primary`/`.text-app-muted`/`.text-app-muted-light`/`.bg-app`/`.bg-app-sidebar`/`.bg-app-card`/`.bg-app-card-alt`/`.border-app` (définies dans `index.css`) — jamais recoder une couleur en dur sur une page convertie. Le hook `frontend/src/hooks/useTheme.js` (`{ theme, toggleTheme }`, pas de Context) pilote l'attribut `data-theme` sur `<html>` et persiste le choix dans `localStorage` (clé `mz-theme`, défaut `'dark'`) ; le bouton toggle vit dans la topbar de `DashboardLayout.jsx`. ⚠️ Piège rencontré en construisant cette infra : le pattern `theme.dark.border + '44'` (concaténation de chaîne pour simuler une opacité sur un hex, utilisé dans ~42 pages pour la bordure de survol des lignes de tableau) casse dès que `theme.dark.border` devient une chaîne `var(--...)` — remplacé partout par `theme.dark.borderRowHover`/`borderRowHoverStrong`, à réutiliser pour tout nouveau tableau plutôt que de recréer la concaténation cassée.

**Périmètre actuellement converti** : `DashboardLayout.jsx`, les composants partagés (`StatCard`, `StatusBadge`, `Select`, `EmptyState`, `CheckboxList`), `Dashboard.jsx`, `TeamPage.jsx`. Les ~45 autres pages du dashboard restent volontairement sombres en dur (chantiers de suivi, page par page) ; la boutique publique (`pages/storefront/`) n'est pas encore concernée (chantier 2, après validation du chantier 1). `Select.jsx` garde son prop `variant="dark"|"light"` indépendant du toggle global — usage volontairement distinct (ex. popups toujours-clairs sur la boutique publique), ne pas confondre les deux mécanismes.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documente l'infrastructure bi-thème (variables CSS, classes utilitaires, useTheme) dans CLAUDE.md"
```

---

## Post-plan checklist (not a task — reminder for the orchestrating session)

- Full verification before declaring the pilot done: `cd backend && venv/Scripts/python manage.py test` (unaffected by this frontend-only plan, but run to confirm no cross-contamination) and `cd frontend && npm run test && npm run build`.
- Do **not** push/merge without the user's explicit go-ahead, per the project's epic workflow (CLAUDE.md rule 4) — per-task commits on the working branch are fine (already confirmed acceptable by the user in a prior session), but push/merge to `main` needs a separate explicit confirmation.
- This plan's scope is deliberately partial (pilot only) — the next chantier (remaining ~45 dashboard pages, then storefront) should be planned separately once this pilot is validated in the browser by the user.
