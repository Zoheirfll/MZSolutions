# Permissions par personne — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a store owner/admin to override permissions for a single team member (in addition to the existing per-role matrix), and to set those permissions at invitation time.

**Architecture:** Add a `TeamMemberPermission` model that mirrors the existing `RolePermission` model but scopes overrides to one `TeamMember` instead of one role. Extend the existing resolution function `get_effective_permissions` with a three-level cascade: member override > role override > role default. Wire this into the existing invite flow (`InviteView`) and expose a new per-member permissions endpoint, then surface both in `TeamPage.jsx`.

**Tech Stack:** Django 5.2 + DRF (backend/team), React 18 + Vitest/Testing Library (frontend/src/pages/TeamPage.jsx)

## Global Constraints

- Zéro CSS custom — Tailwind uniquement; use `theme.js` for all colors/styles (see `c:\Users\filali\MZSolutions\CLAUDE.md`).
- Never use a native `<select>` — use `components/Select.jsx` (not needed in this plan; only checkboxes/toggles are used).
- This system gates **read/visibility only** — never write actions. Do not touch `is_owner_or_admin` enforcement anywhere.
- Only store explicit overrides (never write a row that matches the default) — same principle as `RolePermission`.
- Run backend tests with `cd backend && venv/Scripts/python manage.py test team`.
- Run frontend tests with `cd frontend && npm run test`.
- Do not commit/push/merge without explicit user approval per project workflow (CLAUDE.md rule) — this plan produces local commits per task only; final branch push/merge is a separate, later step the user must approve.

---

### Task 1: `TeamMemberPermission` model + migration + cascade resolution

**Files:**
- Modify: `backend/team/models.py` (add model after `RolePermission`, extend `get_effective_permissions`)
- Create: `backend/team/migrations/00XX_teammemberpermission.py` (auto-generated via `makemigrations`)
- Test: `backend/team/tests.py` (new test class `EffectivePermissionsCascadeTests`)

**Interfaces:**
- Consumes: existing `TeamMember`, `RolePermission`, `DEFAULT_PERMISSIONS`, `PERMISSION_CATALOG` from `team/models.py`.
- Produces: `TeamMemberPermission(member, permission, enabled)` model; `get_effective_permissions(store, role, member=None)` — extended signature, backward compatible (existing callers that pass only `(store, role)` keep working identically).

- [ ] **Step 1: Write the failing test**

Add to `backend/team/tests.py` (append at end of file, after `RolePermissionsMatrixTests`):

```python
from .models import TeamMemberPermission, get_effective_permissions


class EffectivePermissionsCascadeTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conf_user, self.conf = make_team_member(self.store, 'confirmateur')

    def test_defaults_to_role_default_with_no_overrides(self):
        perms = get_effective_permissions(self.store, 'confirmateur', member=self.conf)
        self.assertFalse(perms['finances_view'])
        self.assertTrue(perms['orders_view'])

    def test_role_override_applies_when_no_member_override(self):
        RolePermission.objects.create(store=self.store, role='confirmateur', permission='finances_view', enabled=True)
        perms = get_effective_permissions(self.store, 'confirmateur', member=self.conf)
        self.assertTrue(perms['finances_view'])

    def test_member_override_wins_over_role_override(self):
        RolePermission.objects.create(store=self.store, role='confirmateur', permission='finances_view', enabled=True)
        TeamMemberPermission.objects.create(member=self.conf, permission='finances_view', enabled=False)
        perms = get_effective_permissions(self.store, 'confirmateur', member=self.conf)
        self.assertFalse(perms['finances_view'])

    def test_member_override_isolated_from_other_members_same_role(self):
        _, other_conf = make_team_member(self.store, 'confirmateur')
        TeamMemberPermission.objects.create(member=self.conf, permission='stock_view', enabled=True)
        perms_conf  = get_effective_permissions(self.store, 'confirmateur', member=self.conf)
        perms_other = get_effective_permissions(self.store, 'confirmateur', member=other_conf)
        self.assertTrue(perms_conf['stock_view'])
        self.assertFalse(perms_other['stock_view'])

    def test_no_member_arg_behaves_like_role_only(self):
        perms = get_effective_permissions(self.store, 'confirmateur')
        self.assertFalse(perms['finances_view'])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && venv/Scripts/python manage.py test team.tests.EffectivePermissionsCascadeTests -v 2`
Expected: FAIL — `ImportError: cannot import name 'TeamMemberPermission'` (or `TypeError: get_effective_permissions() got an unexpected keyword argument 'member'`)

- [ ] **Step 3: Write minimal implementation**

In `backend/team/models.py`, add after the `RolePermission` class (after line 108, before `def get_effective_permissions`):

```python
class TeamMemberPermission(models.Model):
    """Override d'une permission du catalogue pour un membre précis — a
    priorité sur RolePermission (override de rôle) qui a lui-même priorité
    sur DEFAULT_PERMISSIONS (défaut du rôle). Seuls les overrides explicites
    sont stockés, même philosophie que RolePermission."""
    member     = models.ForeignKey(TeamMember, on_delete=models.CASCADE, related_name='permission_overrides')
    permission = models.CharField(max_length=50)
    enabled    = models.BooleanField(default=True)

    class Meta:
        unique_together = [('member', 'permission')]

    def __str__(self):
        return f"{self.member_id} — {self.permission} = {self.enabled}"
```

Then replace the existing `get_effective_permissions` function (current lines 111-120) with:

```python
def get_effective_permissions(store, role, member=None):
    """Permissions effectives d'un rôle (et, si `member` est fourni, d'un
    membre précis) dans une boutique : override membre si présent, sinon
    override de rôle si présent, sinon valeur par défaut du rôle. `role=None`
    (owner) n'appelle jamais cette fonction — l'owner a un accès total géré
    séparément."""
    defaults = DEFAULT_PERMISSIONS.get(role, {})
    role_overrides = {
        p.permission: p.enabled
        for p in RolePermission.objects.filter(store=store, role=role)
    }
    member_overrides = {}
    if member is not None:
        member_overrides = {
            p.permission: p.enabled
            for p in TeamMemberPermission.objects.filter(member=member)
        }
    return {
        key: member_overrides.get(key, role_overrides.get(key, defaults.get(key, False)))
        for key, _ in PERMISSION_CATALOG
    }
```

Generate the migration:

```bash
cd backend && venv/Scripts/python manage.py makemigrations team
```

Expected output: `Migrations for 'team': backend/team/migrations/00XX_teammemberpermission.py - Create model TeamMemberPermission`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && venv/Scripts/python manage.py test team.tests.EffectivePermissionsCascadeTests -v 2`
Expected: PASS — 5 tests OK

- [ ] **Step 5: Commit**

```bash
git add backend/team/models.py backend/team/migrations/ backend/team/tests.py
git commit -m "feat: ajoute TeamMemberPermission (override par personne) et cascade de résolution"
```

---

### Task 2: `core/permissions.py` cascade wiring (pass member through)

**Files:**
- Modify: `backend/core/permissions.py:35-49` (`get_effective_permissions`)
- Test: `backend/core/tests.py` if it exists, otherwise `backend/team/tests.py` (new test in `EffectivePermissionsCascadeTests` verifying it flows through `has_permission`)

**Interfaces:**
- Consumes: `team.models.get_effective_permissions(store, role, member=None)` from Task 1.
- Produces: `core.permissions.get_effective_permissions(request)` and `has_permission(request, key)` now resolve member-level overrides automatically for any authenticated team member request.

- [ ] **Step 1: Check whether `backend/core/tests.py` exists**

Run: `ls backend/core/tests.py 2>/dev/null || echo "NO FILE"`

If it prints `NO FILE`, the test in this task will be added to `backend/team/tests.py` instead (it exercises `core.permissions` indirectly via the `/api/auth/me/` endpoint, consistent with the existing `test_toggle_permission_persists_and_takes_effect` test in `RolePermissionsMatrixTests`).

- [ ] **Step 2: Write the failing test**

Add to `backend/team/tests.py`, inside `EffectivePermissionsCascadeTests` (append this method):

```python
    def test_member_override_reflected_in_auth_me(self):
        from .models import TeamMemberPermission
        TeamMemberPermission.objects.create(member=self.conf, permission='finances_view', enabled=True)
        client = auth_client(self.conf_user)
        resp = client.get('/api/auth/me/')
        self.assertTrue(resp.data['permissions']['finances_view'])
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && venv/Scripts/python manage.py test team.tests.EffectivePermissionsCascadeTests.test_member_override_reflected_in_auth_me -v 2`
Expected: FAIL — `AssertionError: False is not true` (member override not applied yet, `core.permissions` doesn't pass `member`)

- [ ] **Step 4: Write minimal implementation**

In `backend/core/permissions.py`, replace `get_effective_permissions` (current lines 35-49):

```python
def get_effective_permissions(request):
    """Permissions effectives de l'utilisateur pour sa boutique (Epic 7.5 +
    override par personne). Seul l'owner (role=None) a un accès total
    implicite non configurable ; admin/confirmateur/dropshipper passent par
    la cascade `TeamMemberPermission` > `RolePermission` > `DEFAULT_PERMISSIONS`.
    Ce système ne gate que la lecture — les actions d'écriture restent
    protégées séparément par `is_owner_or_admin` (inchangé)."""
    from team.models import get_effective_permissions as _effective, PERMISSION_CATALOG
    role = get_team_role(request)
    if role is None:
        return {key: True for key, _ in PERMISSION_CATALOG}
    store = get_store(request)
    if not store:
        return {key: False for key, _ in PERMISSION_CATALOG}
    member = getattr(request.user, 'team_membership', None)
    return _effective(store, role, member=member)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && venv/Scripts/python manage.py test team.tests.EffectivePermissionsCascadeTests -v 2`
Expected: PASS — 6 tests OK

- [ ] **Step 6: Run the full team test suite to check for regressions**

Run: `cd backend && venv/Scripts/python manage.py test team`
Expected: OK, all existing tests still pass (in particular `RolePermissionsMatrixTests.test_toggle_permission_persists_and_takes_effect`)

- [ ] **Step 7: Commit**

```bash
git add backend/core/permissions.py backend/team/tests.py
git commit -m "feat: core.permissions résout désormais les overrides individuels par membre"
```

---

### Task 3: Invite endpoint accepts optional `permissions` payload

**Files:**
- Modify: `backend/team/serializers.py:18-31` (`InviteSerializer`)
- Modify: `backend/team/views.py:27-71` (`InviteView.post`)
- Test: `backend/team/tests.py` (new test class `InvitePermissionsTests`)

**Interfaces:**
- Consumes: `TeamMemberPermission` (Task 1), `get_effective_permissions(store, role)` (Task 1, role-only call — no member yet since the member doesn't exist before creation).
- Produces: `POST /api/team/invite/` now accepts an optional `permissions: {key: bool}` dict; only entries that differ from the role's current effective value are persisted as `TeamMemberPermission` rows on the newly created member.

- [ ] **Step 1: Write the failing test**

Add to `backend/team/tests.py`, after `InviteTests`:

```python
class InvitePermissionsTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_invite_without_permissions_creates_no_overrides(self):
        client = auth_client(self.owner)
        resp = client.post('/api/team/invite/', {
            'role': 'confirmateur', 'first_name': 'C', 'last_name': 'F', 'email': 'noperm@test.com',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        member = TeamMember.objects.get(email='noperm@test.com')
        self.assertEqual(member.permission_overrides.count(), 0)

    def test_invite_with_permissions_creates_only_diffs_from_role_default(self):
        client = auth_client(self.owner)
        # confirmateur default: orders_view=True, finances_view=False (see DEFAULT_PERMISSIONS)
        resp = client.post('/api/team/invite/', {
            'role': 'confirmateur', 'first_name': 'C', 'last_name': 'F', 'email': 'withperm@test.com',
            'permissions': {
                'orders_view': True,     # matches default -> no override stored
                'finances_view': True,   # differs from default -> override stored
            },
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        member = TeamMember.objects.get(email='withperm@test.com')
        overrides = {o.permission: o.enabled for o in member.permission_overrides.all()}
        self.assertEqual(overrides, {'finances_view': True})

    def test_new_member_effective_permissions_include_custom_override(self):
        client = auth_client(self.owner)
        client.post('/api/team/invite/', {
            'role': 'confirmateur', 'first_name': 'C', 'last_name': 'F', 'email': 'effective@test.com',
            'permissions': {'stock_view': True},
        }, format='json')
        member = TeamMember.objects.get(email='effective@test.com')
        from .models import get_effective_permissions
        perms = get_effective_permissions(self.store, 'confirmateur', member=member)
        self.assertTrue(perms['stock_view'])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && venv/Scripts/python manage.py test team.tests.InvitePermissionsTests -v 2`
Expected: FAIL — `test_invite_with_permissions_creates_only_diffs_from_role_default` fails with 0 overrides created (payload field ignored)

- [ ] **Step 3: Write minimal implementation**

In `backend/team/serializers.py`, add to `InviteSerializer` (after line 26, `address` field):

```python
    permissions = serializers.DictField(child=serializers.BooleanField(), required=False)
```

In `backend/team/views.py`, update imports (line 9) to include `TeamMemberPermission`:

```python
from .models import TeamMember, RolePermission, TeamMemberPermission, PERMISSION_CATALOG, ROLES_WITH_PERMISSIONS, get_effective_permissions
```

Then in `InviteView.post`, after the `member = TeamMember.objects.create(...)` block (after current line 49, before `link = ...`):

```python
        permissions_payload = d.get('permissions')
        if permissions_payload:
            role_defaults = get_effective_permissions(store, member.role)
            for key, value in permissions_payload.items():
                if key not in dict(PERMISSION_CATALOG):
                    continue
                if role_defaults.get(key, False) != value:
                    TeamMemberPermission.objects.create(member=member, permission=key, enabled=value)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && venv/Scripts/python manage.py test team.tests.InvitePermissionsTests -v 2`
Expected: PASS — 3 tests OK

- [ ] **Step 5: Run the full team test suite to check for regressions**

Run: `cd backend && venv/Scripts/python manage.py test team`
Expected: OK, all tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/team/serializers.py backend/team/views.py backend/team/tests.py
git commit -m "feat: l'invitation d'un membre accepte des permissions individuelles optionnelles"
```

---

### Task 4: Per-member permissions endpoint (`GET`/`POST /api/team/members/<id>/permissions/`)

**Files:**
- Modify: `backend/team/views.py` (new `TeamMemberPermissionsView` class)
- Modify: `backend/team/urls.py` (register new route)
- Test: `backend/team/tests.py` (new test class `TeamMemberPermissionsViewTests`)

**Interfaces:**
- Consumes: `TeamMemberPermission`, `get_effective_permissions(store, role, member)` (Task 1); `is_owner_or_admin` from `core.permissions` (already imported in `team/views.py`).
- Produces: `GET /api/team/members/<id>/permissions/` → `{catalog: [{key, label, enabled, is_custom}]}`; `POST /api/team/members/<id>/permissions/` with `{permission, enabled}` → upserts a `TeamMemberPermission`, returns `{permissions: {...effective...}}`.

- [ ] **Step 1: Write the failing test**

Add to `backend/team/tests.py`, after `RolePermissionsMatrixTests`:

```python
class TeamMemberPermissionsViewTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conf_user, self.conf = make_team_member(self.store, 'confirmateur')

    def test_owner_can_view_member_permissions(self):
        client = auth_client(self.owner)
        resp = client.get(f'/api/team/members/{self.conf.id}/permissions/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['catalog']), len(PERMISSION_CATALOG))
        entry = next(e for e in resp.data['catalog'] if e['key'] == 'orders_view')
        self.assertTrue(entry['enabled'])
        self.assertFalse(entry['is_custom'])

    def test_confirmateur_cannot_view_own_permissions_endpoint(self):
        client = auth_client(self.conf_user)
        resp = client.get(f'/api/team/members/{self.conf.id}/permissions/')
        self.assertEqual(resp.status_code, 403)

    def test_post_creates_override_and_marks_custom(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/team/members/{self.conf.id}/permissions/', {
            'permission': 'stock_view', 'enabled': True,
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['permissions']['stock_view'])

        check = client.get(f'/api/team/members/{self.conf.id}/permissions/')
        entry = next(e for e in check.data['catalog'] if e['key'] == 'stock_view')
        self.assertTrue(entry['is_custom'])

    def test_post_upserts_same_permission_twice(self):
        client = auth_client(self.owner)
        client.post(f'/api/team/members/{self.conf.id}/permissions/', {'permission': 'stock_view', 'enabled': True}, format='json')
        resp = client.post(f'/api/team/members/{self.conf.id}/permissions/', {'permission': 'stock_view', 'enabled': False}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['permissions']['stock_view'])
        from .models import TeamMemberPermission
        self.assertEqual(TeamMemberPermission.objects.filter(member=self.conf, permission='stock_view').count(), 1)

    def test_post_rejects_unknown_permission(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/team/members/{self.conf.id}/permissions/', {
            'permission': 'not_a_real_permission', 'enabled': True,
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_member_override_does_not_leak_to_role_matrix(self):
        client = auth_client(self.owner)
        client.post(f'/api/team/members/{self.conf.id}/permissions/', {'permission': 'stock_view', 'enabled': True}, format='json')
        matrix = client.get('/api/team/permissions/')
        self.assertFalse(matrix.data['matrix']['confirmateur']['stock_view'])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && venv/Scripts/python manage.py test team.tests.TeamMemberPermissionsViewTests -v 2`
Expected: FAIL — 404 (URL not registered yet)

- [ ] **Step 3: Write minimal implementation**

In `backend/team/views.py`, append at the end of the file (after `RolePermissionsView`):

```python
class TeamMemberPermissionsView(APIView):
    """Overrides de permissions pour un membre précis (au-dessus de la
    matrice par rôle) — owner/admin uniquement. GET renvoie le catalogue
    complet + valeurs effectives + indicateur is_custom ; POST upsert un
    seul toggle (permission, enabled)."""
    permission_classes = [IsAuthenticated]

    def _get_member(self, request, pk):
        if not is_owner_or_admin(request):
            return None, Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.team_members.get(pk=pk), None
        except TeamMember.DoesNotExist:
            return None, Response({'detail': 'Membre introuvable.'}, status=404)

    def get(self, request, pk):
        member, err = self._get_member(request, pk)
        if err:
            return err
        store = _get_store(request)
        effective = get_effective_permissions(store, member.role, member=member)
        custom_keys = set(TeamMemberPermission.objects.filter(member=member).values_list('permission', flat=True))
        return Response({
            'catalog': [
                {'key': k, 'label': label, 'enabled': effective.get(k, False), 'is_custom': k in custom_keys}
                for k, label in PERMISSION_CATALOG
            ],
        })

    def post(self, request, pk):
        member, err = self._get_member(request, pk)
        if err:
            return err
        store = _get_store(request)
        permission = request.data.get('permission')
        enabled    = bool(request.data.get('enabled'))
        if permission not in dict(PERMISSION_CATALOG):
            return Response({'detail': 'Permission inconnue.'}, status=400)

        TeamMemberPermission.objects.update_or_create(
            member=member, permission=permission,
            defaults={'enabled': enabled},
        )
        return Response({'permissions': get_effective_permissions(store, member.role, member=member)})
```

In `backend/team/urls.py`, update imports and add the route:

```python
from django.urls import path
from .views import (
    InviteView, TeamListView, TeamMemberDetailView, AcceptInvitationView,
    RolePermissionsView, TeamMemberPermissionsView,
)

urlpatterns = [
    path('invite/',                            InviteView.as_view()),
    path('members/',                           TeamListView.as_view()),
    path('members/<int:pk>/',                  TeamMemberDetailView.as_view()),
    path('members/<int:pk>/permissions/',      TeamMemberPermissionsView.as_view()),
    path('accept-invitation/',                 AcceptInvitationView.as_view()),
    path('permissions/',                       RolePermissionsView.as_view()),
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && venv/Scripts/python manage.py test team.tests.TeamMemberPermissionsViewTests -v 2`
Expected: PASS — 6 tests OK

- [ ] **Step 5: Run the full backend test suite to check for regressions**

Run: `cd backend && venv/Scripts/python manage.py test`
Expected: OK, all tests pass (full suite, not just `team`)

- [ ] **Step 6: Commit**

```bash
git add backend/team/views.py backend/team/urls.py backend/team/tests.py
git commit -m "feat: endpoint GET/POST par membre pour les overrides de permissions individuelles"
```

---

### Task 5: `TeamPage.jsx` invite modal — permission checkboxes

**Files:**
- Modify: `frontend/src/pages/TeamPage.jsx:17-135` (`EMPTY_FORM`, `Modal`)
- Test: `frontend/src/tests/pages/TeamPage.test.jsx` (extend)

**Interfaces:**
- Consumes: `GET /api/team/permissions/` (existing endpoint, returns `{catalog: [{key, label}], roles, matrix: {role: {key: bool}}}`).
- Produces: invite `Modal` now sends `permissions: {key: bool}` in the `POST /team/invite/` payload, reflecting user-toggled checkboxes seeded from `matrix[role]`.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/tests/pages/TeamPage.test.jsx`, inside the `describe('TeamPage', ...)` block (after the existing `'invites a new member...'` test):

```javascript
  it('pre-fills invite permissions from the role matrix and submits edited values', async () => {
    const user = userEvent.setup()
    const matrixData = {
      catalog: [
        { key: 'orders_view', label: 'Voir les commandes' },
        { key: 'finances_view', label: 'Voir les finances' },
      ],
      roles: ['admin', 'confirmateur', 'dropshipper'],
      matrix: {
        admin: { orders_view: true, finances_view: true },
        confirmateur: { orders_view: true, finances_view: false },
        dropshipper: { orders_view: true, finances_view: false },
      },
    }
    api.get.mockImplementation((url) => {
      if (url === '/team/members/?role=admin') return Promise.resolve({ data: ADMINS })
      if (url === '/team/permissions/') return Promise.resolve({ data: matrixData })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValueOnce({})
    renderPage()

    await screen.findByText('Karim B')
    await user.click(screen.getByRole('button', { name: /Ajouter/ }))

    expect(await screen.findByLabelText('Voir les commandes')).toBeChecked()
    expect(screen.getByLabelText('Voir les finances')).not.toBeChecked()

    await user.click(screen.getByLabelText('Voir les finances'))

    await user.type(screen.getByPlaceholderText('Prénom'), 'Sara')
    await user.type(screen.getByPlaceholderText('Nom'), 'Z')
    await user.type(screen.getByPlaceholderText('Email'), 'sara@test.com')
    await user.click(screen.getByRole('button', { name: "Envoyer l'invitation" }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/team/invite/', expect.objectContaining({
      permissions: expect.objectContaining({ orders_view: true, finances_view: true }),
    })))
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- TeamPage`
Expected: FAIL — `Unable to find a label with the text of: Voir les commandes` (checkboxes not implemented yet)

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/pages/TeamPage.jsx`, replace `EMPTY_FORM` (line 17-20):

```javascript
const EMPTY_FORM = {
  role: 'admin', first_name: '', last_name: '', email: '', phone: '',
  wilaya: '', commune: '', address: '', permissions: {},
}
```

Replace the `Modal` function signature and body (lines 22-135) with the following — add permission-matrix state and a checkbox section before the error/submit block:

```javascript
function Modal({ role, onClose, onSaved }) {
  const [form, setForm]     = useState({ ...EMPTY_FORM, role })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [catalog, setCatalog] = useState([])

  const change = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  useEffect(() => {
    api.get('/team/permissions/').then(({ data }) => {
      setCatalog(data.catalog)
      setForm(f => ({ ...f, permissions: { ...(data.matrix[f.role] || {}) } }))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!catalog.length) return
    api.get('/team/permissions/').then(({ data }) => {
      setForm(f => ({ ...f, permissions: { ...(data.matrix[f.role] || {}) } }))
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.role])

  const togglePermission = key => setForm(f => ({
    ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] },
  }))

  const submit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/team/invite/', form)
      onSaved()
    } catch (err) {
      const data = err.response?.data
      setError(data?.email?.[0] || data?.detail || 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = `w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]`
  const bdrStyle = { borderColor: theme.dark.border }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-xl border p-6 max-h-[90vh] overflow-y-auto" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-200">
            Inviter un {ROLE_LABELS[role]}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Prénom *</label>
              <input name="first_name" value={form.first_name} onChange={change} required className={inputCls} style={bdrStyle} placeholder="Prénom" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nom *</label>
              <input name="last_name" value={form.last_name} onChange={change} required className={inputCls} style={bdrStyle} placeholder="Nom" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email *</label>
              <input type="email" name="email" value={form.email} onChange={change} required className={inputCls} style={bdrStyle} placeholder="Email" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Téléphone</label>
              <input name="phone" value={form.phone} onChange={change} className={inputCls} style={bdrStyle} placeholder="+213 …" />
            </div>
          </div>

          {role === 'admin' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Rôle</label>
              <Select
                value={form.role}
                onChange={v => setForm(f => ({ ...f, role: v }))}
                options={[{ value: 'admin', label: 'Admin' }, { value: 'confirmateur', label: 'Confirmateur' }]}
                className={inputCls}
              />
            </div>
          )}

          {role === 'dropshipper' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Wilaya</label>
                  <Select
                    value={form.wilaya}
                    onChange={v => setForm(f => ({ ...f, wilaya: v }))}
                    options={WILAYAS.map(w => ({ value: w.name, label: `${w.id} — ${w.name}` }))}
                    placeholder="Choisissez une Wilaya"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Commune</label>
                  <input name="commune" value={form.commune} onChange={change} className={inputCls} style={bdrStyle} placeholder="Commune" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Adresse</label>
                <input name="address" value={form.address} onChange={change} className={inputCls} style={bdrStyle} placeholder="Adresse complète" />
              </div>
            </>
          )}

          {catalog.length > 0 && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">Permissions</label>
              <div className="max-h-48 overflow-y-auto rounded-lg border divide-y" style={{ borderColor: theme.dark.border }}>
                {catalog.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 cursor-pointer hover:bg-white/5 transition">
                    <input
                      type="checkbox"
                      checked={!!form.permissions[key]}
                      onChange={() => togglePermission(key)}
                      className="w-4 h-4 accent-violet-600 cursor-pointer shrink-0"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="pt-2 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition">
              Annuler
            </button>
            <button type="submit" disabled={loading} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:opacity-60">
              {loading ? 'Envoi…' : 'Envoyer l\'invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

Note: the checkbox `label` wraps the `input`, which Testing Library's `getByLabelText` resolves correctly without needing explicit `htmlFor`/`id` pairing (same pattern already used in `components/CheckboxList.jsx`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- TeamPage`
Expected: PASS — all `TeamPage` tests pass, including the new one

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/TeamPage.jsx frontend/src/tests/pages/TeamPage.test.jsx
git commit -m "feat: le formulaire d'invitation permet de personnaliser les permissions avant envoi"
```

---

### Task 6: `TeamPage.jsx` — per-member "Permissions" modal

**Files:**
- Modify: `frontend/src/pages/TeamPage.jsx` (new `MemberPermissionsModal` component, wire into `MembersTable` actions column and `TeamPage` state)
- Test: `frontend/src/tests/pages/TeamPage.test.jsx` (extend)

**Interfaces:**
- Consumes: `GET /api/team/members/<id>/permissions/`, `POST /api/team/members/<id>/permissions/` (Task 4).
- Produces: a "Permissions" button per row in `MembersTable` that opens a modal with live toggles; no new interfaces consumed by later tasks (this is the last task).

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/tests/pages/TeamPage.test.jsx`, after the previous new test:

```javascript
  it('opens the per-member permissions modal, shows custom badge, and toggles a permission', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/team/members/?role=admin') return Promise.resolve({ data: ADMINS })
      if (url === '/team/members/1/permissions/') return Promise.resolve({
        data: { catalog: [
          { key: 'orders_view', label: 'Voir les commandes', enabled: true, is_custom: false },
          { key: 'finances_view', label: 'Voir les finances', enabled: true, is_custom: true },
        ] },
      })
      return Promise.resolve({ data: { count: 0 } })
    })
    api.post.mockResolvedValueOnce({ data: { permissions: { orders_view: false, finances_view: true } } })
    renderPage()

    await screen.findByText('Karim B')
    await user.click(screen.getByRole('button', { name: 'Permissions' }))

    expect(await screen.findByText('Voir les finances')).toBeInTheDocument()
    expect(screen.getByText('Personnalisé')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Voir les commandes/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/team/members/1/permissions/', {
      permission: 'orders_view', enabled: false,
    }))
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- TeamPage`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Permissions"`

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/pages/TeamPage.jsx`, add a new component after `Modal` (before `MembersTable`):

```javascript
function MemberPermissionsModal({ member, onClose }) {
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(null)

  const fetchCatalog = () => {
    setLoading(true)
    api.get(`/team/members/${member.id}/permissions/`)
      .then(({ data }) => setCatalog(data.catalog))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCatalog() }, [])

  const toggle = async (key, current) => {
    setSaving(key)
    setCatalog(c => c.map(e => e.key === key ? { ...e, enabled: !current } : e))
    try {
      await api.post(`/team/members/${member.id}/permissions/`, { permission: key, enabled: !current })
      fetchCatalog()
    } catch (err) {
      setCatalog(c => c.map(e => e.key === key ? { ...e, enabled: current } : e))
      alert(err.response?.data?.detail || 'Erreur lors de la mise à jour.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-xl border p-6 max-h-[90vh] overflow-y-auto" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-200">
            Permissions — {member.first_name} {member.last_name}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 py-6 text-center">Chargement…</p>
        ) : (
          <div className="rounded-lg border divide-y" style={{ borderColor: theme.dark.border }}>
            {catalog.map(({ key, label, enabled, is_custom }) => (
              <div key={key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggle(key, enabled)}
                  disabled={saving === key}
                  className="text-sm text-gray-300 text-left flex items-center gap-2 disabled:opacity-60"
                >
                  {label}
                  {is_custom && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-600/20 text-violet-300">
                      Personnalisé
                    </span>
                  )}
                </button>
                <button
                  onClick={() => toggle(key, enabled)}
                  disabled={saving === key}
                  className={`w-9 h-5 rounded-full transition-colors duration-150 relative cursor-pointer disabled:opacity-60 shrink-0 ${enabled ? 'bg-violet-600' : 'bg-white/10'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-150 ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

Update `MembersTable` to accept an `onManagePermissions` prop and add the button (replace the `<td className="py-3">` actions cell, current lines 181-188):

```javascript
              <td className="py-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onManagePermissions(m)}
                    className="text-xs text-gray-400 hover:text-gray-200 transition"
                  >
                    Permissions
                  </button>
                  <button
                    onClick={() => onToggle(m)}
                    className="text-xs text-red-400 hover:text-red-300 transition"
                  >
                    Désactiver
                  </button>
                </div>
              </td>
```

Update the `MembersTable` function signature (line 137):

```javascript
function MembersTable({ members, onToggle, onManagePermissions }) {
```

In `TeamPage`, add state and wire the prop (inside the `export default function TeamPage()` body, near existing `useState` declarations):

```javascript
  const [permissionsMember, setPermissionsMember] = useState(null)
```

Update the `MembersTable` usage (current line 288) to pass the new prop, and render the modal alongside the existing invite `Modal` (near the top of the JSX return, after the existing `{showModal && ...}` block):

```javascript
      {permissionsMember && (
        <MemberPermissionsModal
          member={permissionsMember}
          onClose={() => setPermissionsMember(null)}
        />
      )}
```

```javascript
          <MembersTable members={members} onToggle={handleToggle} onManagePermissions={setPermissionsMember} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- TeamPage`
Expected: PASS — all `TeamPage` tests pass

- [ ] **Step 5: Run the full frontend test suite to check for regressions**

Run: `cd frontend && npm run test`
Expected: OK, all tests pass (no other file references `MembersTable` or `TeamPage` internals)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/TeamPage.jsx frontend/src/tests/pages/TeamPage.test.jsx
git commit -m "feat: modal de permissions individuelles par membre depuis TeamPage"
```

---

## Post-plan checklist (not a task — reminder for the orchestrating session)

- Update `CLAUDE.md` per the project's epic workflow (new model, new endpoint, new UI, decision: cascade member > role > default) — required before requesting user validation, per project rule.
- Do **not** commit the `CLAUDE.md` update to a new branch or push/merge anything without the user's explicit go-ahead (per `feedback_commit_approval.md` memory and CLAUDE.md rule 4).
- Full verification before declaring done: `cd backend && venv/Scripts/python manage.py test` and `cd frontend && npm run build && npm run test`.
