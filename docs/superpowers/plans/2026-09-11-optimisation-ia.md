# Optimisation des fonctionnalités IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter recherche/filtres sur 3 pages IA, réorganiser le menu IA en sous-groupes (en corrigeant au passage le bug de sidebar signalé par l'utilisateur), et élargir l'Assistant IA à 9 nouveaux domaines de données.

**Architecture:** Modifications frontend pures pour les volets 1-2 (aucun nouvel appel réseau). Le volet 3 étend `ai_assistant/tools.py` en réutilisant des vues/modules déjà existants (jamais une nouvelle requête DB non déjà exposée ailleurs).

**Tech Stack:** Django 5.2 + DRF (backend existant), React 18 (frontend existant).

## Global Constraints

- Chaque nouvel outil IA réplique exactement la formule de permission de son équivalent REST (`is_owner_or_admin(request) or has_permission(request, '<clé>')`), jamais d'exception.
- Aucun nouvel endpoint REST créé pour le volet 3 — réutiliser les vues/modules déjà en place (`ReturnsStatsView`, `finance.views._payments_summary`, `stores.audit._catalogue_score`, `team.monitoring.compute_confirmateur_detail`).
- Recherche/filtres des 3 pages du volet 1 : uniquement côté client, aucun nouvel appel réseau.
- `get_subscription_status` est owner/admin strict (aucune permission de vue), cohérent avec la page Abonnement existante.
- Tests obligatoires par tâche, commits fréquents, jamais `git add -A`. Avant chaque `git add` sur un fichier partagé (`App.jsx`, `DashboardLayout.jsx`, `ai_assistant/tools.py`), vérifier `git diff <fichier>`.

---

## File Structure

```
frontend/src/
  App.jsx                                     — routes renommées (modifié)
  components/DashboardLayout.jsx             — menu IA réorganisé + chemins renommés (modifié)
  pages/orders/RecommendationsPage.jsx       — champ de recherche (modifié)
  pages/team/ConfirmateurMonitoringPage.jsx  — recherche + filtre drapeaux (modifié)
  pages/ai/AIAssistantPage.jsx                 — recherche conversations (modifié)
  tests/pages/orders/RecommendationsPage.test.jsx (modifié)
  tests/pages/team/ConfirmateurMonitoringPage.test.jsx (modifié)
  tests/pages/ai/AIAssistantPage.test.jsx (modifié, si existant — à vérifier)
  tests/App.test.jsx (vérifié sans modification attendue)

backend/
  ai_assistant/
    tools.py    — get_inventory étendu + 8 nouveaux outils (modifié)
    tests.py     — tests des nouveaux outils (modifié)

CLAUDE.md — section Assistant IA étendue (modifié, dernière tâche)
```

---

### Task 1: Renommer les routes de prévision (corrige le bug de sidebar)

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/DashboardLayout.jsx`

**Interfaces:**
- Produces: routes `/dashboard/previsions-ventes` et `/dashboard/previsions-retours` (remplacent `/dashboard/stats/previsions` et `/dashboard/stats/previsions-retours`).

- [ ] **Step 1: Vérifier le diff avant modification**

Run: `git diff frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx`
Expected: vide.

- [ ] **Step 2: Renommer la route dans `App.jsx`**

Remplacer :
```jsx
          <Route path="/dashboard/stats/previsions"          element={<PD perm="stats_forecast_view"><SalesForecastPage /></PD>} />
          <Route path="/dashboard/stats/previsions-retours"   element={<PD perm="stats_returns_forecast_view"><ReturnsForecastPage /></PD>} />
```
par :
```jsx
          <Route path="/dashboard/previsions-ventes"          element={<PD perm="stats_forecast_view"><SalesForecastPage /></PD>} />
          <Route path="/dashboard/previsions-retours"         element={<PD perm="stats_returns_forecast_view"><ReturnsForecastPage /></PD>} />
```

- [ ] **Step 3: Run le test qui vérifie que toute route a bien `perm=`**

Run: `cd frontend && npm run test -- App.test`
Expected: `PASS` (le renommage ne change pas la présence de `perm=`).

- [ ] **Step 4: Renommer les liens dans `DashboardLayout.jsx`**

Remplacer (dans le bloc IA actuel) :
```jsx
                {can('stats_forecast_view') && (
                  <li>{mainLink('/dashboard/stats/previsions', ICONS.stats, 'Prévision de ventes')}</li>
                )}
                {can('stats_returns_forecast_view') && (
                  <li>{mainLink('/dashboard/stats/previsions-retours', ICONS.stats, 'Prévision de taux de retour')}</li>
                )}
```
par :
```jsx
                {can('stats_forecast_view') && (
                  <li>{mainLink('/dashboard/previsions-ventes', ICONS.stats, 'Prévision de ventes')}</li>
                )}
                {can('stats_returns_forecast_view') && (
                  <li>{mainLink('/dashboard/previsions-retours', ICONS.stats, 'Prévision de taux de retour')}</li>
                )}
```
(Cette étape sera de toute façon réécrite en Task 2 lors du regroupement en sous-menu "Prévisions" — faite ici séparément pour isoler le correctif de routage dans son propre commit, testable indépendamment.)

- [ ] **Step 5: Run la suite frontend complète pour vérifier l'absence de régression**

Run: `npm run test`
Expected: tous les tests passent (aucune page ne référençait l'ancien chemin ailleurs — déjà vérifié par recherche exhaustive avant ce plan).

- [ ] **Step 6: Commit**

```bash
git diff frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx
git add frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx
git commit -m "fix(sidebar): sépare les routes de prévision du préfixe /stats

Les pages Prévision de ventes/retours vivent dans le menu IA depuis leur
chantier respectif, mais leur route restait sous /dashboard/stats/... —
l'état replié/déplié de la sidebar (expanded.stats = pathname.startsWith
('/dashboard/stats')) se déclenchait donc à tort et ouvrait le groupe
Statistiques au lieu du groupe IA en y accédant.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Réorganiser le menu IA en 3 sous-groupes

**Files:**
- Modify: `frontend/src/components/DashboardLayout.jsx`

**Interfaces:**
- Consumes: routes renommées (Task 1), permissions déjà existantes (`ai_assistant_view`, `stats_forecast_view`, `stats_returns_forecast_view`, `recommendations_view`, `store_audit_view`, `confirmateur_monitoring_view`).

- [ ] **Step 1: Ajouter les 2 nouvelles clés d'état repliable**

Dans le `useState({...})` de `expanded` (juste après `stock:`), ajouter :
```jsx
    iaPrevisions: ['/dashboard/previsions-ventes', '/dashboard/previsions-retours', '/dashboard/stock'].some(p => location.pathname.startsWith(p)),
    iaAnalyse:    ['/dashboard/recommandations', '/dashboard/audit-boutique', '/dashboard/suivi-confirmateurs'].some(p => location.pathname.startsWith(p)),
```

- [ ] **Step 2: Remplacer le bloc IA plat par 3 sous-groupes**

Remplacer tout le bloc (de `{/* IA — regroupe...` jusqu'à sa fermeture `)}` juste avant `{/* INTÉGRATIONS */}`) par :
```jsx
          {/* IA — regroupe toutes les fonctionnalités IA du dashboard, présentes et à venir */}
          {(can('ai_assistant_view') || can('stats_forecast_view') || can('stats_returns_forecast_view') || can('recommendations_view') || can('store_audit_view') || can('confirmateur_monitoring_view')) && (
            <div>
              <p className="text-[10px] font-semibold px-2 mb-2 tracking-widest" style={{ color: theme.dark.muted }}>IA</p>
              <ul className="space-y-0.5">
                {can('ai_assistant_view') && (
                  <li>{mainLink('/dashboard/assistant-ia', ICONS.marketing, 'Assistant IA')}</li>
                )}
                {(can('stats_forecast_view') || can('stats_returns_forecast_view')) && (
                  <li>
                    <button
                      onClick={() => setExpanded(e => ({ ...e, iaPrevisions: !e.iaPrevisions }))}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                        ['/dashboard/previsions-ventes', '/dashboard/previsions-retours'].some(p => location.pathname.startsWith(p))
                          ? 'bg-violet-500/10 text-app-primary font-medium' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
                      }`}
                    >
                      <span className="flex items-center gap-2.5"><span className="shrink-0">{ICONS.stats}</span>Prévisions</span>
                      <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded.iaPrevisions ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    {expanded.iaPrevisions && (
                      <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                        {can('stats_forecast_view') && <li>{link('/dashboard/previsions-ventes', 'Prévision de ventes')}</li>}
                        {can('stock_view') && <li>{link('/dashboard/stock', 'Prévision de rupture de stock')}</li>}
                        {can('stats_returns_forecast_view') && <li>{link('/dashboard/previsions-retours', 'Prévision de taux de retour')}</li>}
                      </ul>
                    )}
                  </li>
                )}
                {(can('recommendations_view') || can('store_audit_view') || can('confirmateur_monitoring_view')) && (
                  <li>
                    <button
                      onClick={() => setExpanded(e => ({ ...e, iaAnalyse: !e.iaAnalyse }))}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                        ['/dashboard/recommandations', '/dashboard/audit-boutique', '/dashboard/suivi-confirmateurs'].some(p => location.pathname.startsWith(p))
                          ? 'bg-violet-500/10 text-app-primary font-medium' : 'text-app-muted-light hover:text-app-primary hover:bg-violet-500/5'
                      }`}
                    >
                      <span className="flex items-center gap-2.5"><span className="shrink-0">{ICONS.stats}</span>Analyse</span>
                      <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded.iaAnalyse ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    {expanded.iaAnalyse && (
                      <ul className="mt-0.5 ml-5 space-y-0.5 border-l pl-3" style={{ borderColor: theme.dark.border }}>
                        {can('recommendations_view') && <li>{link('/dashboard/recommandations', 'Recommandations')}</li>}
                        {can('store_audit_view') && <li>{link('/dashboard/audit-boutique', 'Audit de la boutique')}</li>}
                        {can('confirmateur_monitoring_view') && <li>{link('/dashboard/suivi-confirmateurs', 'Suivi des confirmateurs')}</li>}
                      </ul>
                    )}
                  </li>
                )}
              </ul>
            </div>
          )}
```

⚠️ Vérifier avant de remplacer que `link(...)` (helper à 2 arguments, utilisé pour les sous-liens des autres groupes comme "Statistiques") existe déjà dans ce fichier avec la même signature que `link(path, label)`/`link(path, label, exact)` — déjà utilisé abondamment ailleurs dans `DashboardLayout.jsx`, aucune nouvelle fonction à créer.

⚠️ Le sous-lien "Prévision de rupture de stock" reste un lien direct vers `/dashboard/stock` (inchangé, comportement déjà décidé lors du chantier stock forecast) — gaté par `stock_view` et non par une permission IA dédiée, cohérent avec le fait que cette fonctionnalité est une colonne intégrée à la page Stock existante, pas une page séparée.

- [ ] **Step 3: Run les tests concernés**

Run: `cd frontend && npm run test -- DashboardLayout App.test`
Expected: `PASS`.

- [ ] **Step 4: Run la suite frontend complète**

Run: `npm run test`
Expected: tous les tests passent.

- [ ] **Step 5: Commit**

```bash
git diff frontend/src/components/DashboardLayout.jsx
git add frontend/src/components/DashboardLayout.jsx
git commit -m "feat(sidebar): regroupe le menu IA en 3 sous-groupes (Assistant/Prévisions/Analyse)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Recherche sur `RecommendationsPage.jsx`

**Files:**
- Modify: `frontend/src/pages/orders/RecommendationsPage.jsx`
- Modify: `frontend/src/tests/pages/orders/RecommendationsPage.test.jsx`

**Interfaces:**
- Consumes: `promote`/`trending`/`bundles` (déjà chargés).

- [ ] **Step 1: Écrire le test**

Ajouter à `frontend/src/tests/pages/orders/RecommendationsPage.test.jsx` (lire le fichier existant d'abord pour reprendre son style de mock exact) :
```jsx
it('filtre les 3 sections par nom de produit via la recherche', async () => {
  api.get.mockImplementation((url) => {
    if (url.includes('/promote/'))  return Promise.resolve({ data: { results: [
      { product_id: 1, product_name: 'Nike Dunk', margin_pct: 0.6, total_stock: 40, sales_rate_14d: 0.2, score: 100 },
      { product_id: 2, product_name: 'T-shirt basique', margin_pct: 0.5, total_stock: 20, sales_rate_14d: 0.1, score: 80 },
    ] } })
    if (url.includes('/trending/')) return Promise.resolve({ data: { results: [] } })
    if (url.includes('/bundles/'))  return Promise.resolve({ data: { results: [] } })
    return Promise.resolve({ data: { count: 0 } })
  })
  render(<MemoryRouter><RecommendationsPage /></MemoryRouter>)
  await screen.findByText('Nike Dunk')
  fireEvent.change(screen.getByPlaceholderText(/Rechercher un produit/i), { target: { value: 'Nike' } })
  expect(screen.getByText('Nike Dunk')).toBeInTheDocument()
  expect(screen.queryByText('T-shirt basique')).not.toBeInTheDocument()
})
```
Ajouter `fireEvent` à l'import `@testing-library/react` en tête du fichier si absent.

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd frontend && npm run test -- RecommendationsPage`
Expected: échec (`getByPlaceholderText` ne trouve rien).

- [ ] **Step 3: Ajouter le champ de recherche**

Dans `frontend/src/pages/orders/RecommendationsPage.jsx`, ajouter un state et un filtrage :
```jsx
  const [search, setSearch] = useState('')
  const matches = name => name.toLowerCase().includes(search.trim().toLowerCase())
  const filteredPromote = promote.filter(r => matches(r.product_name))
  const filteredTrending = trending.filter(r => matches(r.product_name))
  const filteredBundles = bundles.filter(r => matches(r.product_name_a) || matches(r.product_name_b))
```
Ajouter le champ juste avant `<div className="space-y-8">` :
```jsx
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un produit…"
            className="w-full max-w-sm px-3.5 py-2 rounded-lg text-sm text-app-primary border outline-none focus:border-violet-500 transition"
            style={{ background: theme.dark.card, borderColor: theme.dark.border }}
          />
```
Remplacer `promote.map`/`trending.map`/`bundles.map` par `filteredPromote.map`/`filteredTrending.map`/`filteredBundles.map`, et les 3 conditions `.length === 0` correspondantes par les versions filtrées (`filteredPromote.length === 0 ? <p>...</p>`, etc. — le message affiché reste le même, seule la source de données change).

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npm run test -- RecommendationsPage`
Expected: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/orders/RecommendationsPage.jsx frontend/src/tests/pages/orders/RecommendationsPage.test.jsx
git commit -m "feat(recommendations): recherche par nom de produit sur les 3 sections

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Recherche + filtre drapeaux sur `ConfirmateurMonitoringPage.jsx`

**Files:**
- Modify: `frontend/src/pages/team/ConfirmateurMonitoringPage.jsx`
- Modify: `frontend/src/tests/pages/team/ConfirmateurMonitoringPage.test.jsx`

**Interfaces:**
- Consumes: `overview` (déjà chargé, `{member_id, name, score, orders_assigned, flags}`).

- [ ] **Step 1: Écrire le test**

Ajouter au fichier existant :
```jsx
it('filtre par nom et par présence de drapeaux', async () => {
  mockGet()
  render(<MemoryRouter><ConfirmateurMonitoringPage /></MemoryRouter>)
  await screen.findByText('Sara Confirmatrice')
  fireEvent.change(screen.getByPlaceholderText(/Rechercher un confirmateur/i), { target: { value: 'Karim' } })
  expect(screen.queryByText('Sara Confirmatrice')).not.toBeInTheDocument()
  expect(screen.getByText('Karim Confirmateur')).toBeInTheDocument()
})

it('filtre sur "Avec alerte" uniquement', async () => {
  mockGet()
  render(<MemoryRouter><ConfirmateurMonitoringPage /></MemoryRouter>)
  await screen.findByText('Sara Confirmatrice')
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'with_flags' } })
  expect(screen.queryByText('Sara Confirmatrice')).not.toBeInTheDocument()
  expect(screen.getByText('Karim Confirmateur')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd frontend && npm run test -- ConfirmateurMonitoringPage`
Expected: échec (`getByPlaceholderText`/`getByRole('combobox')` ne trouvent rien).

- [ ] **Step 3: Ajouter recherche + filtre**

Dans `frontend/src/pages/team/ConfirmateurMonitoringPage.jsx` :
```jsx
  const [search, setSearch] = useState('')
  const [flagFilter, setFlagFilter] = useState('all')

  const filteredOverview = overview.filter(row => {
    if (search && !row.name.toLowerCase().includes(search.trim().toLowerCase())) return false
    if (flagFilter === 'with_flags' && row.flags.length === 0) return false
    if (flagFilter === 'without_flags' && row.flags.length > 0) return false
    return true
  })
```
Ajouter les contrôles juste avant le bloc `{teamExplanation && (...)}`  :
```jsx
          <div className="flex gap-3 flex-wrap">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un confirmateur…"
              className="flex-1 min-w-48 px-3.5 py-2 rounded-lg text-sm text-app-primary border outline-none focus:border-violet-500 transition"
              style={{ background: theme.dark.card, borderColor: theme.dark.border }}
            />
            <select
              value={flagFilter} onChange={e => setFlagFilter(e.target.value)}
              className="px-3.5 py-2 rounded-lg text-sm text-app-primary border outline-none focus:border-violet-500 transition"
              style={{ background: theme.dark.card, borderColor: theme.dark.border }}
            >
              <option value="all">Tous</option>
              <option value="with_flags">Avec alerte</option>
              <option value="without_flags">Sans alerte</option>
            </select>
          </div>
```
Remplacer `overview.map` par `filteredOverview.map`, et `overview.length === 0` par `filteredOverview.length === 0` (garder un message différent si la liste brute est vide vs. filtrée vide n'est pas nécessaire — même message "Aucun confirmateur actif." suffit dans les deux cas, YAGNI).

⚠️ Ce plan utilise un `<select>` HTML natif ici plutôt que `components/Select.jsx` — **vérifier la convention du projet avant d'écrire cette étape** : `CLAUDE.md` interdit `<select>` natif partout ailleurs dans le dashboard à cause d'un bug d'affichage Windows connu. Utiliser `components/Select.jsx` (`value`, `onChange(value)`, `options: [{value, label}]`, `variant="dark"`) à la place, et adapter le test en conséquence (`Select.jsx` ne rend pas nécessairement un `role="combobox"` — vérifier son rendu réel avant d'écrire le test, ou cibler par label/texte affiché plutôt que par rôle ARIA).

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npm run test -- ConfirmateurMonitoringPage`
Expected: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/team/ConfirmateurMonitoringPage.jsx frontend/src/tests/pages/team/ConfirmateurMonitoringPage.test.jsx
git commit -m "feat(confirmateur-monitoring): recherche par nom + filtre par drapeaux

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Recherche sur l'historique de conversations (`AIAssistantPage.jsx`)

**Files:**
- Modify: `frontend/src/pages/ai/AIAssistantPage.jsx`
- Test: `frontend/src/tests/pages/ai/AIAssistantPage.test.jsx` (vérifier l'existence avant d'écrire — sinon créer un fichier minimal ciblé sur ce seul comportement, sans dupliquer la couverture complète de la page)

**Interfaces:**
- Consumes: `conversations` (déjà chargées, `{id, title}`).

- [ ] **Step 1: Vérifier l'existence du fichier de test**

Run: `ls frontend/src/tests/pages/ai/AIAssistantPage.test.jsx 2>&1 || echo "n'existe pas"`

- [ ] **Step 2: Écrire le test**

Si le fichier existe, lire son mock exact (probablement `listConversations`/`getConversation`/`sendChatMessage` mockés depuis un module `api/aiApi.js`) et ajouter dans son style :
```jsx
it('filtre les conversations par titre via la recherche', async () => {
  listConversations.mockResolvedValue([
    { id: 1, title: 'Question sur le stock' },
    { id: 2, title: 'Question sur les retours' },
  ])
  render(<MemoryRouter><AIAssistantPage /></MemoryRouter>)
  await screen.findByText('Question sur le stock')
  fireEvent.change(screen.getByPlaceholderText(/Rechercher une conversation/i), { target: { value: 'retours' } })
  expect(screen.queryByText('Question sur le stock')).not.toBeInTheDocument()
  expect(screen.getByText('Question sur les retours')).toBeInTheDocument()
})
```
Si le fichier n'existe pas, créer une version minimale de test ciblée uniquement sur ce comportement (mock de `api/aiApi.js` : `listConversations`, `getConversation`, `sendChatMessage`, `deleteConversation` si utilisée par la page) — lire d'abord `AIAssistantPage.jsx` en entier pour connaître l'API exacte de ces fonctions avant d'écrire les mocks.

- [ ] **Step 3: Run pour vérifier l'échec**

Run: `cd frontend && npm run test -- AIAssistantPage`
Expected: échec.

- [ ] **Step 4: Ajouter le champ de recherche**

Dans `frontend/src/pages/ai/AIAssistantPage.jsx`, ajouter un state juste après `const [conversations, setConversations] = useState([])` :
```jsx
  const [conversationSearch, setConversationSearch] = useState('')
```
Juste avant la fermeture du composant, calculer :
```jsx
  const filteredConversations = conversations.filter(c =>
    (c.title || `Conversation #${c.id}`).toLowerCase().includes(conversationSearch.trim().toLowerCase())
  )
```
Ajouter le champ juste après le bouton "Nouvelle conversation" (dans le même `<div className="p-2 border-b border-app">`, ou un `<div>` juste après lui) :
```jsx
          <div className="px-2 pb-2 border-b border-app">
            <input
              value={conversationSearch} onChange={e => setConversationSearch(e.target.value)}
              placeholder="Rechercher une conversation…"
              className="w-full px-2.5 py-1.5 rounded-lg text-xs text-app-primary bg-app-card-alt outline-none focus:ring-1 focus:ring-violet-500 transition"
            />
          </div>
```
Remplacer `conversations.map(c => (` par `filteredConversations.map(c => (`, et `conversations.length === 0` par `filteredConversations.length === 0`.

- [ ] **Step 5: Run pour vérifier le succès**

Run: `npm run test -- AIAssistantPage`
Expected: `PASS`.

- [ ] **Step 6: Run la suite frontend complète**

Run: `npm run test`
Expected: tous les tests passent (référence : ~426 tests avant ce chantier).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/ai/AIAssistantPage.jsx frontend/src/tests/pages/ai/AIAssistantPage.test.jsx
git commit -m "feat(assistant-ia): recherche par titre sur l'historique de conversations

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Backend — `get_inventory` étendu + outils Catalogue/Équipe

**Files:**
- Modify: `backend/ai_assistant/tools.py`
- Modify: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `stores.audit._catalogue_score(store)` (chantier audit boutique), `team.monitoring.compute_confirmateur_detail(store, member)` (chantier suivi confirmateurs).
- Produces: `get_inventory` étendu (`price`, `is_active` en plus de `name`/`stock`), `get_incomplete_products(request)`, `get_team_summary(request)`, `get_confirmateur_performance(request, name)`.

- [ ] **Step 1: Écrire les tests**

Lire d'abord `backend/ai_assistant/tests.py` en entier pour reprendre le style exact des tests existants sur `get_low_stock`/`get_inventory` (probablement une requête HTTP réelle via `ChatView` avec un tool_call mocké, ou un appel direct à la fonction — à confirmer par lecture avant d'écrire). Ajouter, en suivant ce même style :
```python
class ExtendedToolsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_get_inventory_includes_price_and_active_status(self):
        from ai_assistant.tools import get_inventory
        import json
        from products.models import Product
        Product.objects.create(store=self.store, name='Complet', price=1000, stock=5, is_active=True)
        request = self._fake_request(self.owner)
        result = json.loads(get_inventory(request))
        self.assertEqual(result['products'][0]['price'], 1000.0)
        self.assertTrue(result['products'][0]['is_active'])

    def _fake_request(self, user):
        from unittest.mock import MagicMock
        request = MagicMock()
        request.user = user
        return request

    def test_get_incomplete_products_requires_permission(self):
        from ai_assistant.tools import get_incomplete_products
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        request = self._fake_request(conf_user)
        result = get_incomplete_products(request)
        self.assertIn('permission', result)

    def test_get_incomplete_products_lists_missing_fields(self):
        from ai_assistant.tools import get_incomplete_products
        import json
        from products.models import Product
        Product.objects.create(store=self.store, name='Incomplet', price=1000, stock=5, is_active=True)
        request = self._fake_request(self.owner)
        result = json.loads(get_incomplete_products(request))
        self.assertEqual(result['active_products'], 1)
        self.assertIn('Incomplet', result['missing_image'])

    def test_get_team_summary_requires_permission(self):
        from ai_assistant.tools import get_team_summary
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        request = self._fake_request(conf_user)
        result = get_team_summary(request)
        self.assertIn('permission', result)

    def test_get_team_summary_lists_active_members(self):
        from ai_assistant.tools import get_team_summary
        import json
        make_team_member(self.store, 'confirmateur')
        request = self._fake_request(self.owner)
        result = json.loads(get_team_summary(request))
        self.assertEqual(len(result['members']), 1)

    def test_get_confirmateur_performance_by_name(self):
        from ai_assistant.tools import get_confirmateur_performance
        import json
        _, member = make_team_member(self.store, 'confirmateur')
        request = self._fake_request(self.owner)
        result = json.loads(get_confirmateur_performance(request, name=member.first_name))
        self.assertEqual(result['member_id'], member.id)

    def test_get_confirmateur_performance_unknown_name(self):
        from ai_assistant.tools import get_confirmateur_performance
        request = self._fake_request(self.owner)
        result = get_confirmateur_performance(request, name='Inconnu')
        self.assertIn('introuvable', result.lower())
```

⚠️ Adapter `_fake_request`/le mécanisme d'appel à ce que `backend/ai_assistant/tests.py` utilise réellement pour les tools existants — ce squelette est indicatif, la vraie contrainte est de suivre le style déjà en place dans ce fichier, pas nécessairement une requête `MagicMock` (le fichier existant utilise peut-être `RequestFactory`/`auth_client` + inspection de `ChatView`).

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ExtendedToolsTest -v 2`
Expected: échecs (fonctions inexistantes ou `get_inventory` sans `price`/`is_active`).

- [ ] **Step 3: Étendre `get_inventory`**

Dans `backend/ai_assistant/tools.py`, remplacer :
```python
    products = [{'name': p.name, 'stock': p.total_stock} for p in qs[:30]]
```
par :
```python
    products = [{'name': p.name, 'stock': p.total_stock, 'price': float(p.price), 'is_active': p.is_active} for p in qs[:30]]
```

- [ ] **Step 4: Ajouter `get_incomplete_products`**

Juste après `get_inventory` :
```python
def get_incomplete_products(request):
    """Réutilise le calcul de l'audit boutique (stores/audit.py) — jamais de
    duplication de la logique de complétude catalogue."""
    if not (is_owner_or_admin(request) or has_permission(request, 'products_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from stores.audit import _catalogue_score
    result = _catalogue_score(store)
    d = result['details']
    if not d.get('active_products'):
        return _serialize({'active_products': 0})
    return _serialize({
        'active_products': d['active_products'],
        'missing_image': [p['name'] for p in d['missing_image'][:15]],
        'missing_description': [p['name'] for p in d['missing_description'][:15]],
        'missing_cost_price': [p['name'] for p in d['missing_cost_price'][:15]],
        'missing_category': [p['name'] for p in d['missing_category'][:15]],
    })
```

- [ ] **Step 5: Ajouter `get_team_summary`**

```python
def get_team_summary(request):
    if not (is_owner_or_admin(request) or has_permission(request, 'team_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    members = store.team_members.filter(is_active=True)
    return _serialize({'members': [
        {'name': f"{m.first_name} {m.last_name}".strip(), 'role': m.role, 'online': m.is_currently_online}
        for m in members
    ]})
```

- [ ] **Step 6: Ajouter `get_confirmateur_performance`**

```python
def get_confirmateur_performance(request, name):
    if not (is_owner_or_admin(request) or has_permission(request, 'confirmateur_monitoring_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    member = store.team_members.filter(role='confirmateur', is_active=True, first_name__icontains=name).first()
    if not member:
        return f"Confirmateur « {name} » introuvable."
    from team.monitoring import compute_confirmateur_detail
    return _serialize(compute_confirmateur_detail(store, member))
```

- [ ] **Step 7: Enregistrer les 3 nouveaux outils dans `TOOL_REGISTRY`/`TOOL_DEFINITIONS`**

Ajouter à `TOOL_REGISTRY` :
```python
    'get_incomplete_products': get_incomplete_products,
    'get_team_summary': get_team_summary,
    'get_confirmateur_performance': get_confirmateur_performance,
```
Ajouter à `TOOL_DEFINITIONS` :
```python
    {
        'type': 'function',
        'function': {
            'name': 'get_incomplete_products',
            'description': "Produits actifs dont la fiche est incomplète (sans image, sans description, sans prix d'achat, ou sans catégorie).",
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_team_summary',
            'description': "Liste des membres actifs de l'équipe (nom, rôle, en ligne ou non).",
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_confirmateur_performance',
            'description': "Performance et signaux d'anomalie d'un confirmateur précis, par son prénom.",
            'parameters': {
                'type': 'object',
                'properties': {'name': {'type': 'string', 'description': 'Prénom du confirmateur'}},
                'required': ['name'],
            },
        },
    },
```

- [ ] **Step 8: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test ai_assistant.tests.ExtendedToolsTest -v 2`
Expected: `OK`.

- [ ] **Step 9: Run toute la suite `ai_assistant` pour vérifier l'absence de régression sur `get_inventory`**

Run: `venv/Scripts/python manage.py test ai_assistant -v 1 --noinput`
Expected: `OK` (les tests existants sur `get_inventory` ne vérifient probablement que `name`/`stock` — l'ajout de champs ne devrait rien casser, mais à confirmer).

- [ ] **Step 10: Commit**

```bash
git diff backend/ai_assistant/tools.py
git add backend/ai_assistant/tools.py backend/ai_assistant/tests.py
git commit -m "feat(assistant-ia): étend get_inventory + ajoute catalogue/équipe/confirmateur

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Backend — outils Retours/Échanges/Réclamations/Finances/Abonnement

**Files:**
- Modify: `backend/ai_assistant/tools.py`
- Modify: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `orders.stats_views.ReturnsStatsView`, `orders.models.ExchangeRequest`, `inbox.models.Conversation`, `finance.models.Cost`, `finance.views._payments_summary`, `stores.models.SubscriptionQuota`.
- Produces: `get_returns_summary`, `get_pending_exchanges`, `get_open_complaints`, `get_costs_summary`, `get_payments_summary`, `get_subscription_status`.

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/ai_assistant/tests.py` (même style que Task 6, adapter `_fake_request` si un helper différent est déjà utilisé dans le fichier) :
```python
class MoreExtendedToolsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def _fake_request(self, user):
        from unittest.mock import MagicMock
        request = MagicMock()
        request.user = user
        return request

    def test_get_returns_summary_requires_permission(self):
        from ai_assistant.tools import get_returns_summary
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        result = get_returns_summary(self._fake_request(conf_user))
        self.assertIn('permission', result)

    def test_get_returns_summary_returns_rate(self):
        from ai_assistant.tools import get_returns_summary
        import json
        result = json.loads(get_returns_summary(self._fake_request(self.owner)))
        self.assertIn('return_rate', result)

    def test_get_pending_exchanges_lists_open_only(self):
        from ai_assistant.tools import get_pending_exchanges
        import json
        from orders.models import Order, OrderItem, ExchangeRequest
        from products.models import Product, ProductVariant, VariantOption
        product = Product.objects.create(store=self.store, name='Chaussure', price=1000, is_active=True)
        variant = ProductVariant.objects.create(product=product, name='Taille')
        opt_a = VariantOption.objects.create(variant=variant, value='40', stock=5)
        opt_b = VariantOption.objects.create(variant=variant, value='41', stock=5)
        order = Order.objects.create(store=self.store, first_name='C', last_name='L', phone='0555000000',
                                      wilaya='Alger', commune='Alger Centre', address='Adr', status='delivered',
                                      subtotal=1000, shipping_cost=0, total=1000)
        item = OrderItem.objects.create(order=order, product=product, variant_option=opt_a, product_name='Chaussure', price=1000, quantity=1)
        ExchangeRequest.objects.create(store=self.store, order_item=item, replacement_option=opt_b, reason='Trop petit', status='open')
        result = json.loads(get_pending_exchanges(self._fake_request(self.owner)))
        self.assertEqual(result['count'], 1)

    def test_get_open_complaints_counts_open_and_in_progress(self):
        from ai_assistant.tools import get_open_complaints
        import json
        from inbox.models import Conversation
        Conversation.objects.create(store=self.store, channel='complaint', status='open', customer_phone='0555000000')
        Conversation.objects.create(store=self.store, channel='complaint', status='resolved', customer_phone='0555000001')
        result = json.loads(get_open_complaints(self._fake_request(self.owner)))
        self.assertEqual(result['count'], 1)

    def test_get_costs_summary_groups_by_category(self):
        from ai_assistant.tools import get_costs_summary
        import json
        from datetime import date
        from finance.models import Cost
        Cost.objects.create(store=self.store, category='marketing', label='Facebook Ads', amount=5000,
                             period_start=date(2026, 9, 1), period_end=date(2026, 9, 30))
        result = json.loads(get_costs_summary(self._fake_request(self.owner)))
        self.assertGreater(result['total'], 0)

    def test_get_payments_summary_defaults_to_ready(self):
        from ai_assistant.tools import get_payments_summary
        import json
        result = json.loads(get_payments_summary(self._fake_request(self.owner)))
        self.assertIn('total_orders', result)

    def test_get_subscription_status_owner_only(self):
        from ai_assistant.tools import get_subscription_status
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        result = get_subscription_status(self._fake_request(conf_user))
        self.assertIn('permission', result)

    def test_get_subscription_status_returns_quota(self):
        from ai_assistant.tools import get_subscription_status
        import json
        result = json.loads(get_subscription_status(self._fake_request(self.owner)))
        self.assertIn('orders_remaining', result)
```

⚠️ Vérifier les champs obligatoires exacts de `ExchangeRequest`/`Conversation`/`Cost` par lecture de leurs modèles avant d'écrire ces tests si la création échoue — ce squelette reprend les champs déjà documentés dans `CLAUDE.md` mais un champ requis pourrait manquer selon la version exacte du modèle.

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `venv/Scripts/python manage.py test ai_assistant.tests.MoreExtendedToolsTest -v 2`
Expected: échecs (fonctions inexistantes).

- [ ] **Step 3: Ajouter un `_Shim` réutilisable et `get_returns_summary`**

Généraliser le shim déjà utilisé par `get_profitability_summary` (actuellement une classe locale `_Shim` définie à l'intérieur de la fonction) en le sortant au niveau module, réutilisable par les nouveaux outils :
```python
class _RequestShim:
    def __init__(self, user, query_params):
        self.user = user
        self.query_params = query_params
```
Remplacer la classe locale `_Shim` de `get_profitability_summary` par un usage de `_RequestShim` (supprimer la définition locale devenue redondante), puis ajouter :
```python
def get_returns_summary(request, period='week'):
    if not (is_owner_or_admin(request) or has_permission(request, 'stats_returns_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from orders.stats_views import ReturnsStatsView
    view = ReturnsStatsView()
    resp = view.get(_RequestShim(request.user, {'period': period}))
    if resp.status_code != 200:
        return _serialize({'error': 'indisponible'})
    return _serialize({'return_rate': resp.data['return_rate'], 'returned_count': resp.data['returned_count'], 'total_orders': resp.data['total_orders']})
```

- [ ] **Step 4: Ajouter `get_pending_exchanges`**

```python
def get_pending_exchanges(request):
    if not (is_owner_or_admin(request) or has_permission(request, 'exchanges_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from orders.models import ExchangeRequest
    qs = ExchangeRequest.objects.filter(store=store, status='open')
    items = [{'id': e.id, 'reason': e.reason} for e in qs[:20]]
    return _serialize({'count': qs.count(), 'exchanges': items})
```

- [ ] **Step 5: Ajouter `get_open_complaints`**

```python
def get_open_complaints(request):
    if not (is_owner_or_admin(request) or has_permission(request, 'inbox_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from inbox.models import Conversation
    qs = Conversation.objects.filter(store=store, status__in=['open', 'in_progress'])
    return _serialize({'count': qs.count()})
```

- [ ] **Step 6: Ajouter `get_costs_summary`**

```python
def get_costs_summary(request, period_start=None, period_end=None):
    if not (is_owner_or_admin(request) or has_permission(request, 'costs_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from finance.models import Cost
    qs = Cost.objects.filter(store=store)
    if period_start:
        qs = qs.filter(period_end__gte=period_start)
    if period_end:
        qs = qs.filter(period_start__lte=period_end)
    from django.db.models import Sum
    by_category = dict(qs.values_list('category').annotate(s=Sum('amount')).order_by())
    total = sum(by_category.values()) if by_category else 0
    return _serialize({'total': float(total), 'by_category': {k: float(v) for k, v in by_category.items()}})
```

- [ ] **Step 7: Ajouter `get_payments_summary`**

```python
def get_payments_summary(request, state='ready'):
    if state not in ('ready', 'collected'):
        state = 'ready'
    if not (is_owner_or_admin(request) or has_permission(request, 'payments_ready_view') or has_permission(request, 'payments_collected_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from finance.views import _payments_summary
    return _serialize(_payments_summary(store, None, None, state))
```

⚠️ Vérifier que `_payments_summary` est bien importable depuis `finance.views` (fonction module-level, pas une méthode de classe) — confirmé par lecture de `finance/views.py` avant ce plan (signature `_payments_summary(store, period_start, period_end, state)`).

- [ ] **Step 8: Ajouter `get_subscription_status`**

```python
def get_subscription_status(request):
    if not is_owner_or_admin(request):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    quota = store.quota
    return _serialize({
        'orders_used': quota.orders_used, 'orders_limit': quota.orders_limit,
        'orders_remaining': quota.orders_remaining, 'is_trial_active': quota.is_trial_active,
        'plan': quota.plan.name if quota.plan else None,
    })
```

- [ ] **Step 9: Enregistrer les 6 nouveaux outils**

Ajouter à `TOOL_REGISTRY` :
```python
    'get_returns_summary': get_returns_summary,
    'get_pending_exchanges': get_pending_exchanges,
    'get_open_complaints': get_open_complaints,
    'get_costs_summary': get_costs_summary,
    'get_payments_summary': get_payments_summary,
    'get_subscription_status': get_subscription_status,
```
Ajouter à `TOOL_DEFINITIONS` :
```python
    {
        'type': 'function',
        'function': {
            'name': 'get_returns_summary',
            'description': "Taux de retour et nombre de commandes retournées sur une période (day/week/month).",
            'parameters': {'type': 'object', 'properties': {'period': {'type': 'string', 'description': "'day', 'week' ou 'month'"}}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_pending_exchanges',
            'description': "Demandes d'échange en attente de validation.",
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_open_complaints',
            'description': "Nombre de réclamations ouvertes ou en cours dans la boîte de réception.",
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_costs_summary',
            'description': "Coûts opérationnels/marketing enregistrés, ventilés par catégorie, sur une période.",
            'parameters': {
                'type': 'object',
                'properties': {
                    'period_start': {'type': 'string', 'description': 'YYYY-MM-DD'},
                    'period_end': {'type': 'string', 'description': 'YYYY-MM-DD'},
                },
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_payments_summary',
            'description': "Indicateurs de paiement COD ('ready' = prêt à recevoir, 'collected' = déjà récupéré).",
            'parameters': {'type': 'object', 'properties': {'state': {'type': 'string', 'description': "'ready' ou 'collected'"}}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_subscription_status',
            'description': "Quota de commandes restant et palier d'abonnement actuel de la boutique.",
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
```

- [ ] **Step 10: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test ai_assistant.tests.MoreExtendedToolsTest -v 2`
Expected: `OK`.

- [ ] **Step 11: Run toute la suite `ai_assistant` + `finance` pour vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test ai_assistant finance -v 1 --noinput`
Expected: `OK` (le remplacement de la classe locale `_Shim` par `_RequestShim` dans `get_profitability_summary` ne doit rien casser — même comportement, juste sortie du niveau fonction).

- [ ] **Step 12: Commit**

```bash
git diff backend/ai_assistant/tools.py
git add backend/ai_assistant/tools.py backend/ai_assistant/tests.py
git commit -m "feat(assistant-ia): ajoute retours/échanges/réclamations/finances/abonnement

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Suite complète + documentation + déploiement

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Lancer la suite backend complète**

```bash
cd backend
venv/Scripts/python manage.py test ai_assistant orders products team stores finance inbox -v 1 --noinput
```
Expected: `OK`. Nettoyer si nécessaire :
```bash
venv/Scripts/python manage.py shell -c "
from django.db import connections
with connections['default'].cursor() as c:
    c.execute(\"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='test_mzsolutions'\")
"
```

- [ ] **Step 2: Lancer la suite frontend complète**

```bash
cd frontend
npm run test
```
Expected: tous les tests passent (référence : ~426 tests avant ce chantier).

- [ ] **Step 3: Étendre `CLAUDE.md`**

Localiser le paragraphe de clôture du suivi confirmateurs et ajouter juste après son "Testé via..." :
```markdown
**Optimisation des fonctionnalités IA (2026-09)** — recherche côté client sur les 3 pages qui en manquaient (Recommandations produit par nom de produit, Suivi des confirmateurs par nom + filtre drapeaux, Assistant IA par titre de conversation), aucun nouvel appel réseau. Menu IA de la sidebar réorganisé en 3 sous-groupes repliables (Assistant / Prévisions / Analyse, même mécanique que les groupes Statistiques/Expéditions déjà existants) — corrige au passage un bug signalé : les routes `/dashboard/stats/previsions*` déclenchaient à tort l'ouverture du groupe Statistiques (`expanded.stats = pathname.startsWith('/dashboard/stats')`), renommées en `/dashboard/previsions-ventes`/`previsions-retours`, hors du préfixe `/stats`.

Assistant IA élargi à 9 nouveaux outils (`ai_assistant/tools.py`), chacun réutilisant un module/une vue déjà existante (aucune nouvelle requête DB non déjà exposée ailleurs) avec la même formule de permission stricte que son équivalent REST : `get_inventory` étendu (prix, actif/inactif), `get_incomplete_products` (réutilise `stores.audit._catalogue_score`), `get_team_summary`, `get_confirmateur_performance` (réutilise `team.monitoring.compute_confirmateur_detail`), `get_returns_summary` (réutilise `ReturnsStatsView`), `get_pending_exchanges`, `get_open_complaints`, `get_costs_summary`, `get_payments_summary` (réutilise `finance.views._payments_summary`), `get_subscription_status` (owner/admin strict, comme la page Abonnement).

Testé via `manage.py test ai_assistant orders products team stores finance inbox` (X tests, dont Y dédiés aux nouveaux outils) + suite frontend complète (Z tests, aucune régression).
```
Remplacer X/Y/Z par les chiffres réels.

- [ ] **Step 4: Commit la doc**

```bash
git diff CLAUDE.md
git add CLAUDE.md
git commit -m "docs: documente l'optimisation des fonctionnalités IA

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Pousser sur origin/main**

```bash
git push origin main
```

- [ ] **Step 6: Déployer sur le serveur de production**

Aucune migration (aucun changement de modèle) :
```bash
SSH_KEY="C:\Users\filali\Downloads\Key server MZSolutions\mzsolutions-key.pem"
ssh -i "$SSH_KEY" ubuntu@mzsol.online "cd /home/ubuntu/mzsolutions && mkdir -p ~/backups && docker compose exec -T db pg_dump -U mzsolutions mzsolutions > ~/backups/pre_optimisation_ia_\$(date +%Y%m%d_%H%M%S).sql"
ssh -i "$SSH_KEY" ubuntu@mzsol.online "cd /home/ubuntu/mzsolutions && git pull origin main"
ssh -i "$SSH_KEY" ubuntu@mzsol.online "cd /home/ubuntu/mzsolutions && docker compose build backend frontend && docker compose up -d --no-deps backend frontend"
```

- [ ] **Step 7: Vérifier la santé du site et le comportement d'ollama**

```bash
ssh -i "$SSH_KEY" ubuntu@mzsol.online "docker ps -a --format 'table {{.Names}}\t{{.Status}}' | grep -i ollama"
curl -sI https://mzsol.online/ | head -3
```
Expected : conteneur `ollama` toujours `Exited`, site `200 OK`.

- [ ] **Step 8: Vérifier en conditions réelles sur le serveur**

Même méthode que les chantiers précédents — vérifier au minimum qu'un appel direct à `ai_assistant.tools.get_team_summary(request)` (via `manage.py shell`, avec un faux `request` construit à la main ou une vraie requête `APIClient`) fonctionne sur des données réelles de test, données nettoyées ensuite. Vérifier aussi que la sidebar affiche bien les 3 sous-groupes IA en ouvrant le dashboard dans un navigateur si possible, sinon au minimum confirmer que `curl` sur `/dashboard/previsions-ventes` et `/dashboard/previsions-retours` renvoie le HTML de l'app (pas un 404 serveur — ces routes sont gérées côté client par React Router, donc un 404 serveur indiquerait un problème de configuration Caddy/nginx, pas de route React).

- [ ] **Step 9: Rapport final**

Résumer à l'utilisateur : nombre de tests backend/frontend, ce qui a été déployé, rappeler que le bug de sidebar signalé est corrigé.
