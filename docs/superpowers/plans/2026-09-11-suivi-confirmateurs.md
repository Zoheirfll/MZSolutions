# Suivi IA des confirmateurs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un suivi de performance + détection d'anomalie pour les confirmateurs — signaux 100% déterministes, avec une synthèse IA individuelle et une synthèse d'équipe générées à la demande, jamais mises en cache.

**Architecture:** Module pur `team/monitoring.py` (aucun appel réseau, aucun appel IA), consommé par 4 endpoints (`team/views.py`) et une nouvelle page dashboard sous le menu IA.

**Tech Stack:** Django 5.2 + DRF (backend existant), React 18 (frontend existant).

## Global Constraints

- Aucun calcul de chiffre par un LLM — uniquement du calcul Python déterministe ; le LLM ne fait que rédiger une synthèse à partir de chiffres déjà calculés, jamais l'historique brut d'appels/commandes.
- Fenêtre glissante fixe de 30 jours, aucun réglage configurable en v1.
- `confirmation_rate`/`cancellation_return_rate` utilisent le même dénominateur `processed` (commandes traitées) — réutiliser `orders.views._PROCESSED_STATUSES_FOR_CHOICES` et la logique de `ConfirmationRateView` telle quelle, ne pas la dupliquer différemment.
- Chaque drapeau d'anomalie a ses propres gardes anti-bruit (minimum de commandes/confirmateurs) — jamais un drapeau déclenché sur un échantillon trop petit pour être significatif.
- **Aucun cache** sur les 2 endpoints d'explication IA (contrairement à l'audit boutique) — recalcul complet à chaque appel.
- Nouvelle permission `confirmateur_monitoring_view`, masquée par défaut confirmateur/dropshipper.
- Tests obligatoires par tâche, commits fréquents, jamais `git add -A`. Avant chaque `git add` sur un fichier partagé (`team/models.py`, `team/views.py`, `team/urls.py`, `App.jsx`, `DashboardLayout.jsx`), vérifier `git diff <fichier>` pour isoler son propre diff d'un éventuel travail en cours d'un autre terminal.

---

## File Structure

```
backend/
  team/
    monitoring.py            — compute_team_overview()/compute_confirmateur_detail() purs (nouveau)
    models.py                   — permission confirmateur_monitoring_view (modifié)
    views.py                     — 4 vues (modifié)
    urls.py                       — 4 routes (modifié)
    tests.py                       — tests des 2 tâches backend (modifié)

frontend/src/
  pages/team/ConfirmateurMonitoringPage.jsx  — nouvelle page (nouveau)
  tests/pages/team/ConfirmateurMonitoringPage.test.jsx — tests (nouveau)
  App.jsx                                        — route + import (modifié)
  components/DashboardLayout.jsx                — lien sidebar sous IA (modifié)

CLAUDE.md — section Assistant IA étendue (modifié, dernière tâche)
```

---

### Task 1: `monitoring.py` — signaux déterministes purs

**Files:**
- Create: `backend/team/monitoring.py`
- Test: `backend/team/tests.py`

**Interfaces:**
- Produces:
  - `compute_team_overview(store) -> list[dict]` : `[{'member_id': int, 'name': str, 'score': int|None, 'orders_assigned': int, 'flags': list[str]}, ...]`
  - `compute_confirmateur_detail(store, member) -> dict` : `{'member_id', 'name', 'score', 'confirmation_rate', 'late_ratio', 'call_failure_rate', 'orders_assigned', 'cancellation_return_rate', 'flags': list[str]}`

- [ ] **Step 1: Vérifier les imports déjà présents dans `backend/team/tests.py`**

Run: `Get-Content backend/team/tests.py -TotalCount 15` (ou `head -15`) — confirmer `make_owner`/`make_team_member`/`auth_client` déjà importés (attendu, voir `core/test_utils.py`). Ajouter tout import manquant en tête de fichier, même style que le reste du fichier.

- [ ] **Step 2: Écrire les tests**

Ajouter à `backend/team/tests.py` :
```python
class ConfirmateurMonitoringEngineTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conf, _ = make_team_member(self.store, 'confirmateur')

    def _make_order(self, status, days_ago=1, assign=True):
        from django.utils import timezone
        from orders.models import Order, OrderAssignment
        o = Order.objects.create(
            store=self.store, first_name='C', last_name='L', phone='0555000000',
            wilaya='Alger', commune='Alger Centre', address='Adr', status=status,
            subtotal=1000, shipping_cost=0, total=1000,
        )
        o.created_at = timezone.now() - timezone.timedelta(days=days_ago)
        o.save(update_fields=['created_at'])
        if assign:
            OrderAssignment.objects.create(order=o, confirmateur=self.conf)
        return o

    def test_confirmation_rate_uses_processed_denominator(self):
        from team.monitoring import compute_confirmateur_detail
        self._make_order('confirmed')
        self._make_order('confirmed')
        self._make_order('cancelled')
        self._make_order('pending')  # non traitée, exclue du dénominateur
        detail = compute_confirmateur_detail(self.store, self.conf)
        # processed = 3 (confirmed, confirmed, cancelled), confirmed = 2 -> 66.7%
        self.assertAlmostEqual(detail['confirmation_rate'], 66.7, delta=0.5)

    def test_score_none_without_processed_orders(self):
        from team.monitoring import compute_confirmateur_detail
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertIsNone(detail['score'])

    def test_late_ratio_computed_on_pending_only(self):
        from django.utils import timezone
        from team.monitoring import compute_confirmateur_detail
        late = self._make_order('pending')
        late.created_at = timezone.now() - timezone.timedelta(hours=48)
        late.save(update_fields=['created_at'])
        self._make_order('pending')  # pas en retard
        self._make_order('confirmed')
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertAlmostEqual(detail['late_ratio'], 0.5, delta=0.01)

    def test_call_failure_rate(self):
        from orders.models import CallAttempt, FailureReason
        from team.monitoring import compute_confirmateur_detail
        o = self._make_order('confirmed')
        reason = FailureReason.objects.create(store=self.store, label='Injoignable')
        CallAttempt.objects.create(order=o, agent=self.conf, status='no_answer', failure_reason=reason)
        CallAttempt.objects.create(order=o, agent=self.conf, status='answered')
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertAlmostEqual(detail['call_failure_rate'], 0.5, delta=0.01)

    def test_cancellation_return_rate(self):
        from team.monitoring import compute_confirmateur_detail
        self._make_order('confirmed')
        self._make_order('cancelled')
        self._make_order('returned')
        self._make_order('delivered')
        detail = compute_confirmateur_detail(self.store, self.conf)
        # processed = 4, cancelled+returned = 2 -> 50%
        self.assertAlmostEqual(detail['cancellation_return_rate'], 50.0, delta=0.5)

    def test_flag_inactive_online_without_recent_audit_log(self):
        from team.monitoring import compute_confirmateur_detail
        self.conf.is_online = True
        self.conf.last_seen_at = None
        self.conf.save(update_fields=['is_online'])
        self._make_order('confirmed')
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertIn('inactive_online', detail['flags'])

    def test_flag_high_late_ratio(self):
        from django.utils import timezone
        from team.monitoring import compute_confirmateur_detail
        for _ in range(3):
            late = self._make_order('pending')
            late.created_at = timezone.now() - timezone.timedelta(hours=48)
            late.save(update_fields=['created_at'])
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertIn('high_late_ratio', detail['flags'])

    def test_flag_high_cancellation_requires_minimum_five_orders(self):
        from team.monitoring import compute_confirmateur_detail
        self._make_order('cancelled')
        self._make_order('cancelled')
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertNotIn('high_cancellation', detail['flags'])

    def test_flag_high_cancellation_triggers_above_team_average(self):
        from team.monitoring import compute_confirmateur_detail
        conf2, _ = make_team_member(self.store, 'confirmateur', email='conf2@test.com')
        # conf2 : aucune annulation, 5 confirmées
        from orders.models import Order, OrderAssignment
        for _ in range(5):
            o = Order.objects.create(store=self.store, first_name='C', last_name='L', phone='0555000001',
                                      wilaya='Alger', commune='Alger Centre', address='Adr', status='confirmed',
                                      subtotal=1000, shipping_cost=0, total=1000)
            OrderAssignment.objects.create(order=o, confirmateur=conf2)
        # self.conf : 5 commandes traitées, 5 annulées -> 100%, largement au-dessus de la moyenne équipe
        for _ in range(5):
            self._make_order('cancelled')
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertIn('high_cancellation', detail['flags'])

    def test_flag_low_throughput_requires_at_least_two_confirmateurs(self):
        from team.monitoring import compute_confirmateur_detail
        self._make_order('confirmed')
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertNotIn('low_throughput', detail['flags'])

    def test_compute_team_overview_lists_all_confirmateurs(self):
        from team.monitoring import compute_team_overview
        conf2, _ = make_team_member(self.store, 'confirmateur', email='conf2@test.com')
        self._make_order('confirmed')
        overview = compute_team_overview(self.store)
        member_ids = [r['member_id'] for r in overview]
        self.assertIn(self.conf.id, member_ids)
        self.assertIn(conf2.id, member_ids)
```

⚠️ Vérifier la signature exacte de `make_team_member(store, role, email=None)` (`core/test_utils.py`, déjà confirmée dans une session précédente) — l'appel `make_team_member(self.store, 'confirmateur', email='conf2@test.com')` doit correspondre à cette signature exacte.

- [ ] **Step 3: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test team.tests.ConfirmateurMonitoringEngineTest -v 2`
Expected: `ModuleNotFoundError: No module named 'team.monitoring'`

- [ ] **Step 4: Implémenter `monitoring.py`**

```python
"""Suivi de performance et détection d'anomalie pour les confirmateurs —
calcul DÉTERMINISTE pur, aucun appel réseau, aucun appel IA.
Voir docs/superpowers/specs/2026-09-11-suivi-confirmateurs-design.md."""
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from orders.views import _PROCESSED_STATUSES_FOR_CHOICES

WINDOW_DAYS = 30
LATE_PENDING_HOURS = 24
INACTIVE_ONLINE_DAYS = 7
MIN_ORDERS_FOR_CANCELLATION_FLAG = 5
MIN_CONFIRMATEURS_FOR_THROUGHPUT_FLAG = 2
CONFIRMED_STATUSES = ['confirmed', 'shipped', 'delivered']


def _clamp(value):
    return max(0, min(100, round(value)))


def _raw_metrics(store, member, since):
    from orders.models import Order, CallAttempt

    assigned_qs = Order.objects.filter(store=store, assignment__confirmateur=member, created_at__gte=since)
    processed_qs = assigned_qs.filter(status__in=_PROCESSED_STATUSES_FOR_CHOICES)
    processed = processed_qs.count()
    confirmed = processed_qs.filter(status__in=CONFIRMED_STATUSES).count()
    cancelled_returned = processed_qs.filter(status__in=['cancelled', 'returned']).count()

    pending_qs = assigned_qs.filter(status='pending')
    pending_total = pending_qs.count()
    late_cutoff = timezone.now() - timedelta(hours=LATE_PENDING_HOURS)
    late_pending = pending_qs.filter(created_at__lte=late_cutoff).count()

    calls_qs = CallAttempt.objects.filter(agent=member, attempted_at__gte=since)
    calls_total = calls_qs.count()
    calls_failed = calls_qs.filter(failure_reason__isnull=False).count()

    return {
        'orders_assigned': processed,
        'confirmation_rate': round(confirmed / processed * 100, 1) if processed else None,
        'cancellation_return_rate': round(cancelled_returned / processed * 100, 1) if processed else None,
        'late_ratio': round(late_pending / pending_total, 3) if pending_total else 0.0,
        'call_failure_rate': round(calls_failed / calls_total, 3) if calls_total else 0.0,
    }


def _score(metrics):
    if metrics['confirmation_rate'] is None:
        return None
    value = metrics['confirmation_rate'] - metrics['late_ratio'] * 30 - metrics['call_failure_rate'] * 20
    return _clamp(value)


def _has_recent_audit_activity(member, since):
    from audit.models import AuditLog
    if not member.user_id:
        return False
    return AuditLog.objects.filter(actor=member.user, created_at__gte=since).exists()


def _compute_flags(member, metrics, team_avg_cancellation, team_avg_orders, confirmateur_count):
    flags = []
    inactive_since = timezone.now() - timedelta(days=INACTIVE_ONLINE_DAYS)
    if member.is_online and not _has_recent_audit_activity(member, inactive_since):
        flags.append('inactive_online')

    if metrics['late_ratio'] > 0.5:
        flags.append('high_late_ratio')

    if (metrics['orders_assigned'] >= MIN_ORDERS_FOR_CANCELLATION_FLAG and team_avg_cancellation is not None
            and metrics['cancellation_return_rate'] is not None
            and metrics['cancellation_return_rate'] >= team_avg_cancellation * 1.5):
        flags.append('high_cancellation')

    if (confirmateur_count >= MIN_CONFIRMATEURS_FOR_THROUGHPUT_FLAG and team_avg_orders
            and metrics['orders_assigned'] < team_avg_orders * 0.5):
        flags.append('low_throughput')

    return flags


def _active_confirmateurs(store):
    return list(store.team_members.filter(role='confirmateur', is_active=True))


def _team_averages(store, since):
    members = _active_confirmateurs(store)
    all_metrics = [_raw_metrics(store, m, since) for m in members]
    cancellation_values = [m['cancellation_return_rate'] for m in all_metrics
                            if m['orders_assigned'] >= MIN_ORDERS_FOR_CANCELLATION_FLAG and m['cancellation_return_rate'] is not None]
    orders_values = [m['orders_assigned'] for m in all_metrics]
    avg_cancellation = sum(cancellation_values) / len(cancellation_values) if cancellation_values else None
    avg_orders = sum(orders_values) / len(orders_values) if orders_values else None
    return avg_cancellation, avg_orders, len(members)


def compute_confirmateur_detail(store, member):
    since = timezone.now() - timedelta(days=WINDOW_DAYS)
    metrics = _raw_metrics(store, member, since)
    team_avg_cancellation, team_avg_orders, confirmateur_count = _team_averages(store, since)
    flags = _compute_flags(member, metrics, team_avg_cancellation, team_avg_orders, confirmateur_count)
    return {
        'member_id': member.id,
        'name': f"{member.first_name} {member.last_name}".strip(),
        'score': _score(metrics),
        'flags': flags,
        **metrics,
    }


def compute_team_overview(store):
    since = timezone.now() - timedelta(days=WINDOW_DAYS)
    members = _active_confirmateurs(store)
    team_avg_cancellation, team_avg_orders, confirmateur_count = _team_averages(store, since)
    results = []
    for member in members:
        metrics = _raw_metrics(store, member, since)
        flags = _compute_flags(member, metrics, team_avg_cancellation, team_avg_orders, confirmateur_count)
        results.append({
            'member_id': member.id,
            'name': f"{member.first_name} {member.last_name}".strip(),
            'score': _score(metrics),
            'orders_assigned': metrics['orders_assigned'],
            'flags': flags,
        })
    return results
```

⚠️ Vérifier le related_name exact utilisé par `Store` vers `TeamMember` (probablement `store.team_members` ou `store.teammember_set` — à confirmer par lecture de `team/models.py` avant d'écrire `_active_confirmateurs`, corriger le nom si besoin). Vérifier aussi `TeamMember.is_active` (nom de champ exact, déjà documenté dans CLAUDE.md comme existant).

- [ ] **Step 5: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test team.tests.ConfirmateurMonitoringEngineTest -v 2`
Expected: `Ran 11 tests ... OK`

- [ ] **Step 6: Commit**

```bash
git diff backend/team/tests.py | head -5
git add backend/team/monitoring.py backend/team/tests.py
git commit -m "feat(confirmateur-monitoring): signaux déterministes performance + anomalie

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Permission `confirmateur_monitoring_view`

**Files:**
- Modify: `backend/team/models.py`

- [ ] **Step 1: Vérifier le diff avant modification**

Run: `git diff backend/team/models.py`
Expected: vide.

- [ ] **Step 2: Ajouter au `PERMISSION_CATALOG`**

Juste après :
```python
    ('store_audit_view',            'Audit de la boutique'),
```
Ajouter :
```python
    ('confirmateur_monitoring_view', 'Suivi des confirmateurs'),
```

- [ ] **Step 3: Ajouter à `PERMISSION_CATEGORIES`**

Juste après :
```python
    'store_audit_view':             ('Ventes & finances', 'Statistiques'),
```
Ajouter :
```python
    'confirmateur_monitoring_view':  ('Ventes & finances', 'Statistiques'),
```

- [ ] **Step 4: Ajouter aux deux `DEFAULT_PERMISSIONS`**

Dans les deux occurrences de :
```python
        'stats_returns_forecast_view': False, 'recommendations_view': False, 'store_audit_view': False,
```
Remplacer par :
```python
        'stats_returns_forecast_view': False, 'recommendations_view': False, 'store_audit_view': False,
        'confirmateur_monitoring_view': False,
```

- [ ] **Step 5: Vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test team -v 1`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git diff backend/team/models.py
git add backend/team/models.py
git commit -m "feat(confirmateur-monitoring): permission confirmateur_monitoring_view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Endpoints backend

**Files:**
- Modify: `backend/team/views.py`
- Modify: `backend/team/urls.py`
- Test: `backend/team/tests.py`

**Interfaces:**
- Consumes: `team.monitoring.compute_team_overview/compute_confirmateur_detail` (Task 1), `confirmateur_monitoring_view` (Task 2), `ai_assistant.ollama_client.generate()`/`OllamaUnavailableError`.
- Produces: `GET /api/team/monitoring/`, `GET /api/team/monitoring/<int:pk>/`, `POST /api/team/monitoring/<int:pk>/explain/`, `POST /api/team/monitoring/team-explain/`.

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/team/tests.py` :
```python
class ConfirmateurMonitoringViewsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.client_ = auth_client(self.owner)
        self.conf, _ = make_team_member(self.store, 'confirmateur')

    def test_overview_requires_permission(self):
        other_conf, _ = make_team_member(self.store, 'confirmateur', email='other@test.com')
        client = auth_client(other_conf)
        resp = client.get('/api/team/monitoring/')
        self.assertEqual(resp.status_code, 403)

    def test_overview_lists_confirmateur(self):
        resp = self.client_.get('/api/team/monitoring/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn(self.conf.id, [r['member_id'] for r in resp.data['results']])

    def test_detail_404_for_non_confirmateur_member(self):
        admin, _ = make_team_member(self.store, 'admin')
        resp = self.client_.get(f'/api/team/monitoring/{admin.id}/')
        self.assertEqual(resp.status_code, 404)

    def test_detail_404_for_member_of_other_store(self):
        other_owner, other_store = make_owner()
        other_conf, _ = make_team_member(other_store, 'confirmateur')
        resp = self.client_.get(f'/api/team/monitoring/{other_conf.id}/')
        self.assertEqual(resp.status_code, 404)

    def test_detail_returns_computed_metrics(self):
        resp = self.client_.get(f'/api/team/monitoring/{self.conf.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['member_id'], self.conf.id)

    def test_explain_calls_ai(self):
        from unittest.mock import patch
        with patch('team.views.ollama_client.generate', return_value='Synthèse individuelle test.'):
            resp = self.client_.post(f'/api/team/monitoring/{self.conf.id}/explain/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['explanation'], 'Synthèse individuelle test.')

    def test_explain_returns_503_on_ai_failure(self):
        from unittest.mock import patch
        from ai_assistant.ollama_client import OllamaUnavailableError
        with patch('team.views.ollama_client.generate', side_effect=OllamaUnavailableError('down')):
            resp = self.client_.post(f'/api/team/monitoring/{self.conf.id}/explain/')
        self.assertEqual(resp.status_code, 503)

    def test_team_explain_calls_ai(self):
        from unittest.mock import patch
        with patch('team.views.ollama_client.generate', return_value='Synthèse équipe test.'):
            resp = self.client_.post('/api/team/monitoring/team-explain/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['explanation'], 'Synthèse équipe test.')
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `venv/Scripts/python manage.py test team.tests.ConfirmateurMonitoringViewsTest -v 2`
Expected: `404` sur chaque test (routes inexistantes).

- [ ] **Step 3: Ajouter les imports nécessaires dans `team/views.py`**

Vérifier d'abord qu'aucun import `ollama_client` n'existe déjà dans ce fichier. Ajouter avec les imports existants en tête :
```python
from ai_assistant import ollama_client
from ai_assistant.ollama_client import OllamaUnavailableError
```

- [ ] **Step 4: Ajouter les 4 vues**

À la fin de `backend/team/views.py` :
```python
class ConfirmateurMonitoringOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'confirmateur_monitoring_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        from .monitoring import compute_team_overview
        return Response({'results': compute_team_overview(store)})


class ConfirmateurMonitoringDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not (is_owner_or_admin(request) or has_permission(request, 'confirmateur_monitoring_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            member = store.team_members.get(pk=pk, role='confirmateur')
        except TeamMember.DoesNotExist:
            return Response({'detail': 'Confirmateur introuvable.'}, status=404)
        from .monitoring import compute_confirmateur_detail
        return Response(compute_confirmateur_detail(store, member))


FLAG_LABELS = {
    'inactive_online': "en ligne mais aucune activité enregistrée récemment",
    'high_late_ratio': "plus de la moitié de ses commandes en attente sont en retard",
    'high_cancellation': "taux d'annulation/retour nettement supérieur à la moyenne de l'équipe",
    'low_throughput': "rythme de traitement très inférieur au reste de l'équipe",
}


class ConfirmateurMonitoringExplainView(APIView):
    """Synthèse IA individuelle — JAMAIS de cache, recalculée à chaque appel
    (les moyennes d'équipe évoluent en continu). Le prompt ne reçoit que les
    chiffres déjà calculés, jamais l'historique brut d'appels/commandes."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not (is_owner_or_admin(request) or has_permission(request, 'confirmateur_monitoring_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            member = store.team_members.get(pk=pk, role='confirmateur')
        except TeamMember.DoesNotExist:
            return Response({'detail': 'Confirmateur introuvable.'}, status=404)

        from .monitoring import compute_confirmateur_detail
        detail = compute_confirmateur_detail(store, member)
        flags_fr = ', '.join(FLAG_LABELS.get(f, f) for f in detail['flags']) or 'aucun'
        prompt = (
            f"Le confirmateur {detail['name']} a un score de performance de {detail['score']}/100. "
            f"Taux de confirmation : {detail['confirmation_rate']}%. Commandes traitées sur 30 jours : "
            f"{detail['orders_assigned']}. Taux d'échec d'appel : {round(detail['call_failure_rate'] * 100, 1)}%. "
            f"Part de commandes en attente en retard : {round(detail['late_ratio'] * 100, 1)}%. "
            f"Signaux d'alerte déclenchés : {flags_fr}.\n"
            "Explique en 2-3 phrases, en français, la performance de ce confirmateur — base-toi UNIQUEMENT "
            "sur les chiffres fournis, n'invente aucune autre information."
        )
        try:
            explanation = ollama_client.generate(prompt)
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)
        return Response({'explanation': explanation.strip()})


class ConfirmateurMonitoringTeamExplainView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'confirmateur_monitoring_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        from .monitoring import compute_team_overview
        overview = compute_team_overview(store)
        if not overview:
            lines = ["Aucun confirmateur actif dans cette boutique."]
        else:
            lines = [f"Équipe de {len(overview)} confirmateur(s) :"]
            for r in overview:
                flags_fr = ', '.join(FLAG_LABELS.get(f, f) for f in r['flags']) or 'aucun'
                lines.append(f"- {r['name']} : score {r['score']}/100, {r['orders_assigned']} commande(s) traitée(s), signaux : {flags_fr}.")
        lines.append(
            "Rédige en français, de façon concise (5 phrases maximum), une synthèse qui nomme qui se démarque "
            "en bien et qui nécessite de l'attention — base-toi UNIQUEMENT sur ces chiffres, n'invente rien d'autre."
        )
        prompt = '\n'.join(lines)

        try:
            explanation = ollama_client.generate(prompt)
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)
        return Response({'explanation': explanation.strip()})
```

⚠️ Vérifier que `TeamMember` est déjà importé en tête de `team/views.py` (attendu, déjà utilisé par d'autres vues du fichier).

- [ ] **Step 5: Enregistrer les routes**

Dans `backend/team/urls.py` :
```python
from .views import (
    InviteView, TeamListView, TeamMemberDetailView, AcceptInvitationView,
    RolePermissionsView, TeamMemberPermissionsView, OnlineStatusView,
    TeamMemberReactivateView, TeamMemberResendInviteView,
    ConfirmateurMonitoringOverviewView, ConfirmateurMonitoringDetailView,
    ConfirmateurMonitoringExplainView, ConfirmateurMonitoringTeamExplainView,
)

urlpatterns = [
    path('invite/',                            InviteView.as_view()),
    path('members/',                           TeamListView.as_view()),
    path('members/<int:pk>/',                  TeamMemberDetailView.as_view()),
    path('members/<int:pk>/permissions/',      TeamMemberPermissionsView.as_view()),
    path('members/<int:pk>/reactivate/',       TeamMemberReactivateView.as_view()),
    path('members/<int:pk>/resend-invite/',    TeamMemberResendInviteView.as_view()),
    path('accept-invitation/',                 AcceptInvitationView.as_view()),
    path('permissions/',                       RolePermissionsView.as_view()),
    path('online-status/',                     OnlineStatusView.as_view()),
    path('monitoring/',                        ConfirmateurMonitoringOverviewView.as_view()),
    path('monitoring/team-explain/',           ConfirmateurMonitoringTeamExplainView.as_view()),
    path('monitoring/<int:pk>/',               ConfirmateurMonitoringDetailView.as_view()),
    path('monitoring/<int:pk>/explain/',       ConfirmateurMonitoringExplainView.as_view()),
]
```

⚠️ `monitoring/team-explain/` doit être déclaré **avant** `monitoring/<int:pk>/` dans la liste — sinon Django pourrait tenter de matcher `team-explain` comme une valeur de `pk` (échouerait proprement avec un converter `int`, mais autant éviter l'ambiguïté en respectant l'ordre indiqué).

- [ ] **Step 6: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test team.tests.ConfirmateurMonitoringViewsTest -v 2`
Expected: `Ran 7 tests ... OK`

- [ ] **Step 7: Run toute la suite `team` pour vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test team -v 1 --noinput`
Expected: `OK`.

- [ ] **Step 8: Commit**

```bash
git diff backend/team/views.py backend/team/urls.py
git add backend/team/views.py backend/team/urls.py backend/team/tests.py
git commit -m "feat(confirmateur-monitoring): endpoints overview/détail/explication IA

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — page `ConfirmateurMonitoringPage.jsx`

**Files:**
- Create: `frontend/src/pages/team/ConfirmateurMonitoringPage.jsx`
- Test: `frontend/src/tests/pages/team/ConfirmateurMonitoringPage.test.jsx`

**Interfaces:**
- Consumes: `GET /team/monitoring/` → `{results: [{member_id, name, score, orders_assigned, flags}]}`, `GET /team/monitoring/<id>/` → détail complet, `POST /team/monitoring/<id>/explain/` → `{explanation}`, `POST /team/monitoring/team-explain/` → `{explanation}`.

- [ ] **Step 1: Écrire les tests**

```jsx
// frontend/src/tests/pages/team/ConfirmateurMonitoringPage.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ConfirmateurMonitoringPage from '../../../pages/team/ConfirmateurMonitoringPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
import api from '../../../api/axios'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

const OVERVIEW = { results: [
  { member_id: 1, name: 'Sara Confirmatrice', score: 78, orders_assigned: 40, flags: [] },
  { member_id: 2, name: 'Karim Confirmateur', score: 35, orders_assigned: 5, flags: ['high_late_ratio', 'high_cancellation'] },
] }

const DETAIL = {
  member_id: 2, name: 'Karim Confirmateur', score: 35, confirmation_rate: 40.0,
  late_ratio: 0.6, call_failure_rate: 0.3, orders_assigned: 5, cancellation_return_rate: 60.0,
  flags: ['high_late_ratio', 'high_cancellation'],
}

function mockGet() {
  api.get.mockImplementation((url) => {
    if (url.includes('/team/monitoring/2/')) return Promise.resolve({ data: DETAIL })
    if (url.includes('/team/monitoring/')) return Promise.resolve({ data: OVERVIEW })
    return Promise.resolve({ data: { count: 0 } })
  })
}

describe('ConfirmateurMonitoringPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche le tableau des confirmateurs avec score et drapeaux', async () => {
    mockGet()
    render(<MemoryRouter><ConfirmateurMonitoringPage /></MemoryRouter>)
    expect(await screen.findByText('Sara Confirmatrice')).toBeInTheDocument()
    expect(screen.getByText('Karim Confirmateur')).toBeInTheDocument()
  })

  it('déplie la fiche détaillée au clic sur une ligne', async () => {
    mockGet()
    render(<MemoryRouter><ConfirmateurMonitoringPage /></MemoryRouter>)
    await screen.findByText('Karim Confirmateur')
    fireEvent.click(screen.getByText('Karim Confirmateur'))
    expect(await screen.findByText(/40%/)).toBeInTheDocument()
  })

  it('affiche la synthèse IA individuelle au clic sur Analyser', async () => {
    mockGet()
    api.post.mockResolvedValueOnce({ data: { explanation: 'Ce confirmateur a des retards fréquents.' } })
    render(<MemoryRouter><ConfirmateurMonitoringPage /></MemoryRouter>)
    await screen.findByText('Karim Confirmateur')
    fireEvent.click(screen.getByText('Karim Confirmateur'))
    await screen.findByText(/40%/)
    fireEvent.click(screen.getByRole('button', { name: /Analyser$/ }))
    await waitFor(() => expect(screen.getByText(/retards fréquents/)).toBeInTheDocument())
  })

  it('affiche la synthèse IA équipe au clic sur "Analyser l\'équipe"', async () => {
    mockGet()
    api.post.mockResolvedValueOnce({ data: { explanation: "Sara se démarque positivement, Karim nécessite de l'attention." } })
    render(<MemoryRouter><ConfirmateurMonitoringPage /></MemoryRouter>)
    await screen.findByText('Sara Confirmatrice')
    fireEvent.click(screen.getByRole('button', { name: /Analyser l'équipe/ }))
    await waitFor(() => expect(screen.getByText(/nécessite de l'attention/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd frontend && npm run test -- ConfirmateurMonitoringPage`
Expected: échec (module inexistant).

- [ ] **Step 3: Créer `ConfirmateurMonitoringPage.jsx`**

```jsx
import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

const FLAG_LABELS = {
  inactive_online: 'En ligne mais inactif',
  high_late_ratio: 'Beaucoup de retards',
  high_cancellation: "Taux d'annulation élevé",
  low_throughput: 'Rythme très faible',
}

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className={theme.badge.neutral}>—</span>
  if (score < 50) return <span className={theme.badge.danger}>{score}</span>
  if (score < 75) return <span className={theme.badge.warning}>{score}</span>
  return <span className={theme.badge.success}>{score}</span>
}

function FlagBadges({ flags }) {
  if (!flags || flags.length === 0) return <span className={theme.badge.success}>RAS</span>
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map(f => <span key={f} className={theme.badge.warning}>{FLAG_LABELS[f] || f}</span>)}
    </div>
  )
}

function ConfirmateurRow({ row }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState(null)
  const [explanation, setExplanation] = useState(null)
  const [loadingExplain, setLoadingExplain] = useState(false)

  const toggle = () => {
    setExpanded(e => !e)
    if (!detail) {
      api.get(`/team/monitoring/${row.member_id}/`).then(({ data }) => setDetail(data)).catch(() => {})
    }
  }

  const explain = () => {
    setLoadingExplain(true)
    api.post(`/team/monitoring/${row.member_id}/explain/`)
      .then(({ data }) => setExplanation(data.explanation))
      .catch(() => setExplanation('Explication indisponible pour le moment.'))
      .finally(() => setLoadingExplain(false))
  }

  return (
    <div className="rounded-xl border" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <button onClick={toggle} className="w-full flex items-center justify-between p-4 cursor-pointer">
        <span className="text-sm font-medium text-app-primary">{row.name}</span>
        <span className="flex items-center gap-3">
          <span className="text-xs text-app-muted">{row.orders_assigned} commande(s)</span>
          <FlagBadges flags={row.flags} />
          <ScoreBadge score={row.score} />
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t pt-4 space-y-3" style={{ borderColor: theme.dark.border }}>
          {!detail ? <p className="text-xs text-app-muted">Chargement…</p> : (
            <>
              <p className="text-xs text-app-muted-light">
                Taux de confirmation : {detail.confirmation_rate}% · Retards : {Math.round(detail.late_ratio * 100)}% ·
                Échec d'appel : {Math.round(detail.call_failure_rate * 100)}% · Annulation/retour : {detail.cancellation_return_rate}%
              </p>
              {explanation ? (
                <p className="text-xs text-app-muted-light">{explanation}</p>
              ) : (
                <button onClick={explain} disabled={loadingExplain} className="text-xs text-violet-400 hover:underline">
                  {loadingExplain ? '…' : 'Analyser'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function ConfirmateurMonitoringPage() {
  const [overview, setOverview] = useState([])
  const [loading, setLoading] = useState(true)
  const [teamExplanation, setTeamExplanation] = useState(null)
  const [loadingTeamExplain, setLoadingTeamExplain] = useState(false)

  useEffect(() => {
    api.get('/team/monitoring/')
      .then(({ data }) => setOverview(data.results || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const explainTeam = () => {
    setLoadingTeamExplain(true)
    api.post('/team/monitoring/team-explain/')
      .then(({ data }) => setTeamExplanation(data.explanation))
      .catch(() => setTeamExplanation('Explication indisponible pour le moment.'))
      .finally(() => setLoadingTeamExplain(false))
  }

  return (
    <DashboardLayout title="Suivi des confirmateurs" subtitle="Performance et signaux d'anomalie calculés sur les 30 derniers jours — synthèse IA rédigée à partir de ces chiffres, jamais inventée.">
      {loading ? <p className="text-sm text-app-muted">Chargement…</p> : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={explainTeam} disabled={loadingTeamExplain} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
              {loadingTeamExplain ? 'Analyse en cours…' : "Analyser l'équipe"}
            </button>
          </div>
          {teamExplanation && (
            <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <p className="text-sm text-app-muted-light">{teamExplanation}</p>
            </div>
          )}
          {overview.length === 0 ? (
            <p className="text-sm text-app-muted">Aucun confirmateur actif.</p>
          ) : (
            <div className="space-y-3">
              {overview.map(row => <ConfirmateurRow key={row.member_id} row={row} />)}
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npm run test -- ConfirmateurMonitoringPage`
Expected: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/team/ConfirmateurMonitoringPage.jsx frontend/src/tests/pages/team/ConfirmateurMonitoringPage.test.jsx
git commit -m "feat(confirmateur-monitoring): page dashboard Suivi des confirmateurs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Route + sidebar

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/DashboardLayout.jsx`

**Interfaces:**
- Consumes: `ConfirmateurMonitoringPage` (Task 4), permission `confirmateur_monitoring_view` (Task 2).

- [ ] **Step 1: Vérifier le diff avant modification**

Run: `git diff frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx`
Expected: vide.

- [ ] **Step 2: Ajouter l'import et la route dans `App.jsx`**

Juste après :
```jsx
import StoreAuditPage from './pages/orders/StoreAuditPage'
```
Ajouter :
```jsx
import ConfirmateurMonitoringPage from './pages/team/ConfirmateurMonitoringPage'
```
Juste après la route `/dashboard/audit-boutique`, ajouter :
```jsx
          <Route path="/dashboard/suivi-confirmateurs"         element={<PD perm="confirmateur_monitoring_view"><ConfirmateurMonitoringPage /></PD>} />
```

- [ ] **Step 3: Run le test qui vérifie que toute route a bien `perm=`**

Run: `cd frontend && npm run test -- App.test`
Expected: `PASS`.

- [ ] **Step 4: Ajouter le lien sidebar dans le bloc IA**

Dans `frontend/src/components/DashboardLayout.jsx`, remplacer :
```jsx
          {(can('ai_assistant_view') || can('stats_forecast_view') || can('stats_returns_forecast_view') || can('recommendations_view') || can('store_audit_view')) && (
```
par :
```jsx
          {(can('ai_assistant_view') || can('stats_forecast_view') || can('stats_returns_forecast_view') || can('recommendations_view') || can('store_audit_view') || can('confirmateur_monitoring_view')) && (
```
Et ajouter, juste après le lien "Audit de la boutique" :
```jsx
                {can('confirmateur_monitoring_view') && (
                  <li>{mainLink('/dashboard/suivi-confirmateurs', ICONS.stats, 'Suivi des confirmateurs')}</li>
                )}
```

- [ ] **Step 5: Run les tests concernés**

Run: `npm run test -- DashboardLayout App.test ConfirmateurMonitoringPage`
Expected: `PASS`.

- [ ] **Step 6: Commit**

```bash
git diff frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx
git add frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx
git commit -m "feat(confirmateur-monitoring): route + lien sidebar sous IA

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Suite complète + documentation + déploiement

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Lancer la suite backend complète**

```bash
cd backend
venv/Scripts/python manage.py test team products orders stores -v 1 --noinput
```
Expected: `OK`. Si erreur de connexion à `test_mzsolutions`, nettoyer :
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
Expected: tous les tests passent (aucune régression sur les ~421+ tests déjà en place).

- [ ] **Step 3: Étendre `CLAUDE.md`**

Localiser le paragraphe de clôture de l'audit boutique et ajouter juste après son "Testé via..." :
```markdown
**Suivi IA des confirmateurs (2026-09, 7ème chantier IA)** — signaux 100% déterministes (`team/monitoring.py::compute_team_overview()`/`compute_confirmateur_detail()`, aucun appel IA dans le calcul), fenêtre glissante de 30 jours : taux de confirmation (même dénominateur `processed` que `ConfirmationRateView`), part de commandes en retard >24h, taux d'échec d'appel (`CallAttempt.failure_reason`), taux d'annulation/retour. Score de performance = taux de confirmation pénalisé par les retards et les échecs d'appel. 4 drapeaux d'anomalie avec gardes anti-bruit (minimum de commandes/confirmateurs avant de se déclencher) : en ligne mais inactif (`audit.AuditLog`), retards fréquents, taux d'annulation nettement supérieur à la moyenne d'équipe, rythme de traitement très faible. Page `pages/team/ConfirmateurMonitoringPage.jsx`, permission `confirmateur_monitoring_view`, sous le menu IA — tableau vue d'ensemble avec fiche détaillée dépliable par confirmateur. Synthèse IA individuelle et synthèse d'équipe générées à la demande, **aucun cache** (contrairement à l'audit boutique — les moyennes d'équipe évoluent en continu).

Testé via `manage.py test team products orders stores` (X tests, dont Y dédiés au suivi confirmateurs) + suite frontend complète (Z tests, aucune régression).
```
Remplacer X/Y/Z par les chiffres réels.

- [ ] **Step 4: Commit la doc**

```bash
git diff CLAUDE.md
git add CLAUDE.md
git commit -m "docs: documente le suivi IA des confirmateurs (7ème chantier IA)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Pousser sur origin/main**

```bash
git push origin main
```

- [ ] **Step 6: Déployer sur le serveur de production**

Aucune migration Django (aucun nouveau modèle, `confirmateur_monitoring_view` est une entrée de dict Python dans `team/models.py`) — pas de backup pg_dump strictement nécessaire, mais en faire un par prudence puisque c'est la convention établie sur tous les chantiers précédents :
```bash
SSH_KEY="C:\Users\filali\Downloads\Key server MZSolutions\mzsolutions-key.pem"
ssh -i "$SSH_KEY" ubuntu@mzsol.online "cd /home/ubuntu/mzsolutions && mkdir -p ~/backups && docker compose exec -T db pg_dump -U mzsolutions mzsolutions > ~/backups/pre_confirmateur_monitoring_\$(date +%Y%m%d_%H%M%S).sql"
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

Même méthode que les chantiers précédents (créer un owner/store/confirmateur/commandes de test avec des identifiants uniques via `uuid`, appeler l'endpoint via `APIClient` avec `SERVER_NAME='mzsol.online', secure=True`, nettoyer les données de test créées) — vérifier au minimum que `GET /api/team/monitoring/` répond `200` pour un compte owner réel.

- [ ] **Step 9: Rapport final**

Résumer à l'utilisateur : nombre de tests backend/frontend, ce qui a été déployé.
