# Admin plateforme — Phase 1 (Fondations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deux niveaux d'accès (admin / superadmin) pour l'espace `/platform-admin`, un endpoint `overview` de KPI et une vue d'ensemble avec layout et composants admin partagés.

**Architecture:** On étend l'app `platform_admin` et l'espace `/platform-admin/*` existants (spec `docs/superpowers/specs/2026-10-04-admin-plateforme-design.md`). Le niveau est porté par `accounts.User` (`is_platform_admin` = admin, `is_platform_superadmin` = superadmin, qui implique admin). Les KPI sont agrégés côté serveur dans un module dédié `platform_admin/overview.py`.

**Tech Stack:** Django 5.2 + DRF, PostgreSQL, React 18 + Vite, Tailwind v4 (zéro CSS custom, `theme.js`), Recharts, Vitest + Testing Library.

## Global Constraints

- Frontend : Tailwind uniquement, couleurs via `theme.js`, jamais de `<select>` natif (utiliser `components/Select.jsx`).
- Le niveau d'accès est contrôlé **côté serveur** sur chaque route (le frontend masque seulement les liens) ; un test d'intégration par route sensible.
- Suspension d'une boutique = `Store.is_active=False` ; son application effective est livrée en phase 2, la phase 1 ne fait que la compter.
- L'historique des revenus ne démarre qu'avec `stores.SubscriptionPayment` (aucune donnée Chargily).
- Documentation : mettre à jour `CLAUDE.md` en fin de phase. Pas de commit/push sans validation explicite de l'utilisateur.
- Tests backend : `cd backend && venv/Scripts/python manage.py test platform_admin --noinput` ; frontend : `cd frontend && npx vitest run <fichier>`.

## File Structure

| Fichier | Responsabilité |
| --- | --- |
| `backend/accounts/models.py` (modif) | champ `is_platform_superadmin` |
| `backend/accounts/migrations/00NN_platform_superadmin.py` (créé) | champ + migration de données |
| `backend/accounts/serializers.py` (modif) | `platform_level` dans `/auth/me/` |
| `backend/platform_admin/permissions.py` (modif) | `is_platform_admin` (admin OU superadmin), `is_platform_superadmin` |
| `backend/platform_admin/views.py` (modif) | routes sensibles → superadmin |
| `backend/platform_admin/overview.py` (créé) | `compute_overview()` — agrégats purs, testables |
| `backend/platform_admin/views_overview.py` (créé) | `PlatformOverviewView` |
| `backend/platform_admin/urls.py` (modif) | route `overview/` |
| `backend/platform_admin/tests.py` (modif) + `test_overview.py` (créé) | tests |
| `frontend/src/components/admin/AdminPageHeader.jsx`, `AdminState.jsx`, `AdminList.jsx` (créés) | composants partagés |
| `frontend/src/components/PlatformAdminRoute.jsx` (modif) | garde `PSA` (superadmin) |
| `frontend/src/pages/platform-admin/PlatformAdminLayout.jsx` (modif) | groupes, badges, tiroir mobile, liens par niveau |
| `frontend/src/pages/platform-admin/PlatformAdminOverviewPage.jsx` (créé) | vue d'ensemble |
| `frontend/src/App.jsx` (modif) | route index → `apercu` |
| `frontend/src/tests/...` (créés) | tests front |

---

### Task 1: Niveaux d'accès (modèle, helpers, `/auth/me/`)

**Files:**
- Modify: `backend/accounts/models.py:37`, `backend/accounts/serializers.py:29`, `backend/accounts/admin.py:9-13`, `backend/platform_admin/permissions.py`
- Create: `backend/accounts/migrations/00NN_platform_superadmin.py` (généré par `makemigrations`, puis ajout de la migration de données)
- Test: `backend/platform_admin/tests.py`

**Interfaces:**
- Produces: `permissions.is_platform_admin(request) -> bool` (admin OU superadmin), `permissions.is_platform_superadmin(request) -> bool`, `User.is_platform_superadmin`, champ API `platform_level: 'superadmin'|'admin'|None`.

- [ ] **Step 1: Write the failing test** (ajouter dans `platform_admin/tests.py`)

```python
from django.test import RequestFactory
from rest_framework.test import force_authenticate
from .permissions import is_platform_admin, is_platform_superadmin


def make_user(email, **flags):
    u = User.objects.create_user(email=email, password='TestPass123', first_name='A', last_name='B',
                                 is_active=True, is_email_verified=True)
    for k, v in flags.items():
        setattr(u, k, v)
    u.save()
    return u


class PlatformLevelTests(TestCase):
    def _req(self, user):
        req = RequestFactory().get('/')
        req.user = user
        return req

    def test_admin_level_is_not_superadmin(self):
        u = make_user('a1@test.com', is_platform_admin=True)
        self.assertTrue(is_platform_admin(self._req(u)))
        self.assertFalse(is_platform_superadmin(self._req(u)))

    def test_superadmin_implies_admin(self):
        u = make_user('a2@test.com', is_platform_superadmin=True)
        self.assertTrue(is_platform_admin(self._req(u)))
        self.assertTrue(is_platform_superadmin(self._req(u)))

    def test_regular_user_has_neither(self):
        u = make_user('a3@test.com')
        self.assertFalse(is_platform_admin(self._req(u)))
        self.assertFalse(is_platform_superadmin(self._req(u)))

    def test_me_exposes_platform_level(self):
        for flags, expected in [({'is_platform_superadmin': True}, 'superadmin'), ({'is_platform_admin': True}, 'admin'), ({}, None)]:
            u = make_user(f'lv{len(flags)}{expected}@test.com', **flags)
            resp = auth_client(u).get('/api/auth/me/')
            self.assertEqual(resp.data['platform_level'], expected)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && venv/Scripts/python manage.py test platform_admin.tests.PlatformLevelTests --noinput`
Expected: FAIL (`ImportError: cannot import name 'is_platform_superadmin'` / unknown field).

- [ ] **Step 3: Implement**

`accounts/models.py` — après `is_platform_admin` :
```python
    # Niveau supérieur de l'espace /platform-admin (prix, réglages, remboursements,
    # gestion des admins). Implique is_platform_admin côté helpers.
    is_platform_superadmin = models.BooleanField(default=False)
```
`platform_admin/permissions.py` — remplacer `is_platform_admin` :
```python
def is_platform_admin(request):
    """Niveau « admin » de l'espace /platform-admin : un admin OU un superadmin."""
    user = getattr(request, 'user', None)
    return bool(user and user.is_authenticated and (
        getattr(user, 'is_platform_admin', False) or getattr(user, 'is_platform_superadmin', False)))


def is_platform_superadmin(request):
    """Niveau « superadmin » : réglages, prix, remboursements, gestion des admins."""
    user = getattr(request, 'user', None)
    return bool(user and user.is_authenticated and getattr(user, 'is_platform_superadmin', False))
```
`accounts/serializers.py` — ajouter `platform_level = serializers.SerializerMethodField()`, `'platform_level'` dans `Meta.fields`, et la méthode :
```python
    def get_platform_level(self, obj):
        if obj.is_platform_superadmin:
            return 'superadmin'
        return 'admin' if obj.is_platform_admin else None
```
`accounts/admin.py` : ajouter `'is_platform_superadmin'` dans `list_display` et dans le fieldset Permissions.

Puis : `venv/Scripts/python manage.py makemigrations accounts -n platform_superadmin` et **ajouter** à la migration générée :
```python
def promote_existing_admins(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    User.objects.filter(is_platform_admin=True).update(is_platform_superadmin=True)

# à la fin de operations :
migrations.RunPython(promote_existing_admins, migrations.RunPython.noop),
```

- [ ] **Step 4: Run to verify it passes**

Run: `venv/Scripts/python manage.py test platform_admin.tests.PlatformLevelTests --noinput`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit** (uniquement après validation de l'utilisateur)

```bash
git add backend/accounts backend/platform_admin
git commit -m "feat(admin): niveaux admin/superadmin (modèle, helpers, platform_level)"
```

---

### Task 2: Routes sensibles réservées au superadmin

**Files:**
- Modify: `backend/platform_admin/views.py` (imports ligne 21 ; contrôles aux lignes ~115, 149, 250, 267, 282, 297, 357, 380, 392, et écritures de `PlatformAssignmentPermissionsView` ~584/598)
- Test: `backend/platform_admin/tests.py`

**Interfaces:**
- Consumes: `is_platform_superadmin(request)` (Task 1).
- Produces: toute écriture de service/confirmateurs/assignations renvoie 403 à un simple admin ; lectures (liste boutiques, commandes, produits, enter, audit-logs, liste confirmateurs/assignations) restent ouvertes aux deux niveaux.

- [ ] **Step 1: Write the failing test**

```python
class SuperadminOnlyRoutesTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.admin = make_user('lvl-admin@test.com', is_platform_admin=True)
        self.superadmin = make_user('lvl-super@test.com', is_platform_superadmin=True)

    def test_admin_can_read_stores(self):
        self.assertEqual(auth_client(self.admin).get('/api/platform-admin/stores/').status_code, 200)

    def test_admin_cannot_toggle_service(self):
        resp = auth_client(self.admin).post(f'/api/platform-admin/stores/{self.store.id}/toggle/', {'is_active': True}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_superadmin_can_toggle_service(self):
        resp = auth_client(self.superadmin).post(f'/api/platform-admin/stores/{self.store.id}/toggle/', {'is_active': True}, format='json')
        self.assertEqual(resp.status_code, 200)

    def test_admin_cannot_bulk_toggle(self):
        resp = auth_client(self.admin).post('/api/platform-admin/stores/bulk-toggle/', {'store_ids': [self.store.id], 'is_active': True}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_admin_cannot_invite_confirmateur(self):
        resp = auth_client(self.admin).post('/api/platform-admin/confirmateurs/', {'first_name': 'X', 'last_name': 'Y', 'email': 'x@test.com'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_admin_can_list_confirmateurs(self):
        self.assertEqual(auth_client(self.admin).get('/api/platform-admin/confirmateurs/').status_code, 200)
```

- [ ] **Step 2: Run to verify it fails**

Run: `venv/Scripts/python manage.py test platform_admin.tests.SuperadminOnlyRoutesTests --noinput`
Expected: FAIL (`test_admin_cannot_*` renvoient 200/201 au lieu de 403).

- [ ] **Step 3: Implement**

Dans `views.py` : importer `is_platform_superadmin` à côté de `is_platform_admin`, puis remplacer `if not is_platform_admin(request):` par `if not is_platform_superadmin(request):` **uniquement** dans : `PlatformStoreToggleView.post`, `PlatformStoreBulkToggleView.post`, `PlatformConfirmateurListCreateView.post`, `PlatformConfirmateurDetailView.put` et `.delete`, `PlatformConfirmateurResendInviteView.post`, `PlatformConfirmateurAssignmentListCreateView.post`, `PlatformConfirmateurAssignmentDetailView.put` et `.delete`, et les méthodes `post`/`delete` de `PlatformAssignmentPermissionsView` (sa lecture `get` reste admin). Les autres contrôles restent `is_platform_admin`. Ajuster `_forbidden()` : message « Accès réservé au superadmin. » (inchangé, déjà correct).

- [ ] **Step 4: Run to verify it passes** — suite complète de l'app :

Run: `venv/Scripts/python manage.py test platform_admin --noinput`
Expected: PASS. ⚠️ Les tests existants utilisent `make_platform_admin()` (flag `is_platform_admin` seul) pour des écritures : les faire passer par un superadmin en ajoutant `user.is_platform_superadmin = True` dans cette fonction helper (et `update_fields=['is_platform_admin', 'is_platform_superadmin']`).

- [ ] **Step 5: Commit**

```bash
git add backend/platform_admin
git commit -m "feat(admin): écritures sensibles réservées au superadmin"
```

---

### Task 3: Endpoint `overview` (KPI, séries, alertes)

**Files:**
- Create: `backend/platform_admin/overview.py`, `backend/platform_admin/views_overview.py`, `backend/platform_admin/test_overview.py`
- Modify: `backend/platform_admin/urls.py`

**Interfaces:**
- Produces: `compute_overview(now=None) -> dict` avec les clés `stores` (`total, trial, subscribed, expired, suspended`), `revenue` (`this_month, pending, failed, series[12]`), `activity` (`orders_30d, orders_series[12], new_stores_series[12]`), `alerts` (`trials_expiring, quota_high, payments_stuck`, chacune `{count, store_ids|payment_ids}`). Série = liste de 12 `{month: 'YYYY-MM', value: number}` du plus ancien au plus récent. Route : `GET /api/platform-admin/overview/` (niveau admin).

- [ ] **Step 1: Write the failing test** (`test_overview.py`)

```python
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from core.test_utils import make_owner, auth_client, clear_throttle_cache
from orders.models import Order
from stores.models import SubscriptionPlan, SubscriptionPayment
from .overview import compute_overview
from .tests import make_user


class OverviewTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.now = timezone.now()
        self.plan = SubscriptionPlan.objects.create(name='Pro', orders_limit=1000, price_monthly=4500, price_yearly=45000)

    def _store(self, **q):
        owner, store = make_owner()
        for k, v in q.items():
            setattr(store.quota, k, v)
        store.quota.save()
        return store

    def test_store_counts_by_state(self):
        self._store(trial_ends_at=self.now + timedelta(days=10))                       # essai
        self._store(plan=self.plan, period_end=self.now + timedelta(days=20))          # abonnée
        self._store(trial_ends_at=self.now - timedelta(days=1))                        # expirée
        susp = self._store(trial_ends_at=self.now + timedelta(days=10))
        susp.is_active = False
        susp.save()
        stores = compute_overview(self.now)['stores']
        self.assertEqual((stores['total'], stores['trial'], stores['subscribed'], stores['expired'], stores['suspended']), (4, 1, 1, 1, 1))

    def test_revenue_counts_only_successful_payments(self):
        s = self._store(trial_ends_at=self.now + timedelta(days=10))
        SubscriptionPayment.objects.create(store=s, plan=self.plan, amount=4500, status='success', transaction_id='a')
        SubscriptionPayment.objects.create(store=s, plan=self.plan, amount=1500, status='failed', transaction_id='b')
        data = compute_overview(self.now)['revenue']
        self.assertEqual(float(data['this_month']), 4500.0)
        self.assertEqual(data['failed'], 1)
        self.assertEqual(len(data['series']), 12)
        self.assertEqual(float(data['series'][-1]['value']), 4500.0)

    def test_alerts(self):
        soon = self._store(trial_ends_at=self.now + timedelta(days=2))
        high = self._store(trial_ends_at=self.now + timedelta(days=20), orders_limit=100, orders_used=85)
        self._store(trial_ends_at=self.now + timedelta(days=20))
        stuck = SubscriptionPayment.objects.create(store=high, plan=self.plan, amount=1500, status='pending', transaction_id='c')
        SubscriptionPayment.objects.filter(pk=stuck.pk).update(created_at=self.now - timedelta(hours=3))
        alerts = compute_overview(self.now)['alerts']
        self.assertEqual(alerts['trials_expiring']['store_ids'], [soon.id])
        self.assertEqual(alerts['quota_high']['store_ids'], [high.id])
        self.assertEqual(alerts['payments_stuck']['count'], 1)

    def test_orders_last_30_days(self):
        s = self._store(trial_ends_at=self.now + timedelta(days=10))
        Order.objects.create(store=s, first_name='C', phone='0600', wilaya='Alger')
        self.assertEqual(compute_overview(self.now)['activity']['orders_30d'], 1)

    def test_endpoint_levels(self):
        self.assertEqual(auth_client(make_user('ov-a@test.com', is_platform_admin=True)).get('/api/platform-admin/overview/').status_code, 200)
        owner, _ = make_owner()
        self.assertEqual(auth_client(owner).get('/api/platform-admin/overview/').status_code, 403)
```

- [ ] **Step 2: Run to verify it fails**

Run: `venv/Scripts/python manage.py test platform_admin.test_overview --noinput`
Expected: FAIL (`ModuleNotFoundError: platform_admin.overview`).

- [ ] **Step 3: Implement**

`overview.py` :
```python
"""KPI de la vue d'ensemble admin — agrégats SQL, jamais de boucle par boutique."""
from datetime import timedelta

from django.db.models import Sum, Count, F
from django.db.models.functions import TruncMonth
from django.utils import timezone

from orders.models import Order
from stores.models import Store, SubscriptionQuota, SubscriptionPayment

TRIAL_ALERT_DAYS = 3
QUOTA_ALERT_RATIO = 0.8
PAYMENT_STUCK_HOURS = 1


def _month_keys(now, n=12):
    year, month = now.year, now.month
    keys = []
    for _ in range(n):
        keys.append(f'{year:04d}-{month:02d}')
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(keys))


def _series(now, qs, date_field, value):
    """Série 12 mois (du plus ancien au plus récent), mois sans donnée = 0."""
    keys = _month_keys(now)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    start = start.replace(year=start.year - 1, month=start.month) if start.month == 12 else start.replace(year=start.year - 1, month=start.month + 1)
    rows = (qs.filter(**{f'{date_field}__gte': start})
              .annotate(m=TruncMonth(date_field)).values('m').annotate(v=value))
    by_month = {r['m'].strftime('%Y-%m'): r['v'] or 0 for r in rows}
    return [{'month': k, 'value': by_month.get(k, 0)} for k in keys]


def compute_overview(now=None):
    now = now or timezone.now()
    active_quotas = SubscriptionQuota.objects.filter(store__is_active=True)

    total = Store.objects.count()
    suspended = Store.objects.filter(is_active=False).count()
    subscribed = active_quotas.filter(plan__isnull=False, period_end__gt=now).count()
    trial = active_quotas.filter(plan__isnull=True, trial_ends_at__gt=now).count()
    expired = max(0, (total - suspended) - subscribed - trial)

    paid = SubscriptionPayment.objects.filter(status='success')
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    this_month = paid.filter(created_at__gte=month_start).aggregate(s=Sum('amount'))['s'] or 0

    trials_expiring = list(active_quotas.filter(
        plan__isnull=True, trial_ends_at__gt=now, trial_ends_at__lte=now + timedelta(days=TRIAL_ALERT_DAYS),
    ).values_list('store_id', flat=True))
    quota_high = list(active_quotas.filter(orders_limit__gt=0, orders_used__gte=F('orders_limit') * QUOTA_ALERT_RATIO)
                      .values_list('store_id', flat=True))
    stuck = list(SubscriptionPayment.objects.filter(
        status='pending', created_at__lte=now - timedelta(hours=PAYMENT_STUCK_HOURS)).values_list('id', flat=True))

    return {
        'stores': {'total': total, 'trial': trial, 'subscribed': subscribed, 'expired': expired, 'suspended': suspended},
        'revenue': {
            'this_month': this_month,
            'pending': SubscriptionPayment.objects.filter(status='pending').count(),
            'failed': SubscriptionPayment.objects.filter(status='failed').count(),
            'series': _series(now, paid, 'created_at', Sum('amount')),
        },
        'activity': {
            'orders_30d': Order.objects.filter(created_at__gte=now - timedelta(days=30)).count(),
            'orders_series': _series(now, Order.objects.all(), 'created_at', Count('id')),
            'new_stores_series': _series(now, Store.objects.all(), 'created_at', Count('id')),
        },
        'alerts': {
            'trials_expiring': {'count': len(trials_expiring), 'store_ids': trials_expiring},
            'quota_high': {'count': len(quota_high), 'store_ids': quota_high},
            'payments_stuck': {'count': len(stuck), 'payment_ids': stuck},
        },
    }
```
`views_overview.py` :
```python
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .overview import compute_overview
from .permissions import is_platform_admin


class PlatformOverviewView(APIView):
    """KPI de la plateforme — niveau admin (lecture seule)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return Response({'detail': 'Accès réservé aux administrateurs de la plateforme.'}, status=403)
        return Response(compute_overview())
```
`urls.py` : `from .views_overview import PlatformOverviewView` et `path('overview/', PlatformOverviewView.as_view()),` en tête de `urlpatterns`.

- [ ] **Step 4: Run to verify it passes**

Run: `venv/Scripts/python manage.py test platform_admin --noinput`
Expected: PASS. Les `Decimal` sont sérialisés par DRF (`Response`) sans conversion manuelle.

- [ ] **Step 5: Commit**

```bash
git add backend/platform_admin
git commit -m "feat(admin): endpoint overview (KPI boutiques, revenus, activité, alertes)"
```

---

### Task 4: Composants admin partagés + garde superadmin (frontend)

**Files:**
- Create: `frontend/src/components/admin/AdminPageHeader.jsx`, `AdminState.jsx`, `AdminList.jsx`, tests `frontend/src/tests/components/admin/AdminComponents.test.jsx`
- Modify: `frontend/src/components/PlatformAdminRoute.jsx`

**Interfaces:**
- Produces: `AdminPageHeader({ pageKey, title, subtitle, help, actions })`, `AdminError({ message, onRetry })`, `AdminEmpty({ title, description })`, `AdminList({ columns, rows, total, page, perPage, onPage, search, onSearch, loading, error, onRetry, rowActions })` (colonnes `{ key, label, render? }`), garde `PSA` (superadmin).

- [ ] **Step 1: Write the failing test**

```jsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import AdminPageHeader from '../../../components/admin/AdminPageHeader'
import { AdminError, AdminEmpty } from '../../../components/admin/AdminState'
import AdminList from '../../../components/admin/AdminList'

describe('AdminPageHeader', () => {
  it('shows title and toggles help', () => {
    render(<AdminPageHeader pageKey="t" title="Boutiques" help="Aide texte" />)
    expect(screen.getByText('Boutiques')).toBeInTheDocument()
    expect(screen.queryByText('Aide texte')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /aide/i }))
    expect(screen.getByText('Aide texte')).toBeInTheDocument()
  })
})

describe('AdminState', () => {
  it('error calls onRetry', () => {
    const onRetry = vi.fn()
    render(<AdminError message="Boom" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: /réessayer/i }))
    expect(onRetry).toHaveBeenCalled()
  })
  it('empty shows title', () => {
    render(<AdminEmpty title="Rien" />)
    expect(screen.getByText('Rien')).toBeInTheDocument()
  })
})

describe('AdminList', () => {
  const columns = [{ key: 'name', label: 'Nom' }]
  it('renders rows and paginates', () => {
    const onPage = vi.fn()
    render(<AdminList columns={columns} rows={[{ id: 1, name: 'Boutique A' }]} total={45} page={1} perPage={20} onPage={onPage} />)
    expect(screen.getByText('Boutique A')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /suivant/i }))
    expect(onPage).toHaveBeenCalledWith(2)
  })
  it('shows empty state', () => {
    render(<AdminList columns={columns} rows={[]} total={0} page={1} perPage={20} />)
    expect(screen.getByText(/aucun résultat/i)).toBeInTheDocument()
  })
  it('search calls onSearch', () => {
    const onSearch = vi.fn()
    render(<AdminList columns={columns} rows={[]} total={0} page={1} perPage={20} search="" onSearch={onSearch} />)
    fireEvent.change(screen.getByPlaceholderText(/rechercher/i), { target: { value: 'abc' } })
    expect(onSearch).toHaveBeenCalledWith('abc')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/tests/components/admin/AdminComponents.test.jsx`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Implement**

`AdminPageHeader.jsx` :
```jsx
import { useState } from 'react'
import { theme } from '../../theme'

const key = k => `admin_aide_${k}`
function readOpen(k) { try { return localStorage.getItem(key(k)) === '1' } catch { return false } }
function writeOpen(k, v) { try { localStorage.setItem(key(k), v ? '1' : '0') } catch { /* stockage indisponible */ } }

export default function AdminPageHeader({ pageKey, title, subtitle, help, actions }) {
  const [open, setOpen] = useState(() => readOpen(pageKey))
  const toggle = () => { setOpen(o => { writeOpen(pageKey, !o); return !o }) }
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-app-primary">{title}</h1>
          {subtitle && <p className="text-sm text-app-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {help && (
            <button onClick={toggle} aria-expanded={open}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border text-app-muted-light hover:text-app-primary transition-colors"
              style={{ borderColor: theme.dark.border }}>
              Aide
            </button>
          )}
        </div>
      </div>
      {help && open && (
        <div className="mt-3 rounded-xl border p-4 text-sm text-app-muted-light" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          {help}
        </div>
      )}
    </div>
  )
}
```
`AdminState.jsx` :
```jsx
import { theme } from '../../theme'

export function AdminError({ message = 'Impossible de charger les données.', onRetry }) {
  return (
    <div className="rounded-xl border p-6 text-center" style={{ background: theme.dark.card, borderColor: '#7f1d1d' }}>
      <p className="text-sm text-red-400 mb-3">{message}</p>
      {onRetry && <button onClick={onRetry} className={theme.btn.outline}>Réessayer</button>}
    </div>
  )
}

export function AdminEmpty({ title = 'Aucun résultat', description }) {
  return (
    <div className="rounded-xl border p-10 text-center" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <p className="text-sm font-medium text-app-primary">{title}</p>
      {description && <p className="text-xs text-app-muted mt-1">{description}</p>}
    </div>
  )
}
```
`AdminList.jsx` :
```jsx
import { theme } from '../../theme'
import { AdminError, AdminEmpty } from './AdminState'

export default function AdminList({ columns, rows, total, page, perPage, onPage, search, onSearch, loading, error, onRetry, rowActions }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (perPage || 20)))
  return (
    <div>
      {onSearch && (
        <input value={search || ''} onChange={e => onSearch(e.target.value)} placeholder="Rechercher…"
          className={`${theme.input} mb-4 max-w-sm`} />
      )}
      {error ? <AdminError message={error} onRetry={onRetry} /> : rows.length === 0 && !loading ? <AdminEmpty /> : (
        <div className="rounded-xl border overflow-x-auto" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <table className="w-full text-sm">
            <thead>
              <tr>{columns.map(c => <th key={c.key} className="text-left px-4 py-3 text-xs font-medium text-app-muted">{c.label}</th>)}{rowActions && <th />}</tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: theme.dark.border }}>
                  {columns.map(c => <td key={c.key} className="px-4 py-3 text-app-primary">{c.render ? c.render(r) : r[c.key]}</td>)}
                  {rowActions && <td className="px-4 py-3 text-right">{rowActions(r)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-app-muted">
          <span>Page {page} / {pages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => onPage(page - 1)} className={theme.btn.outline}>Précédent</button>
            <button disabled={page >= pages} onClick={() => onPage(page + 1)} className={theme.btn.outline}>Suivant</button>
          </div>
        </div>
      )}
    </div>
  )
}
```
`PlatformAdminRoute.jsx` — la garde existante accepte désormais admin **ou** superadmin, et on ajoute `PSA` :
```jsx
export default function PlatformAdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (!user.platform_level) return <Navigate to="/dashboard" replace />
  return children
}

function PlatformSuperadminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  if (user.platform_level !== 'superadmin') return <Navigate to="/platform-admin" replace />
  return children
}

export function PSA({ children }) {
  return (
    <PrivateRoute>
      <PlatformSuperadminRoute>{children}</PlatformSuperadminRoute>
    </PrivateRoute>
  )
}
```
(Vérifier que `theme.input`, `theme.btn.outline` existent dans `theme.js`; sinon utiliser les clés équivalentes déjà employées par `PlatformAdminStoresPage.jsx`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/components/admin/AdminComponents.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin frontend/src/components/PlatformAdminRoute.jsx frontend/src/tests/components/admin
git commit -m "feat(admin): composants admin partagés + garde superadmin"
```

---

### Task 5: Layout, vue d'ensemble et routes

**Files:**
- Create: `frontend/src/pages/platform-admin/PlatformAdminOverviewPage.jsx`, `frontend/src/tests/pages/platform-admin/PlatformAdminOverviewPage.test.jsx`, `frontend/src/tests/pages/platform-admin/PlatformAdminLayout.test.jsx`
- Modify: `frontend/src/pages/platform-admin/PlatformAdminLayout.jsx`, `frontend/src/App.jsx:153-160`

**Interfaces:**
- Consumes: `GET /api/platform-admin/overview/` (Task 3), `user.platform_level` (Task 1), `AdminPageHeader`/`AdminError` (Task 4).
- Produces: route `/platform-admin/apercu` (index), layout fournissant `useOutletContext() -> { overview, reloadOverview }`.

- [ ] **Step 1: Write the failing tests**

```jsx
// PlatformAdminOverviewPage.test.jsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PlatformAdminOverviewPage from '../../../pages/platform-admin/PlatformAdminOverviewPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn() } }))
import api from '../../../api/axios'

const DATA = {
  stores: { total: 12, trial: 5, subscribed: 4, expired: 2, suspended: 1 },
  revenue: { this_month: 9000, pending: 1, failed: 0, series: [{ month: '2026-10', value: 9000 }] },
  activity: { orders_30d: 340, orders_series: [{ month: '2026-10', value: 340 }], new_stores_series: [{ month: '2026-10', value: 3 }] },
  alerts: { trials_expiring: { count: 2, store_ids: [1, 2] }, quota_high: { count: 0, store_ids: [] }, payments_stuck: { count: 1, payment_ids: [9] } },
}

describe('PlatformAdminOverviewPage', () => {
  beforeEach(() => api.get.mockReset())
  it('shows KPI values and alerts', async () => {
    api.get.mockResolvedValue({ data: DATA })
    render(<MemoryRouter><PlatformAdminOverviewPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument())
    expect(screen.getByText(/340/)).toBeInTheDocument()
    expect(screen.getByText(/essais.*expir/i)).toBeInTheDocument()
  })
  it('shows an error with retry when the API fails', async () => {
    api.get.mockRejectedValue(new Error('x'))
    render(<MemoryRouter><PlatformAdminOverviewPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument())
  })
})
```
```jsx
// PlatformAdminLayout.test.jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import PlatformAdminLayout from '../../../pages/platform-admin/PlatformAdminLayout'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { alerts: { trials_expiring: { count: 0 }, quota_high: { count: 0 }, payments_stuck: { count: 0 } } } }) } }))
const auth = { user: { email: 'a@b.c', platform_level: 'admin' } }
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ ...auth, logout: vi.fn() }) }))

describe('PlatformAdminLayout', () => {
  it('hides superadmin-only links for a simple admin', () => {
    auth.user.platform_level = 'admin'
    render(<MemoryRouter><PlatformAdminLayout /></MemoryRouter>)
    expect(screen.getByText('Vue d’ensemble')).toBeInTheDocument()
    expect(screen.queryByText('Confirmateurs')).not.toBeInTheDocument()
  })
  it('shows superadmin links for a superadmin', () => {
    auth.user.platform_level = 'superadmin'
    render(<MemoryRouter><PlatformAdminLayout /></MemoryRouter>)
    expect(screen.getByText('Confirmateurs')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/tests/pages/platform-admin`
Expected: FAIL (page et liens introuvables).

- [ ] **Step 3: Implement**

`PlatformAdminOverviewPage.jsx` — charge `/platform-admin/overview/` au montage, puis toutes les 60 s **uniquement si `document.visibilityState === 'visible'`**, sans repasser `loading` à `true` après le premier chargement ; états `AdminError`+« Réessayer » ; `AdminPageHeader` (pageKey `overview`, titre « Vue d'ensemble », aide expliquant chaque KPI) ; 4 `StatCard` (Boutiques total, Revenus du mois en DA, Commandes 30 j, Alertes = somme des counts) + répartition des états (essai/abonnées/expirées/suspendues) ; section « Alertes » avec trois lignes cliquables (`Link` vers `/platform-admin/boutiques?alert=trials_expiring|quota_high` et `/platform-admin/boutiques` pour les paiements — les filtres arrivent en phase 2) ; deux `AreaChart`/`BarChart` Recharts (revenus 12 mois, commandes + nouvelles boutiques) via `ResponsiveContainer`. Libellés d'alertes : « Essais qui expirent sous 3 jours », « Quota consommé à plus de 80 % », « Paiements en attente depuis plus d'1 h ». Montants via `Number(v).toLocaleString('fr-DZ') + ' DA'`.

`PlatformAdminLayout.jsx` — réécrire les `LINKS` en groupes `[{ group, items: [{ to, label, icon, superOnly?, badge? }] }]` :
- Principal : « Vue d’ensemble » (`/platform-admin/apercu`)
- Boutiques : « Boutiques » (`/platform-admin/boutiques`), « Confirmateurs » (`superOnly`)
- Système : « Journal d'audit » (`/platform-admin/journal`)
Les liens `superOnly` ne sont rendus que si `user.platform_level === 'superadmin'`. Le layout charge `overview` (appel `api.get('/platform-admin/overview/')`, silencieux en cas d'erreur) à chaque changement de `location.pathname`, calcule le badge « Vue d'ensemble » = somme des `alerts.*.count`, et expose `<Outlet context={{ overview, reloadOverview }} />`. Sidebar : `hidden md:flex` + bouton de menu (`md:hidden`) qui ouvre un tiroir (`useState`), fermé à chaque navigation. Conserver tels quels le bloc « Ma file de confirmation », « Retour au dashboard boutique » et « Déconnexion ». Remplacer le sous-titre « Espace Superadmin » par `user.platform_level === 'superadmin' ? 'Espace Superadmin' : 'Espace Admin'`.

`App.jsx` — dans le bloc `/platform-admin` :
```jsx
<Route index element={<Navigate to="apercu" replace />} />
<Route path="apercu" element={<PlatformAdminOverviewPage />} />
<Route path="boutiques" element={<PlatformAdminStoresPage />} />
<Route path="boutiques/:storeId/commandes" element={<PlatformAdminStoreOrdersPage />} />
<Route path="boutiques/:storeId/produits" element={<PlatformAdminStoreProductsPage />} />
<Route path="confirmateurs" element={<PSA><PlatformAdminConfirmateursPage /></PSA>} />
<Route path="journal" element={<PlatformAdminAuditPage />} />
```
avec `import { PA, PC, PSA } from './components/PlatformAdminRoute'` et l'import de `PlatformAdminOverviewPage`. Sur `PlatformAdminStoresPage.jsx`, masquer les boutons d'écriture (toggle, actions groupées, mode) quand `user.platform_level !== 'superadmin'` (lecture + « Gérer cette boutique » restent visibles pour l'admin).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/tests/pages/platform-admin src/tests/components/admin` puis `npx vitest run` (suite complète) puis `npm run build`
Expected: PASS ; build propre. ⚠️ Les tests existants qui mockent `useAuth` avec `is_platform_admin: true` doivent ajouter `platform_level: 'superadmin'` (la garde lit désormais `platform_level`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(admin): layout par niveau + vue d'ensemble KPI"
```

---

### Task 6: Documentation et vérification finale

**Files:**
- Modify: `CLAUDE.md` (section « Service de confirmation en marque blanche — Superadmin » : ajouter une sous-section « Admin plateforme — phase 1 »), `securite.md` (entrée sur la séparation admin/superadmin)

- [ ] **Step 1: Documenter** — dans `CLAUDE.md` : niveaux (`is_platform_admin` = admin, `is_platform_superadmin`), liste des routes réservées au superadmin, endpoint `overview` + définitions des KPI et seuils (`TRIAL_ALERT_DAYS=3`, `QUOTA_ALERT_RATIO=0.8`, `PAYMENT_STUCK_HOURS=1`), limite « revenus à partir de SofizPay », composants `components/admin/`, routes frontend. Dans `securite.md` : l'accès à `/platform-admin` est désormais à deux niveaux, contrôlé côté serveur et testé.
- [ ] **Step 2: Vérifier** — `venv/Scripts/python manage.py test platform_admin accounts --noinput` puis `manage.py test --noinput` (suite complète) puis `cd frontend && npx vitest run && npm run build`. Expected : tout vert. Si une régression apparaît, la corriger avant de continuer.
- [ ] **Step 3: Signaler à l'utilisateur** que la phase 1 est prête et attendre sa validation avant tout commit/push/déploiement.

---

## Self-review (spec → tâches)

- Niveaux admin/superadmin, migration des existants, `platform_level` → Task 1 ; routes réservées au superadmin avec tests 403/200 → Task 2.
- `overview` (boutiques par état, revenus 12 mois, activité, 3 alertes cliquables) → Task 3 (backend) + Task 5 (front) ; limite Chargily → documentée Task 6.
- Composants partagés (`AdminPageHeader`, `AdminList`, `AdminState`) → Task 4 ; layout groupé, badges, tiroir mobile, liens par niveau → Task 5.
- Rafraîchissement 60 s onglet visible sans reset → Task 5.
- Anti-brute-force admin Django (mentionné au spec) : **non couvert par la phase 1** — repoussé à la phase 4 (« sécurité ») ; à signaler à l'utilisateur.
- Cohérence des types : `compute_overview` clés (`stores`, `revenue`, `activity`, `alerts`) identiques entre Task 3 et la page Task 5 ; `platform_level` identique Task 1/4/5.
