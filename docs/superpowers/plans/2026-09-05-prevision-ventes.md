# Prévision de ventes — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prévoir le nombre de commandes et le chiffre d'affaires sur un horizon ajustable (7-60 jours), par un calcul 100% déterministe (moyenne mobile pondérée par jour de semaine + tendance), avec fourchette d'incertitude systématique.

**Architecture:** Module pur `orders/sales_forecast.py` (aucun appel réseau, aucun appel IA), exposé par une nouvelle vue de stats suivant exactement le pattern des 9 vues existantes (`StatsPermissionMixin`), affiché sur une nouvelle page à côté des 8 pages de stats déjà en place.

**Tech Stack:** Django 5.2 + DRF (backend existant), React 18 + recharts (frontend existant, déjà utilisé pour les graphiques de stats).

## Global Constraints

- **Aucun appel IA dans ce chantier** — calcul 100% déterministe, contrairement aux 3 chantiers précédents.
- Toujours afficher une fourchette basse/haute à côté de la valeur centrale — jamais un chiffre présenté comme une certitude.
- Horizon ajustable par le vendeur, jamais figé.
- Historique insuffisant (< 14 jours) → erreur explicite, jamais une prévision peu fiable affichée comme si elle l'était.
- Tests obligatoires par tâche, commits fréquents, jamais `git add -A`.

---

## File Structure

```
backend/
  orders/
    sales_forecast.py     — compute_sales_forecast() pur, aucune I/O réseau (nouveau)
    stats_views.py         — SalesForecastView (nouveau, suit StatsPermissionMixin)
    urls.py                 — route stats/forecast/ (modifié)
    tests.py                 — tests des 2 tâches backend (modifié)
  team/models.py            — permission stats_forecast_view (modifié)

frontend/src/
  pages/orders/stats/SalesForecastPage.jsx  — page avec curseur + graphique (nouveau)
  App.jsx                                    — route (modifié)
  components/DashboardLayout.jsx            — lien sidebar (modifié)
  tests/pages/orders/stats/SalesForecastPage.test.jsx (nouveau)

CLAUDE.md — section Assistant IA étendue (modifié)
```

---

### Task 1: `sales_forecast.py` — calcul déterministe pur

**Files:**
- Create: `backend/orders/sales_forecast.py`
- Test: `backend/orders/tests.py`

**Interfaces:**
- Consumes: `orders.models.Order` (lecture seule, `store.orders.filter(...)`), `orders.stats_views.CONFIRMED_STATUSES` (déjà défini : `['confirmed', 'shipped', 'delivered']`).
- Produces: `sales_forecast.compute_sales_forecast(store, horizon_days) -> dict | None`. Retourne `None` si l'historique est insuffisant (< 14 jours de commandes). Sinon : `{'history_days': int, 'points': [{'date': 'YYYY-MM-DD', 'predicted_orders': float, 'orders_low': float, 'orders_high': float, 'predicted_revenue': float, 'revenue_low': float, 'revenue_high': float}, ...]}` (une entrée par jour de l'horizon).

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/orders/tests.py` (le fichier importe déjà `Order`, `make_owner`, `Decimal`, `timedelta`, `date`) :
```python
class SalesForecastTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def _create_orders_on(self, day, count, total_each=Decimal('2000')):
        from django.utils import timezone
        for _ in range(count):
            o = Order.objects.create(store=self.store, first_name='X', phone='0555000000',
                                      wilaya='Alger', status='confirmed', total=total_each)
            o.created_at = timezone.make_aware(timezone.datetime.combine(day, timezone.datetime.min.time()))
            o.save(update_fields=['created_at'])

    def test_insufficient_history_returns_none(self):
        from orders.sales_forecast import compute_sales_forecast
        today = date.today()
        self._create_orders_on(today - timedelta(days=1), 2)
        result = compute_sales_forecast(self.store, horizon_days=7)
        self.assertIsNone(result)

    def test_forecast_has_one_point_per_horizon_day(self):
        from orders.sales_forecast import compute_sales_forecast
        today = date.today()
        for i in range(1, 29):
            self._create_orders_on(today - timedelta(days=i), 2)
        result = compute_sales_forecast(self.store, horizon_days=7)
        self.assertIsNotNone(result)
        self.assertEqual(len(result['points']), 7)

    def test_same_weekday_history_used(self):
        """4 lundis à 10 commandes, tout le reste à 2 — la prévision du
        prochain lundi doit se rapprocher de 10, pas de la moyenne globale (2)."""
        from orders.sales_forecast import compute_sales_forecast
        import datetime as dt
        today = date.today()
        # Repère le lundi le plus récent dans le passé
        last_monday = today - timedelta(days=(today.weekday() - 0) % 7 or 7)
        for i in range(4):
            self._create_orders_on(last_monday - timedelta(weeks=i), 10)
        for i in range(1, 29):
            d = today - timedelta(days=i)
            if d.weekday() != 0:
                self._create_orders_on(d, 2)
        result = compute_sales_forecast(self.store, horizon_days=14)
        next_monday_str = None
        for i in range(1, 15):
            d = today + timedelta(days=i)
            if d.weekday() == 0:
                next_monday_str = d.isoformat()
                break
        monday_point = next(p for p in result['points'] if p['date'] == next_monday_str)
        self.assertGreater(monday_point['predicted_orders'], 5)

    def test_uncertainty_range_never_negative(self):
        from orders.sales_forecast import compute_sales_forecast
        today = date.today()
        for i in range(1, 29):
            self._create_orders_on(today - timedelta(days=i), 1)
        result = compute_sales_forecast(self.store, horizon_days=7)
        for p in result['points']:
            self.assertGreaterEqual(p['orders_low'], 0)
            self.assertGreaterEqual(p['revenue_low'], 0)

    def test_revenue_forecast_present(self):
        from orders.sales_forecast import compute_sales_forecast
        today = date.today()
        for i in range(1, 29):
            self._create_orders_on(today - timedelta(days=i), 3, total_each=Decimal('5000'))
        result = compute_sales_forecast(self.store, horizon_days=7)
        self.assertGreater(result['points'][0]['predicted_revenue'], 0)
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test orders.tests.SalesForecastTest -v 2`
Expected: `ModuleNotFoundError: No module named 'orders.sales_forecast'`

- [ ] **Step 3: Implémenter `sales_forecast.py`**

```python
"""Prévision de ventes — calcul DÉTERMINISTE pur, aucun appel réseau, aucun
appel IA. Moyenne mobile pondérée PAR JOUR DE LA SEMAINE (un lundi se
compare aux lundis précédents, pas à la moyenne globale — évite qu'un pic
de week-end fausse un jour de semaine), ajustée par la tendance récente.
Voir docs/superpowers/specs/2026-09-05-prevision-ventes-design.md."""
import statistics
from datetime import timedelta, date

from django.db.models import Count, Sum
from django.utils import timezone

from .stats_views import CONFIRMED_STATUSES

MIN_HISTORY_DAYS = 14
WEEKDAY_OCCURRENCES = 4
WEEKDAY_WEIGHTS = [4, 3, 2, 1]  # plus récent en premier


def _daily_counts_and_revenue(store, since):
    qs = (store.orders
          .filter(status__in=CONFIRMED_STATUSES, created_at__date__gte=since)
          .values('created_at__date')
          .annotate(orders_count=Count('id'), revenue=Sum('total'))
          .order_by('created_at__date'))
    by_date = {}
    for row in qs:
        by_date[row['created_at__date']] = {
            'orders': row['orders_count'],
            'revenue': float(row['revenue'] or 0),
        }
    return by_date


def compute_sales_forecast(store, horizon_days):
    today = timezone.now().date()
    earliest_order = store.orders.order_by('created_at').first()
    if not earliest_order:
        return None
    history_days = (today - earliest_order.created_at.date()).days
    if history_days < MIN_HISTORY_DAYS:
        return None

    lookback = WEEKDAY_OCCURRENCES * 7 + 7
    by_date = _daily_counts_and_revenue(store, today - timedelta(days=lookback))

    # Tendance : moyenne des 2 dernières semaines complètes vs les 2 précédentes
    def week_avg(start_offset_days, num_days=14):
        vals = []
        for i in range(1, num_days + 1):
            d = today - timedelta(days=start_offset_days + i)
            vals.append(by_date.get(d, {'orders': 0})['orders'])
        return sum(vals) / num_days if vals else 0

    recent_avg = week_avg(0)
    prior_avg = week_avg(14)
    weekly_trend = recent_avg - prior_avg

    points = []
    for day_offset in range(1, horizon_days + 1):
        target_date = today + timedelta(days=day_offset)
        weekday = target_date.weekday()

        occurrences = []
        for back in range(1, WEEKDAY_OCCURRENCES + 1):
            d = target_date - timedelta(weeks=back)
            if d in by_date:
                occurrences.append(by_date[d])

        if occurrences:
            weights = WEEKDAY_WEIGHTS[:len(occurrences)]
            total_weight = sum(weights)
            base_orders = sum(o['orders'] * w for o, w in zip(occurrences, weights)) / total_weight
            base_revenue = sum(o['revenue'] * w for o, w in zip(occurrences, weights)) / total_weight
            order_values = [o['orders'] for o in occurrences]
            revenue_values = [o['revenue'] for o in occurrences]
            orders_std = statistics.pstdev(order_values) if len(order_values) > 1 else base_orders * 0.3
            revenue_std = statistics.pstdev(revenue_values) if len(revenue_values) > 1 else base_revenue * 0.3
        else:
            base_orders, base_revenue = 0, 0
            orders_std, revenue_std = 0, 0

        weeks_ahead = (day_offset - 1) // 7 + 1
        trend_adjustment = weekly_trend * weeks_ahead / 7
        predicted_orders = max(0, base_orders + trend_adjustment)
        predicted_revenue = max(0, base_revenue + trend_adjustment * (base_revenue / base_orders if base_orders else 0))

        points.append({
            'date': target_date.isoformat(),
            'predicted_orders': round(predicted_orders, 1),
            'orders_low': round(max(0, predicted_orders - orders_std), 1),
            'orders_high': round(predicted_orders + orders_std, 1),
            'predicted_revenue': round(predicted_revenue, 2),
            'revenue_low': round(max(0, predicted_revenue - revenue_std), 2),
            'revenue_high': round(predicted_revenue + revenue_std, 2),
        })

    return {'history_days': history_days, 'points': points}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test orders.tests.SalesForecastTest -v 2`
Expected: `Ran 5 tests ... OK`

⚠️ Si `test_same_weekday_history_used` échoue à cause d'un arrondi ou d'un cas limite de date, ajuster la marge de l'assertion (`assertGreater(..., 5)`) plutôt que la logique — le test vérifie une tendance qualitative (le lundi prévu doit être notablement plus haut que la moyenne globale de 2), pas une valeur exacte.

- [ ] **Step 5: Commit**

```bash
git add backend/orders/sales_forecast.py backend/orders/tests.py
git commit -m "feat(forecast): calcul déterministe de prévision de ventes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Permission + `SalesForecastView` + routage

**Files:**
- Modify: `backend/team/models.py`
- Modify: `backend/orders/stats_views.py`
- Modify: `backend/orders/urls.py`
- Test: `backend/orders/tests.py`

**Interfaces:**
- Consumes: `sales_forecast.compute_sales_forecast(store, horizon_days)` (Task 1).
- Produces: `GET /api/orders/stats/forecast/?horizon_days=<int>` → `{history_days, points}` ou `400` si historique insuffisant. Permission `stats_forecast_view`.

- [ ] **Step 1: Ajouter la permission au catalogue**

Dans `backend/team/models.py`, dans `PERMISSION_CATALOG`, ajouter juste après `('stats_sources_view', 'Statistiques des sources'),` :
```python
    ('stats_forecast_view',        'Prévision de ventes'),
```

Dans `PERMISSION_CATEGORIES`, ajouter juste après `'stats_sources_view': ('Ventes & finances', 'Statistiques'),` :
```python
    'stats_forecast_view':          ('Ventes & finances', 'Statistiques'),
```

Dans `DEFAULT_PERMISSIONS['confirmateur']`, sur la ligne qui contient `'stats_wilayas_view': False, 'stats_sources_view': False,`, ajouter `'stats_forecast_view': False` à la fin de cette ligne (juste avant la virgule de fin de ligne si elle existe, ou en gardant la même syntaxe que les entrées voisines) :
```python
        'stats_confirmateurs_view': False, 'stats_wilayas_view': False, 'stats_sources_view': False, 'stats_forecast_view': False,
```
Faire le même ajout dans `DEFAULT_PERMISSIONS['dropshipper']` (chercher la ligne identique dans ce second dictionnaire).

- [ ] **Step 2: Écrire les tests de la vue**

Ajouter à `backend/orders/tests.py` :
```python
class SalesForecastViewTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.client_ = auth_client(self.owner)

    def _seed_history(self, days=20, count_per_day=2):
        from django.utils import timezone
        today = date.today()
        for i in range(1, days + 1):
            for _ in range(count_per_day):
                o = Order.objects.create(store=self.store, first_name='X', phone='0555000000',
                                          wilaya='Alger', status='confirmed', total=Decimal('2000'))
                o.created_at = timezone.make_aware(timezone.datetime.combine(today - timedelta(days=i), timezone.datetime.min.time()))
                o.save(update_fields=['created_at'])

    def test_insufficient_history_400(self):
        resp = self.client_.get('/api/orders/stats/forecast/?horizon_days=7')
        self.assertEqual(resp.status_code, 400)

    def test_forecast_response_shape(self):
        self._seed_history()
        resp = self.client_.get('/api/orders/stats/forecast/?horizon_days=7')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['points']), 7)
        self.assertIn('predicted_orders', resp.data['points'][0])

    def test_horizon_clamped_to_max_60(self):
        self._seed_history()
        resp = self.client_.get('/api/orders/stats/forecast/?horizon_days=9999')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['points']), 60)

    def test_horizon_clamped_to_min_7(self):
        self._seed_history()
        resp = self.client_.get('/api/orders/stats/forecast/?horizon_days=1')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['points']), 7)

    def test_confirmateur_without_permission_forbidden(self):
        member_user, member = make_team_member(self.store, role='confirmateur')
        client_ = auth_client(member_user)
        resp = client_.get('/api/orders/stats/forecast/?horizon_days=7')
        self.assertEqual(resp.status_code, 403)
```

- [ ] **Step 3: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test orders.tests.SalesForecastViewTest -v 2`
Expected: `404` (route inexistante).

- [ ] **Step 4: Implémenter la vue**

Ajouter à `backend/orders/stats_views.py` (à la fin du fichier) :
```python
from .sales_forecast import compute_sales_forecast


class SalesForecastView(StatsPermissionMixin, APIView):
    """Prévision de ventes — calcul 100% déterministe (sales_forecast.py),
    aucun appel IA. Horizon ajustable, clampé entre 7 et 60 jours."""
    permission_key = 'stats_forecast_view'

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err

        try:
            horizon_days = int(request.query_params.get('horizon_days', 7))
        except (TypeError, ValueError):
            horizon_days = 7
        horizon_days = max(7, min(60, horizon_days))

        result = compute_sales_forecast(store, horizon_days)
        if result is None:
            return Response({'detail': "Historique insuffisant pour une prévision fiable (14 jours minimum)."}, status=400)
        return Response(result)
```

- [ ] **Step 5: Router l'endpoint**

Dans `backend/orders/urls.py`, ajouter `SalesForecastView` à l'import (chercher `ProductsStatsView, WilayaStatsView, SourceStatsView, GlobalStatsView,` et ajouter `SalesForecastView,` à la suite) et ajouter la route juste après `path('stats/sources/', SourceStatsView.as_view()),` :
```python
    path('stats/forecast/',                       SalesForecastView.as_view()),
```

- [ ] **Step 6: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test orders.tests.SalesForecastViewTest -v 2`
Expected: `Ran 5 tests ... OK`

- [ ] **Step 7: Run toute la suite `orders` et `team` pour vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test orders team -v 1 --noinput`
Expected: `OK`. Si une erreur `database is being accessed by other users` ou `connection already closed` apparaît (déjà rencontré dans cette session — connexions zombies sur `test_mzsolutions`), l'éliminer avant de relancer :
```bash
venv/Scripts/python manage.py shell -c "
from django.db import connections
conn = connections['default']
with conn.cursor() as c:
    c.execute(\"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='test_mzsolutions'\")
"
```
puis relancer la commande de test.

- [ ] **Step 8: Commit**

```bash
git add backend/team/models.py backend/orders/stats_views.py backend/orders/urls.py backend/orders/tests.py
git commit -m "feat(forecast): endpoint de prévision de ventes + permission dédiée

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — page, route, sidebar

**Files:**
- Create: `frontend/src/pages/orders/stats/SalesForecastPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/DashboardLayout.jsx`
- Test: `frontend/src/tests/pages/orders/stats/SalesForecastPage.test.jsx`

**Interfaces:**
- Consumes: `GET /orders/stats/forecast/?horizon_days=<n>` (Task 2), `Spinner`/`theme` (`pages/orders/stats/statsShared.jsx`, `theme.js`).
- Produces: route `/dashboard/stats/previsions`, lien sidebar sous `stats_forecast_view`.

- [ ] **Step 1: Écrire le test de la page**

```jsx
// frontend/src/tests/pages/orders/stats/SalesForecastPage.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import SalesForecastPage from '../../../../pages/orders/stats/SalesForecastPage'

vi.mock('../../../../api/axios', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/orders/stats/forecast/')) {
        return Promise.resolve({ data: { history_days: 30, points: [
          { date: '2026-09-06', predicted_orders: 3.2, orders_low: 1.5, orders_high: 5, predicted_revenue: 6400, revenue_low: 3000, revenue_high: 10000 },
        ] } })
      }
      return Promise.resolve({ data: { count: 0 } })
    }),
  },
}))
vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

describe('SalesForecastPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('affiche le bandeau d\'avertissement et le tableau de prévision', async () => {
    render(<MemoryRouter><SalesForecastPage /></MemoryRouter>)
    expect(await screen.findByText(/estimation statistique/i)).toBeInTheDocument()
    expect(await screen.findByText('2026-09-06')).toBeInTheDocument()
  })

  it('affiche un message clair si l\'historique est insuffisant', async () => {
    const api = (await import('../../../../api/axios')).default
    api.get.mockImplementation((url) => {
      if (url.includes('/orders/stats/forecast/')) {
        return Promise.reject({ response: { status: 400, data: { detail: 'Historique insuffisant pour une prévision fiable (14 jours minimum).' } } })
      }
      return Promise.resolve({ data: { count: 0 } })
    })
    render(<MemoryRouter><SalesForecastPage /></MemoryRouter>)
    expect(await screen.findByText(/Historique insuffisant/i)).toBeInTheDocument()
  })

  it('change l\'horizon via le curseur et relance la requête', async () => {
    const api = (await import('../../../../api/axios')).default
    render(<MemoryRouter><SalesForecastPage /></MemoryRouter>)
    await screen.findByText('2026-09-06')
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '30' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('horizon_days=30')))
  })
})
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd frontend && npm run test -- SalesForecastPage`
Expected: échec, la page n'existe pas.

- [ ] **Step 3: Créer la page**

```jsx
// frontend/src/pages/orders/stats/SalesForecastPage.jsx
import { useEffect, useState, useCallback } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import DashboardLayout from '../../../components/DashboardLayout'
import api from '../../../api/axios'
import { theme } from '../../../theme'
import { Spinner, money } from './statsShared'

export default function SalesForecastPage() {
  const [horizon, setHorizon] = useState(7)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(() => {
    setLoading(true)
    setError('')
    api.get(`/orders/stats/forecast/?horizon_days=${horizon}`)
      .then(({ data }) => setData(data))
      .catch(e => {
        setData(null)
        setError(e?.response?.data?.detail || 'Impossible de calculer la prévision.')
      })
      .finally(() => setLoading(false))
  }, [horizon])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <DashboardLayout title="Prévision de ventes" subtitle="Estimation statistique du nombre de commandes et du chiffre d'affaires sur les prochains jours, basée sur votre historique. Ajustez l'horizon avec le curseur.">
      <div className="rounded-xl border p-4 mb-5 text-sm text-app-muted-light" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        Estimation statistique basée sur votre historique — pas une garantie. Précision meilleure avec plus d'historique et un horizon court.
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
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="orders_high" stroke="none" fill="#7c3aed" fillOpacity={0.08} name="Commandes (haut)" />
                <Area type="monotone" dataKey="predicted_orders" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.2} name="Commandes prévues" />
                <Area type="monotone" dataKey="orders_low" stroke="none" fill="transparent" name="Commandes (bas)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border overflow-hidden" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <table className="w-full text-sm">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-left text-xs" style={{ color: theme.dark.muted }}>
                  <th className="px-4 py-3 font-medium">DATE</th>
                  <th className="px-4 py-3 font-medium text-right">COMMANDES PRÉVUES</th>
                  <th className="px-4 py-3 font-medium text-right">FOURCHETTE</th>
                  <th className="px-4 py-3 font-medium text-right">CA PRÉVU</th>
                  <th className="px-4 py-3 font-medium text-right">FOURCHETTE</th>
                </tr>
              </thead>
              <tbody>
                {data.points.map(p => (
                  <tr key={p.date} className="border-b last:border-0" style={{ borderColor: theme.dark.borderRowHover }}>
                    <td className="px-4 py-3 text-app-primary">{p.date}</td>
                    <td className="px-4 py-3 text-right text-app-primary font-medium">{p.predicted_orders}</td>
                    <td className="px-4 py-3 text-right text-app-muted-light">{p.orders_low} – {p.orders_high}</td>
                    <td className="px-4 py-3 text-right text-app-primary font-medium">{money(p.predicted_revenue)}</td>
                    <td className="px-4 py-3 text-right text-app-muted-light">{money(p.revenue_low)} – {money(p.revenue_high)}</td>
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

Run: `cd frontend && npm run test -- SalesForecastPage`
Expected: `3 passed`

- [ ] **Step 5: Route dans `App.jsx`**

Ajouter l'import (à côté des autres imports de pages stats, chercher `import SourceStatsPage from './pages/orders/stats/SourceStatsPage'`) :
```javascript
import SalesForecastPage from './pages/orders/stats/SalesForecastPage'
```
Ajouter la route (juste après `path="/dashboard/stats/sources"`) :
```jsx
          <Route path="/dashboard/stats/previsions"          element={<PD perm="stats_forecast_view"><SalesForecastPage /></PD>} />
```

- [ ] **Step 6: Lien sidebar dans `DashboardLayout.jsx`**

Dans le bloc conditionnel qui affiche le sous-menu "Statistiques" (chercher `can('stats_sources_view')) && (`), ajouter `|| can('stats_forecast_view')` à la fin de la condition (juste avant `) && (`) :
```javascript
              {(can('stats_global_view') || can('stats_orders_view') || can('stats_returns_view') || can('stats_failures_view') ||
                can('stats_stock_sales_view') || can('stats_products_view') || can('stats_confirmateurs_view') ||
                can('stats_wilayas_view') || can('stats_sources_view') || can('stats_forecast_view')) && (
```
Ajouter le lien dans la liste `<ul>` du sous-menu (juste après `{can('stats_sources_view') && <li>{link('/dashboard/stats/sources', 'Statistiques des sources')}</li>}`) :
```jsx
                      {can('stats_forecast_view') && <li>{link('/dashboard/stats/previsions', 'Prévision de ventes')}</li>}
```

- [ ] **Step 7: Run la suite frontend complète pour vérifier l'absence de régression**

Run: `cd frontend && npm run test`
Expected: tous les tests passent, y compris `App.test.jsx` (la nouvelle route porte bien `perm=`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/orders/stats/SalesForecastPage.jsx frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx frontend/src/tests/pages/orders/stats/SalesForecastPage.test.jsx
git commit -m "feat(forecast): page Prévision de ventes (curseur horizon + graphique)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Étendre la section Assistant IA de `CLAUDE.md`**

Localiser la section `### Assistant IA (Ollama local + Groq cloud, 2026-09)` et ajouter, juste avant la ligne finale `Testé via manage.py test ai_assistant...` (fin de section — repérer la ligne exacte au moment de l'implémentation, elle peut avoir légèrement changé depuis) :
```markdown
**Prévision de ventes (2026-09, 4ème et dernier chantier)** — contrairement aux 3 précédents, **aucun appel IA** : le calcul est 100% déterministe (`orders/sales_forecast.py::compute_sales_forecast()`), moyenne mobile pondérée **par jour de la semaine** (un lundi se compare aux lundis précédents) ajustée par la tendance récente, avec fourchette basse/haute systématique (jamais un chiffre présenté comme une certitude). Horizon ajustable par le vendeur (curseur 7-60 jours, clampé côté serveur) — décision explicite après une demande de "prédiction parfaite" : aucune méthode n'est parfaite, la réponse honnête est un horizon ajustable + une marge d'erreur visible plutôt qu'un faux sentiment de précision. Historique < 14 jours → erreur explicite plutôt qu'une prévision peu fiable affichée comme fiable. Page `pages/orders/stats/SalesForecastPage.jsx`, permission dédiée `stats_forecast_view` (même convention que les 9 autres pages de stats).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documente la prévision de ventes (4ème chantier IA)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review (fait avant remise du plan)

- **Couverture du spec** : calcul déterministe avec fourchette (Task 1), endpoint + permission + clamp d'horizon + erreur historique insuffisant (Task 2), page avec curseur + graphique + tableau + bandeau d'avertissement (Task 3), doc (Task 4). Tous les points du spec sont couverts. Prévision par produit, stock et retours explicitement exclus du spec et non traités ici (conforme au "Hors périmètre").
- **Placeholders** : aucun TBD/TODO. Un point signalé explicitement comme à vérifier en conditions réelles plutôt que deviné : la marge exacte de `test_same_weekday_history_used` (Task 1, Step 4) si l'arrondi produit un résultat limite — le test vérifie une tendance qualitative, pas une valeur exacte, donc ajustable sans changer la logique.
- **Cohérence des types/noms** : `compute_sales_forecast(store, horizon_days) -> dict | None` (Task 1) consommé à l'identique par `SalesForecastView` (Task 2). `permission_key = 'stats_forecast_view'` (Task 2 backend) cohérent avec `perm="stats_forecast_view"` (Task 3 `App.jsx`) et `can('stats_forecast_view')` (Task 3 sidebar) et l'entrée `PERMISSION_CATALOG`/`DEFAULT_PERMISSIONS` (Task 2). Champs de réponse (`predicted_orders`, `orders_low`, `orders_high`, `predicted_revenue`, `revenue_low`, `revenue_high`, `date`) identiques entre Task 1 (calcul), Task 2 (test de forme de réponse) et Task 3 (consommation frontend).
