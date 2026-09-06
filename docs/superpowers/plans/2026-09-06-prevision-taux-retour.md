# Prévision de taux de retour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une page "Prévision de taux de retour" (dashboard → menu IA) qui projette le taux de retour futur de la boutique, calcul 100% déterministe, sur le modèle exact de la Prévision de ventes déjà en prod.

**Architecture:** Module pur `orders/returns_forecast.py` (aucune I/O réseau, aucun appel IA, aucune dépendance vers `stats_views.py` — donc pas de risque de cycle d'import, contrairement à `sales_forecast.py`), consommé par une nouvelle vue `ReturnsForecastView`, affiché sur une nouvelle page frontend calquée sur `SalesForecastPage.jsx`.

**Tech Stack:** Django 5.2 + DRF (backend existant), React 18 + recharts (frontend existant, déjà utilisé par `SalesForecastPage.jsx`).

## Global Constraints

- Aucun appel IA — calcul 100% déterministe, même philosophie que `sales_forecast.py`/`stock_forecast.py`.
- Définition du taux de retour réutilisée telle quelle : `retour_rate = commandes 'returned' / total des commandes créées sur la période × 100` (`orders/stats_views.py::ReturnsStatsView`), aucune nouvelle définition inventée.
- `MIN_HISTORY_DAYS = 30` (plus long que la prévision de ventes, un retour prend du temps à se matérialiser).
- Sommer les occurrences pondérées avant de diviser (pas de moyenne de taux quotidiens bruités) — voir spec.
- Taux toujours clampé entre 0 et 100.
- Horizon ajustable 7-60 jours, clampé côté serveur.
- Page rejoint le menu **IA** de la sidebar (pas Statistiques), à côté de "Prévision de ventes".
- Tests obligatoires par tâche, commits fréquents, jamais `git add -A`. Avant chaque `git add` sur un fichier partagé (`team/models.py`, `App.jsx`, `stats_views.py`, `urls.py`, `DashboardLayout.jsx`), vérifier `git diff <fichier>` pour isoler son propre diff d'un éventuel travail en cours d'un autre terminal.

---

## File Structure

```
backend/
  orders/
    returns_forecast.py   — compute_returns_forecast() pur (nouveau)
    stats_views.py           — ReturnsForecastView (modifié)
    urls.py                   — route stats/returns-forecast/ (modifié)
    tests.py                   — tests des 2 tâches backend (modifié)
  team/
    models.py                  — permission stats_returns_forecast_view (modifié)
    tests.py                    — test de la nouvelle permission (modifié, si couverture existante le justifie)

frontend/src/
  pages/orders/stats/ReturnsForecastPage.jsx  — nouvelle page (nouveau)
  tests/pages/orders/stats/ReturnsForecastPage.test.jsx — tests (nouveau)
  App.jsx                                        — route + import (modifié)
  components/DashboardLayout.jsx                — lien sidebar sous IA (modifié)

CLAUDE.md — section Assistant IA étendue (modifié)
```

---

### Task 1: `returns_forecast.py` — calcul déterministe pur

**Files:**
- Create: `backend/orders/returns_forecast.py`
- Test: `backend/orders/tests.py`

**Interfaces:**
- Produces: `returns_forecast.compute_returns_forecast(store, horizon_days) -> dict | None`. `None` si l'historique est insuffisant. Sinon `{'history_days': int, 'points': [{'date': 'YYYY-MM-DD', 'predicted_rate': float, 'rate_low': float, 'rate_high': float}, ...]}`.

- [ ] **Step 1: Écrire les tests**

Vérifier d'abord en tête de `backend/orders/tests.py` que `TestCase`, `timezone`, `timedelta` et `make_owner` sont importés (chercher les imports existants utilisés par les tests de `sales_forecast` s'ils existent déjà dans ce fichier — sinon les ajouter avec le même style que le reste du fichier).

Ajouter à `backend/orders/tests.py` :
```python
class ReturnsForecastTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def _make_order(self, days_ago, status='delivered'):
        from django.utils import timezone
        from orders.models import Order
        o = Order.objects.create(
            store=self.store, first_name='C', last_name='L', phone='0555000000',
            wilaya='Alger', commune='Alger Centre', address='Adr', status=status,
            subtotal=1000, shipping_cost=0, total=1000,
        )
        o.created_at = timezone.now() - timezone.timedelta(days=days_ago)
        o.save(update_fields=['created_at'])
        return o

    def test_insufficient_history_returns_none(self):
        from orders.returns_forecast import compute_returns_forecast
        for d in range(5):
            self._make_order(days_ago=d)
        self.assertIsNone(compute_returns_forecast(self.store, horizon_days=7))

    def test_no_orders_returns_none(self):
        from orders.returns_forecast import compute_returns_forecast
        self.assertIsNone(compute_returns_forecast(self.store, horizon_days=7))

    def test_weighted_rate_sums_before_dividing(self):
        from orders.returns_forecast import compute_returns_forecast
        # 35 jours d'historique, un seul jour de semaine cible avec un vrai volume :
        # même jour de semaine que "aujourd'hui + 7" doit apparaître dans les occurrences.
        from django.utils import timezone
        today = timezone.now().date()
        target_weekday = (today + timezone.timedelta(days=1)).weekday()
        created = 0
        d = 0
        while created < 40:
            day = today - timezone.timedelta(days=d)
            if day.weekday() == target_weekday:
                # 10 commandes ce jour-là, 1 retournée (10%) — répété sur plusieurs occurrences
                for _ in range(9):
                    self._make_order(days_ago=d, status='delivered')
                self._make_order(days_ago=d, status='returned')
                created += 10
            d += 1
        result = compute_returns_forecast(self.store, horizon_days=7)
        self.assertIsNotNone(result)
        point = result['points'][0]
        self.assertAlmostEqual(point['predicted_rate'], 10.0, delta=2.0)

    def test_rate_clamped_between_0_and_100(self):
        from orders.returns_forecast import compute_returns_forecast
        for d in range(35):
            self._make_order(days_ago=d, status='returned')
        result = compute_returns_forecast(self.store, horizon_days=7)
        self.assertIsNotNone(result)
        for p in result['points']:
            self.assertGreaterEqual(p['predicted_rate'], 0)
            self.assertLessEqual(p['predicted_rate'], 100)
            self.assertGreaterEqual(p['rate_low'], 0)
            self.assertLessEqual(p['rate_high'], 100)
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test orders.tests.ReturnsForecastTest -v 2`
Expected: `ModuleNotFoundError: No module named 'orders.returns_forecast'`

- [ ] **Step 3: Implémenter `returns_forecast.py`**

```python
"""Prévision de taux de retour — calcul DÉTERMINISTE pur, aucun appel réseau,
aucun appel IA. Moyenne mobile pondérée PAR JOUR DE LA SEMAINE, sur le même
principe que sales_forecast.py, adaptée à un TAUX (pas un volume) : les
occurrences sont sommées avant de diviser, pour ne pas bruiter le taux avec
des jours à faible volume. Aucune dépendance vers stats_views.py (contrairement
à sales_forecast.py) — pas de risque de cycle d'import ici.
Voir docs/superpowers/specs/2026-09-06-prevision-taux-retour-design.md."""
import statistics
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

MIN_HISTORY_DAYS = 30
WEEKDAY_OCCURRENCES = 4
WEEKDAY_WEIGHTS = [4, 3, 2, 1]  # plus récent en premier


def _daily_totals(store, since):
    qs = (store.orders
          .filter(created_at__date__gte=since)
          .values('created_at__date')
          .annotate(orders=Count('id'), returned=Count('id', filter=Q(status='returned')))
          .order_by('created_at__date'))
    by_date = {}
    for row in qs:
        by_date[row['created_at__date']] = {'orders': row['orders'], 'returned': row['returned']}
    return by_date


def _rate(returned, orders):
    return (returned / orders * 100) if orders else 0.0


def compute_returns_forecast(store, horizon_days):
    today = timezone.now().date()
    earliest_order = store.orders.order_by('created_at').first()
    if not earliest_order:
        return None
    history_days = (today - earliest_order.created_at.date()).days
    if history_days < MIN_HISTORY_DAYS:
        return None

    lookback = WEEKDAY_OCCURRENCES * 7 + 7
    by_date = _daily_totals(store, today - timedelta(days=lookback))

    def window_rate(start_offset_days, num_days=14):
        orders_sum = returned_sum = 0
        for i in range(1, num_days + 1):
            d = today - timedelta(days=start_offset_days + i)
            row = by_date.get(d)
            if row:
                orders_sum += row['orders']
                returned_sum += row['returned']
        return _rate(returned_sum, orders_sum)

    recent_rate = window_rate(0)
    prior_rate = window_rate(14)
    weekly_trend = recent_rate - prior_rate

    points = []
    for day_offset in range(1, horizon_days + 1):
        target_date = today + timedelta(days=day_offset)

        occurrences = []
        for back in range(1, WEEKDAY_OCCURRENCES + 1):
            d = target_date - timedelta(weeks=back)
            if d in by_date:
                occurrences.append(by_date[d])

        if occurrences:
            weights = WEEKDAY_WEIGHTS[:len(occurrences)]
            total_weight = sum(weights)
            weighted_orders = sum(o['orders'] * w for o, w in zip(occurrences, weights)) / total_weight
            weighted_returned = sum(o['returned'] * w for o, w in zip(occurrences, weights)) / total_weight
            base_rate = _rate(weighted_returned, weighted_orders)
            daily_rates = [_rate(o['returned'], o['orders']) for o in occurrences if o['orders']]
            rate_std = statistics.pstdev(daily_rates) if len(daily_rates) > 1 else base_rate * 0.3
        else:
            base_rate, rate_std = 0.0, 0.0

        weeks_ahead = (day_offset - 1) // 7 + 1
        trend_adjustment = weekly_trend * weeks_ahead / 7
        predicted_rate = base_rate + trend_adjustment
        predicted_rate = max(0.0, min(100.0, predicted_rate))

        points.append({
            'date': target_date.isoformat(),
            'predicted_rate': round(predicted_rate, 1),
            'rate_low': round(max(0.0, predicted_rate - rate_std), 1),
            'rate_high': round(min(100.0, predicted_rate + rate_std), 1),
        })

    return {'history_days': history_days, 'points': points}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test orders.tests.ReturnsForecastTest -v 2`
Expected: `Ran 4 tests ... OK`

- [ ] **Step 5: Commit**

```bash
git diff backend/orders/tests.py | head -5
git add backend/orders/returns_forecast.py backend/orders/tests.py
git commit -m "feat(returns-forecast): calcul déterministe de prévision de taux de retour

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Permission `stats_returns_forecast_view`

**Files:**
- Modify: `backend/team/models.py`

**Interfaces:**
- Produces: clé `stats_returns_forecast_view` disponible dans `PERMISSION_CATALOG`, `PERMISSION_CATEGORIES`, `DEFAULT_PERMISSIONS['confirmateur']`, `DEFAULT_PERMISSIONS['dropshipper']` (toutes `False` par défaut, même régime que `stats_forecast_view`).

- [ ] **Step 1: Localiser et modifier `PERMISSION_CATALOG`**

Dans `backend/team/models.py`, juste après la ligne :
```python
    ('stats_forecast_view',        'Prévision de ventes'),
```
Ajouter :
```python
    ('stats_returns_forecast_view', 'Prévision de taux de retour'),
```

- [ ] **Step 2: Modifier `PERMISSION_CATEGORIES`**

Juste après la ligne :
```python
    'stats_forecast_view':          ('Ventes & finances', 'Statistiques'),
```
Ajouter :
```python
    'stats_returns_forecast_view':  ('Ventes & finances', 'Statistiques'),
```

- [ ] **Step 3: Modifier les deux `DEFAULT_PERMISSIONS`**

Dans les deux occurrences de la ligne :
```python
        'stats_confirmateurs_view': False, 'stats_wilayas_view': False, 'stats_sources_view': False, 'stats_forecast_view': False,
```
(une dans `DEFAULT_PERMISSIONS['confirmateur']`, une dans `DEFAULT_PERMISSIONS['dropshipper']`), remplacer par :
```python
        'stats_confirmateurs_view': False, 'stats_wilayas_view': False, 'stats_sources_view': False, 'stats_forecast_view': False,
        'stats_returns_forecast_view': False,
```

- [ ] **Step 4: Vérifier qu'aucun test existant ne casse**

Run: `cd backend && venv/Scripts/python manage.py test team -v 1`
Expected: `OK` (le catalogue est généralement testé par comptage ou par présence de clés connues — si un test échoue en comptant un nombre fixe de permissions, l'ajuster au nouveau total, sans changer le comportement testé).

- [ ] **Step 5: Commit**

```bash
git diff backend/team/models.py
git add backend/team/models.py
git commit -m "feat(returns-forecast): permission stats_returns_forecast_view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `ReturnsForecastView` + route

**Files:**
- Modify: `backend/orders/stats_views.py`
- Modify: `backend/orders/urls.py`
- Test: `backend/orders/tests.py`

**Interfaces:**
- Consumes: `returns_forecast.compute_returns_forecast(store, horizon_days)` (Task 1), `stats_returns_forecast_view` (Task 2).
- Produces: `GET /api/orders/stats/returns-forecast/?horizon_days=<7-60>` → `{'history_days': int, 'points': [...]}` ou `400 {'detail': '...'}` si historique insuffisant.

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/orders/tests.py` (réutilise `_make_order` de `ReturnsForecastTest` si dans la même classe, sinon dupliquer le petit helper) :
```python
class ReturnsForecastViewTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.client_ = auth_client(self.owner)

    def _make_order(self, days_ago, status='delivered'):
        from django.utils import timezone
        from orders.models import Order
        o = Order.objects.create(
            store=self.store, first_name='C', last_name='L', phone='0555000001',
            wilaya='Alger', commune='Alger Centre', address='Adr', status=status,
            subtotal=1000, shipping_cost=0, total=1000,
        )
        o.created_at = timezone.now() - timezone.timedelta(days=days_ago)
        o.save(update_fields=['created_at'])
        return o

    def test_insufficient_history_returns_400(self):
        for d in range(5):
            self._make_order(days_ago=d)
        resp = self.client_.get('/api/orders/stats/returns-forecast/')
        self.assertEqual(resp.status_code, 400)

    def test_horizon_clamped(self):
        for d in range(35):
            self._make_order(days_ago=d, status='delivered')
        resp = self.client_.get('/api/orders/stats/returns-forecast/?horizon_days=9999')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['points']), 60)

    def test_confirmateur_without_permission_forbidden(self):
        for d in range(35):
            self._make_order(days_ago=d, status='delivered')
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.get('/api/orders/stats/returns-forecast/')
        self.assertEqual(resp.status_code, 403)

    def test_confirmateur_with_permission_allowed(self):
        from team.models import RolePermission
        for d in range(35):
            self._make_order(days_ago=d, status='delivered')
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        RolePermission.objects.create(store=self.store, role='confirmateur', permission='stats_returns_forecast_view', enabled=True)
        client = auth_client(conf_user)
        resp = client.get('/api/orders/stats/returns-forecast/')
        self.assertEqual(resp.status_code, 200)
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `venv/Scripts/python manage.py test orders.tests.ReturnsForecastViewTest -v 2`
Expected: `404` (route inexistante) sur chaque test.

- [ ] **Step 3: Ajouter `ReturnsForecastView`**

Dans `backend/orders/stats_views.py`, juste après la classe `SalesForecastView` (après son dernier `return Response(result)`), ajouter :
```python
class ReturnsForecastView(StatsPermissionMixin, APIView):
    """Prévision de taux de retour — calcul 100% déterministe
    (returns_forecast.py), aucun appel IA. Horizon ajustable, clampé entre
    7 et 60 jours. returns_forecast.py n'importe rien de ce module, donc pas
    besoin de l'import différé utilisé pour compute_sales_forecast()."""
    permission_key = 'stats_returns_forecast_view'

    def get(self, request):
        from .returns_forecast import compute_returns_forecast
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err

        try:
            horizon_days = int(request.query_params.get('horizon_days', 7))
        except (TypeError, ValueError):
            horizon_days = 7
        horizon_days = max(7, min(60, horizon_days))

        result = compute_returns_forecast(store, horizon_days)
        if result is None:
            return Response({'detail': "Historique insuffisant pour une prévision fiable (30 jours minimum)."}, status=400)
        return Response(result)
```

- [ ] **Step 4: Enregistrer la route**

Dans `backend/orders/urls.py`, ajouter `ReturnsForecastView` à l'import existant (même ligne que `SalesForecastView`) :
```python
    ProductsStatsView, WilayaStatsView, SourceStatsView, GlobalStatsView, SalesForecastView, ReturnsForecastView,
```
Puis juste après `path('stats/forecast/', SalesForecastView.as_view()),` :
```python
    path('stats/returns-forecast/',               ReturnsForecastView.as_view()),
```

- [ ] **Step 5: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test orders.tests.ReturnsForecastViewTest -v 2`
Expected: `Ran 4 tests ... OK`

- [ ] **Step 6: Run toute la suite `orders` + `team` pour vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test orders team -v 1 --noinput`
Expected: `OK`. Si erreur de connexion à `test_mzsolutions` (déjà rencontré plusieurs fois cette session), nettoyer avant de relancer :
```bash
venv/Scripts/python manage.py shell -c "
from django.db import connections
with connections['default'].cursor() as c:
    c.execute(\"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='test_mzsolutions'\")
"
```

- [ ] **Step 7: Commit**

```bash
git diff backend/orders/stats_views.py backend/orders/urls.py
git add backend/orders/stats_views.py backend/orders/urls.py backend/orders/tests.py
git commit -m "feat(returns-forecast): endpoint GET /api/orders/stats/returns-forecast/

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — page `ReturnsForecastPage.jsx`

**Files:**
- Create: `frontend/src/pages/orders/stats/ReturnsForecastPage.jsx`
- Test: `frontend/src/tests/pages/orders/stats/ReturnsForecastPage.test.jsx`

**Interfaces:**
- Consumes: `GET /orders/stats/returns-forecast/?horizon_days=<n>` (Task 3) → `{history_days, points: [{date, predicted_rate, rate_low, rate_high}]}`.

- [ ] **Step 1: Écrire les tests**

Vérifier d'abord s'il existe un test de référence `frontend/src/tests/pages/orders/stats/SalesForecastPage.test.jsx` (probable, vu que la page existe) — le lire pour reprendre exactement le même style de mock. Créer ensuite :

```jsx
// frontend/src/tests/pages/orders/stats/ReturnsForecastPage.test.jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ReturnsForecastPage from '../../../../pages/orders/stats/ReturnsForecastPage'

vi.mock('../../../../api/axios', () => ({
  default: { get: vi.fn() },
}))
import api from '../../../../api/axios'

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

describe('ReturnsForecastPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche le graphique et le tableau quand l\'historique est suffisant', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/orders/stats/returns-forecast/')) {
        return Promise.resolve({ data: { history_days: 45, points: [
          { date: '2026-09-07', predicted_rate: 8.4, rate_low: 5.1, rate_high: 11.7 },
        ] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    render(<MemoryRouter><ReturnsForecastPage /></MemoryRouter>)
    expect(await screen.findByText('2026-09-07')).toBeInTheDocument()
    expect(screen.getByText('8.4')).toBeInTheDocument()
  })

  it('affiche un message explicite si l\'historique est insuffisant', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/orders/stats/returns-forecast/')) {
        return Promise.reject({ response: { data: { detail: 'Historique insuffisant pour une prévision fiable (30 jours minimum).' } } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    render(<MemoryRouter><ReturnsForecastPage /></MemoryRouter>)
    expect(await screen.findByText(/Historique insuffisant/)).toBeInTheDocument()
  })

  it('relance la requête avec le nouvel horizon quand le curseur change', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/orders/stats/returns-forecast/')) {
        return Promise.resolve({ data: { history_days: 45, points: [
          { date: '2026-09-07', predicted_rate: 8.4, rate_low: 5.1, rate_high: 11.7 },
        ] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    render(<MemoryRouter><ReturnsForecastPage /></MemoryRouter>)
    await screen.findByText('2026-09-07')
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '30' } })
    await screen.findByText(/Horizon : 30 jours/)
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('horizon_days=30'))
  })
})
```

⚠️ Adapter les chemins d'import relatifs (`../../../../`) et le mock `AuthContext` si le fichier de référence `SalesForecastPage.test.jsx` (à lire d'abord) utilise une convention différente — copier sa structure exacte plutôt que de deviner.

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd frontend && npm run test -- ReturnsForecastPage`
Expected: échec (le composant n'existe pas encore).

- [ ] **Step 3: Créer `ReturnsForecastPage.jsx`**

```jsx
import { useEffect, useState, useCallback } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import DashboardLayout from '../../../components/DashboardLayout'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { Spinner } from './statsShared'

export default function ReturnsForecastPage() {
  const [horizon, setHorizon] = useState(7)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(() => {
    setLoading(true)
    setError('')
    api.get(`/orders/stats/returns-forecast/?horizon_days=${horizon}`)
      .then(({ data }) => setData(data))
      .catch(e => {
        setData(null)
        setError(e?.response?.data?.detail || 'Impossible de calculer la prévision.')
      })
      .finally(() => setLoading(false))
  }, [horizon])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <DashboardLayout title="Prévision de taux de retour" subtitle="Estimation statistique du taux de retour sur les prochains jours, basée sur votre historique. Ajustez l'horizon avec le curseur.">
      <div className="rounded-xl border p-4 mb-5 text-sm text-app-muted-light" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        Estimation statistique basée sur votre historique — pas une garantie. Un retour prend du temps à se matérialiser : au moins 30 jours d'historique sont nécessaires pour une estimation fiable.
      </div>

      <div className="rounded-xl border p-5 mb-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-app-primary font-medium">Horizon : {horizon} jours</label>
        </div>
        <input type="range" min={7} max={60} value={horizon} role="slider"
          onChange={e => setHorizon(Number(e.target.value))}
          className="w-full accent-violet-600" />
      </div>

      {loading ? <Spinner /> : error ? (
        <p className="text-sm text-red-400 py-8 text-center">{error}</p>
      ) : data ? (
        <>
          <div className="rounded-xl border p-5 mb-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.points}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.dark.border} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="rate_high" stroke="none" fill="#7c3aed" fillOpacity={0.08} name="Taux (haut)" />
                <Area type="monotone" dataKey="predicted_rate" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.2} name="Taux de retour prévu" />
                <Area type="monotone" dataKey="rate_low" stroke="none" fill="transparent" name="Taux (bas)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border overflow-hidden" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <table className="w-full text-sm">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs" style={{ color: theme.dark.muted }}>
                  <th className="px-4 py-3 font-medium">DATE</th>
                  <th className="px-4 py-3 font-medium text-right">TAUX DE RETOUR PRÉVU</th>
                  <th className="px-4 py-3 font-medium text-right">FOURCHETTE</th>
                </tr>
              </thead>
              <tbody>
                {data.points.map(p => (
                  <tr key={p.date} className="border-b last:border-0" style={{ borderColor: theme.dark.borderRowHover }}>
                    <td className="px-4 py-3 text-app-primary">{p.date}</td>
                    <td className="px-4 py-3 text-right text-app-primary font-medium">{p.predicted_rate}%</td>
                    <td className="px-4 py-3 text-right text-app-muted-light">{p.rate_low}% – {p.rate_high}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </DashboardLayout>
  )
}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npm run test -- ReturnsForecastPage`
Expected: tous les tests du fichier passent.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/orders/stats/ReturnsForecastPage.jsx frontend/src/tests/pages/orders/stats/ReturnsForecastPage.test.jsx
git commit -m "feat(returns-forecast): page Prévision de taux de retour (curseur horizon + graphique)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Route + sidebar

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/DashboardLayout.jsx`
- Test: `frontend/src/tests/App.test.jsx` (vérifier qu'il passe déjà sans modification — il échoue si une route `/dashboard/*` est ajoutée sans `perm=`)

**Interfaces:**
- Consumes: `ReturnsForecastPage` (Task 4), permission `stats_returns_forecast_view` (Task 2).

- [ ] **Step 1: Ajouter l'import et la route dans `App.jsx`**

Juste après :
```jsx
import SalesForecastPage from './pages/orders/stats/SalesForecastPage'
```
Ajouter :
```jsx
import ReturnsForecastPage from './pages/orders/stats/ReturnsForecastPage'
```

Juste après :
```jsx
          <Route path="/dashboard/stats/previsions"          element={<PD perm="stats_forecast_view"><SalesForecastPage /></PD>} />
```
Ajouter :
```jsx
          <Route path="/dashboard/stats/previsions-retours"   element={<PD perm="stats_returns_forecast_view"><ReturnsForecastPage /></PD>} />
```

- [ ] **Step 2: Run le test qui vérifie que toute route a bien `perm=`**

Run: `cd frontend && npm run test -- App.test`
Expected: `PASS` (la route ajoutée porte déjà `perm=`, donc aucune modification nécessaire au test lui-même).

- [ ] **Step 3: Ajouter le lien sidebar dans la catégorie IA**

Dans `frontend/src/components/DashboardLayout.jsx`, localiser le bloc IA ajouté lors du chantier précédent (chercher `{/* IA — regroupe toutes les fonctionnalités IA du dashboard`). Modifier sa condition d'affichage et son contenu :

Remplacer :
```jsx
          {(can('ai_assistant_view') || can('stats_forecast_view')) && (
            <div>
              <p className="text-[10px] font-semibold px-2 mb-2 tracking-widest" style={{ color: theme.dark.muted }}>IA</p>
              <ul className="space-y-0.5">
                {can('ai_assistant_view') && (
                  <li>{mainLink('/dashboard/assistant-ia', ICONS.marketing, 'Assistant IA')}</li>
                )}
                {can('stats_forecast_view') && (
                  <li>{mainLink('/dashboard/stats/previsions', ICONS.stats, 'Prévision de ventes')}</li>
                )}
              </ul>
            </div>
          )}
```
par :
```jsx
          {(can('ai_assistant_view') || can('stats_forecast_view') || can('stats_returns_forecast_view')) && (
            <div>
              <p className="text-[10px] font-semibold px-2 mb-2 tracking-widest" style={{ color: theme.dark.muted }}>IA</p>
              <ul className="space-y-0.5">
                {can('ai_assistant_view') && (
                  <li>{mainLink('/dashboard/assistant-ia', ICONS.marketing, 'Assistant IA')}</li>
                )}
                {can('stats_forecast_view') && (
                  <li>{mainLink('/dashboard/stats/previsions', ICONS.stats, 'Prévision de ventes')}</li>
                )}
                {can('stats_returns_forecast_view') && (
                  <li>{mainLink('/dashboard/stats/previsions-retours', ICONS.stats, 'Prévision de taux de retour')}</li>
                )}
              </ul>
            </div>
          )}
```

- [ ] **Step 4: Run les tests concernés**

Run: `npm run test -- DashboardLayout App.test ReturnsForecastPage`
Expected: `PASS`.

- [ ] **Step 5: Run la suite frontend complète pour vérifier l'absence de régression**

Run: `npm run test`
Expected: tous les tests passent (référence avant ce chantier : 402 tests).

- [ ] **Step 6: Commit**

Vérifier d'abord `git diff frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx` pour s'assurer qu'aucun contenu non lié (travail en cours d'un autre terminal) n'est mêlé au diff — isoler via un patch de hunks ciblé (voir méthode déjà utilisée dans ce chantier pour `products/views.py`/`DashboardLayout.jsx`) si nécessaire, plutôt que `git add` du fichier entier sans vérification.

```bash
git add frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx
git commit -m "feat(returns-forecast): route + lien sidebar sous IA

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Étendre la section Assistant IA**

Localiser le paragraphe :
```markdown
**Prévision de rupture de stock (2026-09, sous-chantier de l'analyse prédictive)** — ...
```
Ajouter juste après son paragraphe "Testé via..." :
```markdown
**Prévision de taux de retour (2026-09, dernier sous-chantier de l'analyse prédictive)** — aucun appel IA, calcul déterministe (`orders/returns_forecast.py::compute_returns_forecast()`), même principe de moyenne mobile pondérée par jour de semaine que la prévision de ventes, adapté à un taux : les occurrences sont sommées avant de diviser (pas de moyenne de taux quotidiens bruités). `MIN_HISTORY_DAYS = 30` (plus long que la prévision de ventes — un retour prend du temps à se matérialiser après la création de la commande). Taux toujours clampé [0, 100]. Page `pages/orders/stats/ReturnsForecastPage.jsx`, permission dédiée `stats_returns_forecast_view`, rejoint le menu IA de la sidebar (pas Statistiques) à côté de "Prévision de ventes".

Testé via `manage.py test orders team` (X tests, dont Y dédiés à la prévision de retour : taux pondéré vérifié sur données connues, clamp [0,100], historique insuffisant, clamp d'horizon, gating de permission) + suite frontend complète (Z tests, aucune régression).
```
Remplacer X/Y/Z par les chiffres réels obtenus aux étapes précédentes (`manage.py test orders team` et `npm run test`, comptés à l'exécution).

Avec les 4 sous-chantiers de l'analyse prédictive désormais tous livrés (ventes, rupture de stock, taux de retour), ajouter une phrase de clôture à la fin du dernier paragraphe existant sur ce sujet, ex. : « Les 3 volets de l'analyse prédictive (ventes, rupture de stock, taux de retour) sont désormais tous en production. »

- [ ] **Step 2: Commit**

```bash
git diff CLAUDE.md
git add CLAUDE.md
git commit -m "docs: documente la prévision de taux de retour

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review (fait avant remise du plan)

- **Couverture du spec** : calcul déterministe avec somme-avant-division (Task 1), permission dédiée (Task 2), endpoint + gating (Task 3), page frontend avec curseur/graphique/tableau (Task 4), route + sidebar sous IA (Task 5), doc (Task 6). Tous les points du spec sont couverts. Ventilation par produit/wilaya et alertes automatiques explicitement exclues, non traitées.
- **Placeholders** : aucun TBD/TODO, hormis les chiffres X/Y/Z de la Task 6 qui dépendent du résultat réel des exécutions précédentes (impossible à connaître avant exécution, comportement identique aux plans précédents de ce chantier).
- **Cohérence des types/noms** : `compute_returns_forecast(store, horizon_days) -> {'history_days', 'points': [{'date', 'predicted_rate', 'rate_low', 'rate_high'}]}` (Task 1) consommé à l'identique par `ReturnsForecastView` (Task 3) et par `ReturnsForecastPage.jsx` (Task 4). Route backend `stats/returns-forecast/` (Task 3) et route frontend `/dashboard/stats/previsions-retours` (Task 5) cohérentes avec l'appel `api.get('/orders/stats/returns-forecast/...')` (Task 4). Permission `stats_returns_forecast_view` identique partout (Task 2, 3, 5).
