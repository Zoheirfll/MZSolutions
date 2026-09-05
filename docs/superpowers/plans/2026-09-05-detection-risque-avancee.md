# Détection de risque avancée — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calculer un score de risque déterministe (0-100, 4 signaux pondérés) sur chaque nouvelle commande, avec une explication IA optionnelle générée à la demande et mise en cache.

**Architecture:** Un module pur `orders/risk_scoring.py` (aucun appel réseau) calcule score+signaux à partir de l'historique du téléphone dans la boutique, appelé juste après `order.recalculate()` dans les deux points de création de commande. Un nouvel endpoint génère l'explication en langage naturel via `ai_assistant/ollama_client.py::generate()` (le même client multi-fournisseur que les 2 chantiers IA précédents), mise en cache sur `Order.risk_explanation`.

**Tech Stack:** Django 5.2 + DRF (backend existant), React 18 (frontend existant), Tailwind + `theme.js`.

## Global Constraints

- Le score est **toujours** calculé par du code Python déterministe — aucun appel IA n'intervient dans son calcul, jamais.
- Jamais de blocage automatique de commande sur la base de ce score — signalement uniquement.
- `CustomerRisk`/`BlacklistedPhone` restent strictement inchangés — le score est additionnel, pas une fusion.
- L'explication IA est générée **à la demande uniquement**, jamais à la création de commande, et mise en cache de façon permanente sur la commande (jamais régénérée automatiquement).
- Le prompt de l'explication ne contient que le score + les signaux déjà calculés — jamais l'historique brut du client (anti-invention).
- Toute panne IA → `503 {"detail": "Assistant IA indisponible"}`, jamais un 500 ; `risk_score`/`risk_signals` restent toujours disponibles indépendamment de l'IA.
- Tests obligatoires par tâche, commits fréquents, jamais `git add -A`.

---

## File Structure

```
backend/
  orders/
    risk_scoring.py       — compute_risk_score() pur, aucune I/O (nouveau)
    models.py              — Order + risk_score/risk_signals/risk_explanation (modifié)
    migrations/00XX_...    — migration correspondante (créée)
    views.py               — OrderListCreateView/PublicOrderView appellent compute_risk_score() ;
                              nouveau OrderRiskExplanationView (modifié)
    serializers.py          — OrderSerializer/OrderDetailSerializer exposent les nouveaux champs (modifié)
    urls.py                 — route risk-explanation (modifié)
    tests.py                 — tests des 5 tâches backend (modifié)

frontend/src/
  components/RiskScoreBadge.jsx        — badge 3 bandes (nouveau)
  pages/orders/OrdersPage.jsx           — colonne RISQUE (modifié)
  pages/orders/OrderDetailPage.jsx      — encart score + signaux + bouton explication (modifié)
  pages/customers/AtRiskCustomersPage.jsx — colonne score max (modifié)
  tests/components/RiskScoreBadge.test.jsx (nouveau)
  tests/pages/orders/OrderDetailPage.test.jsx (modifié, cas existant déjà présent)
  tests/pages/customers/AtRiskCustomersPage.test.jsx (modifié)

CLAUDE.md — section Assistant IA étendue (modifié)
```

---

### Task 1: `risk_scoring.py` — calcul déterministe pur

**Files:**
- Create: `backend/orders/risk_scoring.py`
- Test: `backend/orders/tests.py`

**Interfaces:**
- Consumes: `orders.models.Order` (requêtes en lecture uniquement, `store.orders.filter(phone=...)`), `stores.models.StoreSettings.risk_threshold_orders`/`risk_period_days`.
- Produces: `risk_scoring.compute_risk_score(store, phone, wilaya, commune, total) -> tuple[int, list[str]]`. Codes de signaux possibles : `'cancel_return_rate'`, `'unusual_frequency'`, `'unusual_amount'`, `'location_mismatch'`.

- [ ] **Step 1: Écrire les tests (un par signal, isolé)**

Ajouter à `backend/orders/tests.py` :
```python
class RiskScoringTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_no_history_low_score(self):
        from orders.risk_scoring import compute_risk_score
        score, signals = compute_risk_score(self.store, '0555000001', 'Alger', 'Alger Centre', 3000)
        self.assertEqual(signals, [])
        self.assertEqual(score, 0)

    def test_cancel_return_rate_signal(self):
        from orders.risk_scoring import compute_risk_score
        for _ in range(3):
            Order.objects.create(store=self.store, first_name='X', phone='0555000002',
                                  wilaya='Alger', status='cancelled', total=2000)
        score, signals = compute_risk_score(self.store, '0555000002', 'Alger', 'Alger Centre', 3000)
        self.assertIn('cancel_return_rate', signals)
        self.assertGreaterEqual(score, 40)

    def test_unusual_frequency_signal(self):
        from orders.risk_scoring import compute_risk_score
        for _ in range(3):
            Order.objects.create(store=self.store, first_name='X', phone='0555000003',
                                  wilaya='Alger', status='pending', total=2000)
        score, signals = compute_risk_score(self.store, '0555000003', 'Alger', 'Alger Centre', 3000)
        self.assertIn('unusual_frequency', signals)

    def test_unusual_amount_signal_vs_customer_history(self):
        from orders.risk_scoring import compute_risk_score
        Order.objects.create(store=self.store, first_name='X', phone='0555000004',
                              wilaya='Alger', status='delivered', total=2000)
        score, signals = compute_risk_score(self.store, '0555000004', 'Alger', 'Alger Centre', 10000)
        self.assertIn('unusual_amount', signals)

    def test_unusual_amount_signal_vs_store_average_for_new_customer(self):
        from orders.risk_scoring import compute_risk_score
        for _ in range(3):
            Order.objects.create(store=self.store, first_name='X', phone='0555999999',
                                  wilaya='Alger', status='delivered', total=2000)
        score, signals = compute_risk_score(self.store, '0555000005', 'Alger', 'Alger Centre', 50000)
        self.assertIn('unusual_amount', signals)

    def test_location_mismatch_signal(self):
        from orders.risk_scoring import compute_risk_score
        Order.objects.create(store=self.store, first_name='X', phone='0555000006',
                              wilaya='Oran', status='delivered', total=2000)
        score, signals = compute_risk_score(self.store, '0555000006', 'Alger', 'Alger Centre', 3000)
        self.assertIn('location_mismatch', signals)

    def test_score_capped_at_100(self):
        from orders.risk_scoring import compute_risk_score
        for _ in range(5):
            Order.objects.create(store=self.store, first_name='X', phone='0555000007',
                                  wilaya='Oran', status='cancelled', total=2000)
        score, signals = compute_risk_score(self.store, '0555000007', 'Alger', 'Alger Centre', 100000)
        self.assertLessEqual(score, 100)
        self.assertEqual(len(signals), 4)
```

Vérifier en tête de `backend/orders/tests.py` que `Order` et `make_owner` sont déjà importés (c'est le cas — fichier existant) ; sinon ajouter `from .models import Order` et `from core.test_utils import make_owner`.

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test orders.tests.RiskScoringTest -v 2`
Expected: `ModuleNotFoundError: No module named 'orders.risk_scoring'`

- [ ] **Step 3: Implémenter `risk_scoring.py`**

```python
"""Score de risque avancé (0-100) par commande — calcul DÉTERMINISTE pur,
aucun appel réseau, aucun appel IA. 4 signaux pondérés (somme plafonnée à
100), chacun déclenché indépendamment sur l'historique du téléphone dans
cette boutique. Voir docs/superpowers/specs/2026-09-05-détection-risque-avancée-design.md."""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Avg
from django.utils import timezone

CANCEL_RETURN_STATUSES = ['cancelled', 'returned']

WEIGHT_CANCEL_RETURN_RATE = 40
WEIGHT_UNUSUAL_FREQUENCY = 20
WEIGHT_UNUSUAL_AMOUNT = 20
WEIGHT_LOCATION_MISMATCH = 20


def compute_risk_score(store, phone, wilaya, commune, total):
    signals = []
    weight = 0

    try:
        settings_obj = store.settings
        threshold = settings_obj.risk_threshold_orders
        period_days = settings_obj.risk_period_days
    except Exception:
        threshold, period_days = 3, 90

    history = store.orders.filter(phone=phone)
    cutoff = timezone.now() - timedelta(days=period_days)
    risky_count = history.filter(status__in=CANCEL_RETURN_STATUSES, created_at__gte=cutoff).count()
    if risky_count >= threshold:
        signals.append('cancel_return_rate')
        weight += WEIGHT_CANCEL_RETURN_RATE

    recent_cutoff = timezone.now() - timedelta(hours=24)
    recent_count = history.filter(created_at__gte=recent_cutoff).count()
    if recent_count >= 3:
        signals.append('unusual_frequency')
        weight += WEIGHT_UNUSUAL_FREQUENCY

    total = Decimal(str(total))
    customer_avg = history.aggregate(avg=Avg('total'))['avg']
    if customer_avg is not None and customer_avg > 0:
        if total >= Decimal(str(customer_avg)) * 3:
            signals.append('unusual_amount')
            weight += WEIGHT_UNUSUAL_AMOUNT
    else:
        store_cutoff = timezone.now() - timedelta(days=90)
        store_avg = store.orders.filter(created_at__gte=store_cutoff).aggregate(avg=Avg('total'))['avg']
        if store_avg is not None and store_avg > 0 and total >= Decimal(str(store_avg)) * 3:
            signals.append('unusual_amount')
            weight += WEIGHT_UNUSUAL_AMOUNT

    previous_wilayas = set(history.exclude(wilaya='').values_list('wilaya', flat=True))
    if previous_wilayas and wilaya not in previous_wilayas:
        signals.append('location_mismatch')
        weight += WEIGHT_LOCATION_MISMATCH

    return min(weight, 100), signals
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test orders.tests.RiskScoringTest -v 2`
Expected: `Ran 7 tests ... OK`

- [ ] **Step 5: Commit**

```bash
git add backend/orders/risk_scoring.py backend/orders/tests.py
git commit -m "feat(risk): calcul déterministe du score de risque avancé (4 signaux)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Champs `Order` + calcul à la création (dashboard et checkout public)

**Files:**
- Modify: `backend/orders/models.py`
- Create: `backend/orders/migrations/00XX_order_risk_score_and_more.py` (générée, numéro exact déterminé au moment de l'implémentation)
- Modify: `backend/orders/views.py` (`OrderListCreateView.post`, `PublicOrderView.post`)
- Test: `backend/orders/tests.py`

**Interfaces:**
- Consumes: `risk_scoring.compute_risk_score(store, phone, wilaya, commune, total)` (Task 1).
- Produces: `Order.risk_score` (int|None), `Order.risk_signals` (list), `Order.risk_explanation` (str, vide par défaut) — remplis automatiquement à la création de toute nouvelle commande, `None`/vide sur les commandes existantes avant cette migration.

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/orders/tests.py` :
```python
class OrderCreationRiskScoreTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.client_ = auth_client(self.owner)
        from products.models import Product
        self.product = Product.objects.create(store=self.store, name='Produit', price=2000, stock=10)

    def test_dashboard_order_creation_computes_risk_score(self):
        resp = self.client_.post('/api/orders/', {
            'first_name': 'Amine', 'phone': '0555000010', 'wilaya': 'Alger', 'commune': 'Centre',
            'items': [{'product': self.product.id, 'quantity': 1}],
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        order = Order.objects.get(pk=resp.data['id'])
        self.assertIsNotNone(order.risk_score)
        self.assertIsInstance(order.risk_signals, list)

    def test_public_order_creation_computes_risk_score(self):
        from rest_framework.test import APIClient
        anon = APIClient()
        resp = anon.post(f'/api/public/orders/', {
            'store_slug': self.store.slug, 'first_name': 'Amine', 'phone': '0555000011',
            'wilaya': 'Alger', 'commune': 'Centre', 'payment_method': 'cod',
            'items': [{'product': self.product.id, 'quantity': 1}],
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        order = Order.objects.get(pk=resp.data['id'])
        self.assertIsNotNone(order.risk_score)
```

⚠️ Avant d'écrire ces deux tests, vérifier le format exact attendu par `OrderListCreateView.post` et `PublicOrderView.post` (noms de champs `store_slug` vs URL avec slug, structure de `items`) en lisant un test existant proche dans `backend/orders/tests.py` (chercher `def test_.*create.*order` ou `/api/public/orders/`) — adapter le payload ci-dessus si le format réel diffère de cette esquisse.

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test orders.tests.OrderCreationRiskScoreTest -v 2`
Expected: `AttributeError: 'Order' object has no attribute 'risk_score'`

- [ ] **Step 3: Ajouter les champs au modèle**

Dans `backend/orders/models.py`, localiser le bloc où sont déclarés `restocked_at`/`stock_deducted_at` (recherche `stock_deducted_at`) et ajouter juste après :
```python
    risk_score       = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Score de risque déterministe 0-100 calculé à la création — null pour les commandes antérieures à cette fonctionnalité")
    risk_signals     = models.JSONField(default=list, blank=True, help_text="Codes des signaux déclenchés (cancel_return_rate, unusual_frequency, unusual_amount, location_mismatch)")
    risk_explanation = models.TextField(blank=True, help_text="Explication en langage naturel générée par l'IA à la demande — mise en cache une fois générée, jamais régénérée automatiquement")
```

- [ ] **Step 4: Générer et appliquer la migration**

Run: `venv/Scripts/python manage.py makemigrations orders`
Expected: `Migrations for 'orders': ... - Add field risk_score to order - Add field risk_signals to order - Add field risk_explanation to order`

Run: `venv/Scripts/python manage.py migrate orders`
Expected: `Applying orders.00XX_... OK`

- [ ] **Step 5: Appeler `compute_risk_score` dans `OrderListCreateView.post`**

Dans `backend/orders/views.py`, ajouter l'import en haut du fichier (à côté des autres imports du module `orders`) :
```python
from .risk_scoring import compute_risk_score
```

Localiser (recherche `order.recalculate()`) la première occurrence, dans `OrderListCreateView.post` — juste après l'appel existant `order.recalculate()` et avant le `if promo:` qui suit, insérer :
```python
        score, signals = compute_risk_score(store, order.phone, order.wilaya, order.commune, order.total)
        order.risk_score, order.risk_signals = score, signals
        order.save(update_fields=['risk_score', 'risk_signals'])
```

- [ ] **Step 6: Même appel dans `PublicOrderView.post`**

Localiser la seconde occurrence de `order.recalculate()` (dans `PublicOrderView.post`) — juste après, avant `OrderStatusHistory.objects.create(order=order, status='pending')`, insérer le même bloc :
```python
        score, signals = compute_risk_score(store, order.phone, order.wilaya, order.commune, order.total)
        order.risk_score, order.risk_signals = score, signals
        order.save(update_fields=['risk_score', 'risk_signals'])
```

- [ ] **Step 7: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test orders.tests.OrderCreationRiskScoreTest -v 2`
Expected: `Ran 2 tests ... OK`

- [ ] **Step 8: Run toute la suite `orders` pour vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test orders -v 1`
Expected: `OK`, aucune régression sur la création de commande existante (dashboard et checkout public).

- [ ] **Step 9: Commit**

```bash
git add backend/orders/models.py backend/orders/migrations backend/orders/views.py backend/orders/tests.py
git commit -m "feat(risk): calcule et stocke le score de risque à la création de commande

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Endpoint explication IA (`POST /api/orders/<id>/risk-explanation/`)

**Files:**
- Modify: `backend/orders/views.py`
- Modify: `backend/orders/urls.py`
- Test: `backend/orders/tests.py`

**Interfaces:**
- Consumes: `ai_assistant.ollama_client.generate(prompt)`, `ai_assistant.ollama_client.OllamaUnavailableError` (déjà en place, chantiers 1-2) — import direct `from ai_assistant import ollama_client` (aucune dépendance circulaire : `ollama_client.py` n'importe rien d'`orders`).
- Produces: `POST /api/orders/<int:pk>/risk-explanation/` → `{explanation: str}`.

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/orders/tests.py` :
```python
class OrderRiskExplanationViewTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.client_ = auth_client(self.owner)
        self.order = Order.objects.create(
            store=self.store, first_name='Amine', phone='0555000020', wilaya='Alger',
            status='pending', total=5000, risk_score=60, risk_signals=['unusual_amount', 'location_mismatch'],
        )

    @patch('orders.views.ollama_client.generate')
    def test_generates_and_caches_explanation(self, mock_generate):
        mock_generate.return_value = "Ce score est élevé car le montant est inhabituel et la wilaya diffère des commandes précédentes."
        resp = self.client_.post(f'/api/orders/{self.order.id}/risk-explanation/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('montant est inhabituel', resp.data['explanation'])
        self.order.refresh_from_db()
        self.assertEqual(self.order.risk_explanation, resp.data['explanation'])

        # Deuxième appel : ne rappelle PAS l'IA, retourne le cache
        resp2 = self.client_.post(f'/api/orders/{self.order.id}/risk-explanation/')
        self.assertEqual(resp2.data['explanation'], resp.data['explanation'])
        mock_generate.assert_called_once()

    @patch('orders.views.ollama_client.generate')
    def test_ollama_down_returns_503(self, mock_generate):
        from ai_assistant.ollama_client import OllamaUnavailableError
        mock_generate.side_effect = OllamaUnavailableError('down')
        resp = self.client_.post(f'/api/orders/{self.order.id}/risk-explanation/')
        self.assertEqual(resp.status_code, 503)

    def test_confirmateur_without_permission_forbidden(self):
        member_user, member = make_team_member(self.store, role='confirmateur')
        client_ = auth_client(member_user)
        resp = client_.post(f'/api/orders/{self.order.id}/risk-explanation/')
        self.assertEqual(resp.status_code, 403)
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test orders.tests.OrderRiskExplanationViewTest -v 2`
Expected: `404` (route inexistante).

- [ ] **Step 3: Implémenter la vue**

Ajouter à `backend/orders/views.py` (à la fin du fichier, ou à côté d'`OrderDetailView`) :
```python
from ai_assistant import ollama_client
from ai_assistant.ollama_client import OllamaUnavailableError

RISK_SIGNAL_LABELS = {
    'cancel_return_rate': "taux d'annulation/retour élevé",
    'unusual_frequency': "fréquence de commande anormale",
    'unusual_amount': "montant inhabituel",
    'location_mismatch': "localisation incohérente avec l'historique",
}


class OrderRiskExplanationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not (is_owner_or_admin(request) or has_permission(request, 'clients_risk_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            order = store.orders.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=404)

        if order.risk_explanation:
            return Response({'explanation': order.risk_explanation})

        signals_fr = ', '.join(RISK_SIGNAL_LABELS.get(s, s) for s in order.risk_signals) or 'aucun'
        prompt = (
            f"Un client de la boutique {store.name} a un score de risque de {order.risk_score or 0}/100. "
            f"Signaux déclenchés : {signals_fr}.\n"
            "Explique en 2-3 phrases, en français, pourquoi ce score est ce qu'il est — base-toi "
            "UNIQUEMENT sur les signaux fournis, n'invente aucune autre information."
        )
        try:
            explanation = ollama_client.generate(prompt)
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)

        order.risk_explanation = explanation.strip()
        order.save(update_fields=['risk_explanation'])
        return Response({'explanation': order.risk_explanation})
```

- [ ] **Step 4: Router l'endpoint**

Dans `backend/orders/urls.py`, ajouter (à côté de `path('<int:pk>/status/', ...)`) :
```python
    path('<int:pk>/risk-explanation/',            OrderRiskExplanationView.as_view()),
```
Et ajouter `OrderRiskExplanationView` à l'import des vues en haut du fichier (chercher la ligne `from .views import ...` et y ajouter ce nom).

- [ ] **Step 5: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test orders.tests.OrderRiskExplanationViewTest -v 2`
Expected: `Ran 3 tests ... OK`

- [ ] **Step 6: Commit**

```bash
git add backend/orders/views.py backend/orders/urls.py backend/orders/tests.py
git commit -m "feat(risk): endpoint d'explication IA du score, mis en cache

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Exposition des champs (serializers) + score max côté Clients à risque

**Files:**
- Modify: `backend/orders/serializers.py`
- Modify: `backend/orders/views.py` (`ClientListView`)
- Test: `backend/orders/tests.py`

**Interfaces:**
- Consumes: `Order.risk_score`/`risk_signals`/`risk_explanation` (Task 2).
- Produces: `OrderSerializer` expose `risk_score`/`risk_signals` (liste ET détail) ; `OrderDetailSerializer` expose en plus `risk_explanation` ; `GET /api/orders/clients/` expose `max_risk_score` par ligne.

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/orders/tests.py` :
```python
class OrderSerializerRiskFieldsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.client_ = auth_client(self.owner)

    def test_order_list_exposes_risk_score(self):
        Order.objects.create(store=self.store, first_name='X', phone='0555000030',
                              wilaya='Alger', status='pending', total=2000,
                              risk_score=75, risk_signals=['unusual_amount'])
        resp = self.client_.get('/api/orders/')
        self.assertEqual(resp.data['results'][0]['risk_score'], 75)
        self.assertEqual(resp.data['results'][0]['risk_signals'], ['unusual_amount'])

    def test_order_detail_exposes_risk_explanation(self):
        order = Order.objects.create(store=self.store, first_name='X', phone='0555000031',
                                      wilaya='Alger', status='pending', total=2000,
                                      risk_score=50, risk_explanation='Explication test.')
        resp = self.client_.get(f'/api/orders/{order.id}/')
        self.assertEqual(resp.data['risk_explanation'], 'Explication test.')

    def test_client_list_exposes_max_risk_score(self):
        Order.objects.create(store=self.store, first_name='X', phone='0555000032',
                              wilaya='Alger', status='pending', total=2000, risk_score=30)
        Order.objects.create(store=self.store, first_name='X', phone='0555000032',
                              wilaya='Alger', status='pending', total=2000, risk_score=80)
        resp = self.client_.get('/api/orders/clients/')
        row = next(r for r in resp.data['results'] if r['phone'] == '0555000032')
        self.assertEqual(row['max_risk_score'], 80)
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test orders.tests.OrderSerializerRiskFieldsTest -v 2`
Expected: `KeyError: 'risk_score'`

- [ ] **Step 3: Étendre les serializers**

Dans `backend/orders/serializers.py`, dans `OrderSerializer.Meta.fields`, ajouter `'risk_score', 'risk_signals',` (par exemple juste après `'cancellation_note', 'order_display_number',`).

Dans `OrderDetailSerializer.Meta.fields` (la liste ajoutée à `OrderSerializer.Meta.fields`), ajouter `'risk_explanation'` :
```python
    class Meta(OrderSerializer.Meta):
        fields = OrderSerializer.Meta.fields + [
            'items', 'history', 'assignment', 'call_attempts', 'address', 'updated_at', 'risk_explanation',
        ]
```

- [ ] **Step 4: Étendre `ClientListView`**

Dans `backend/orders/views.py`, dans `ClientListView.get`, ajouter `max_risk_score=Max('risk_score')` à l'appel `.annotate(...)` existant (à côté de `created_at=Min('created_at'),`), et ajouter `'max_risk_score': row['max_risk_score'],` dans le dict `results.append({...})` juste après.

- [ ] **Step 5: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test orders.tests.OrderSerializerRiskFieldsTest -v 2`
Expected: `Ran 3 tests ... OK`

- [ ] **Step 6: Run toute la suite `orders` pour vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test orders -v 1`
Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add backend/orders/serializers.py backend/orders/views.py backend/orders/tests.py
git commit -m "feat(risk): expose le score dans les serializers et la liste clients

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — badge, détail commande, page Clients à risque

**Files:**
- Create: `frontend/src/components/RiskScoreBadge.jsx`
- Modify: `frontend/src/pages/orders/OrdersPage.jsx`
- Modify: `frontend/src/pages/orders/OrderDetailPage.jsx`
- Modify: `frontend/src/pages/customers/AtRiskCustomersPage.jsx`
- Test: `frontend/src/tests/components/RiskScoreBadge.test.jsx`

**Interfaces:**
- Consumes: `theme.badge.{success,warning,danger}` (déjà en place), `o.risk_score`/`o.risk_signals` (liste commandes, Task 4), `order.risk_score`/`risk_signals`/`risk_explanation` (détail commande, Task 4), `c.max_risk_score` (Clients à risque, Task 4), `api.post('/orders/<id>/risk-explanation/')` (Task 3).
- Produces: `<RiskScoreBadge score={number|null} />`.

- [ ] **Step 1: Écrire le test du badge**

```jsx
// frontend/src/tests/components/RiskScoreBadge.test.jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import RiskScoreBadge from '../../components/RiskScoreBadge'

describe('RiskScoreBadge', () => {
  it('affiche "—" si le score est null (commande antérieure à la fonctionnalité)', () => {
    render(<RiskScoreBadge score={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('affiche "Faible" en vert pour un score bas', () => {
    render(<RiskScoreBadge score={20} />)
    expect(screen.getByText(/Faible/)).toBeInTheDocument()
  })

  it('affiche "Moyen" pour un score intermédiaire', () => {
    render(<RiskScoreBadge score={50} />)
    expect(screen.getByText(/Moyen/)).toBeInTheDocument()
  })

  it('affiche "Élevé" pour un score haut', () => {
    render(<RiskScoreBadge score={80} />)
    expect(screen.getByText(/Élevé/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd frontend && npm run test -- RiskScoreBadge`
Expected: échec, le composant n'existe pas.

- [ ] **Step 3: Créer le composant**

```jsx
// frontend/src/components/RiskScoreBadge.jsx
import { theme } from '../theme'

export default function RiskScoreBadge({ score }) {
  if (score === null || score === undefined) {
    return <span className={theme.badge.neutral}>—</span>
  }
  if (score >= 67) return <span className={theme.badge.danger}>Élevé ({score})</span>
  if (score >= 34) return <span className={theme.badge.warning}>Moyen ({score})</span>
  return <span className={theme.badge.success}>Faible ({score})</span>
}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `cd frontend && npm run test -- RiskScoreBadge`
Expected: `4 passed`

- [ ] **Step 5: Colonne RISQUE dans `OrdersPage.jsx`**

Dans `frontend/src/pages/orders/OrdersPage.jsx`, ajouter l'import :
```javascript
import RiskScoreBadge from '../../components/RiskScoreBadge'
```
Dans le tableau `ALL_COLUMNS` (chercher `{ key: 'tracking', label: 'SUIVI' },`), ajouter juste après :
```javascript
  { key: 'risk',         label: 'RISQUE' },
```
Dans le rendu des lignes du tableau (chercher `visibleCols.has('tracking')` pour repérer le bloc `<TrackingBadge ...>` correspondant, situé après `{visibleCols.has('status') && ...}`), ajouter juste après ce bloc :
```jsx
                {visibleCols.has('risk') && (
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <RiskScoreBadge score={o.risk_score} />
                  </td>
                )}
```

- [ ] **Step 6: Encart score + explication dans `OrderDetailPage.jsx`**

Dans `frontend/src/pages/orders/OrderDetailPage.jsx`, ajouter les imports :
```javascript
import RiskScoreBadge from '../../components/RiskScoreBadge'
```
Ajouter un état, à côté des autres `useState` du composant (chercher `const [order, setOrder] = useState(null)`) :
```javascript
  const [riskExplanation, setRiskExplanation] = useState('')
  const [loadingExplanation, setLoadingExplanation] = useState(false)
```
Synchroniser `riskExplanation` avec `order.risk_explanation` quand la commande est chargée — trouver le `useEffect`/la fonction qui fait `setOrder(data)` après un `api.get(\`/orders/${id}/\`)` et ajouter juste après cet appel `setOrder` (dans le même bloc) : `setRiskExplanation(data.risk_explanation || '')`.

Ajouter un handler, à côté des autres handlers du composant :
```javascript
  const handleGenerateExplanation = async () => {
    setLoadingExplanation(true)
    try {
      const { data } = await api.post(`/orders/${id}/risk-explanation/`)
      setRiskExplanation(data.explanation)
    } catch {
      // best-effort — le score/les signaux restent visibles même si l'IA échoue
    } finally {
      setLoadingExplanation(false)
    }
  }
```
Ajouter l'encart dans le JSX, à un endroit visible du détail de commande (par exemple juste après le bloc qui affiche le statut/`StatusBadge` de la commande — repérer ce bloc au moment de l'implémentation) :
```jsx
{order.risk_score !== null && order.risk_score !== undefined && (
  <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-medium text-app-primary">Score de risque</span>
      <RiskScoreBadge score={order.risk_score} />
    </div>
    {order.risk_signals?.length > 0 && (
      <ul className="text-xs text-app-muted-light list-disc pl-4 mb-2">
        {order.risk_signals.map(s => <li key={s}>{RISK_SIGNAL_LABELS_FR[s] || s}</li>)}
      </ul>
    )}
    {riskExplanation ? (
      <p className="text-xs text-app-muted-light">{riskExplanation}</p>
    ) : (
      <button type="button" onClick={handleGenerateExplanation} disabled={loadingExplanation}
        className={theme.btn.outline + ' text-xs disabled:opacity-50'}>
        {loadingExplanation ? 'Génération…' : "Générer une explication"}
      </button>
    )}
  </div>
)}
```
Ajouter la constante de libellés FR en haut du fichier (hors composant, à côté des autres constantes du module) :
```javascript
const RISK_SIGNAL_LABELS_FR = {
  cancel_return_rate: "Taux d'annulation/retour élevé",
  unusual_frequency: 'Fréquence de commande anormale',
  unusual_amount: 'Montant inhabituel',
  location_mismatch: "Localisation incohérente avec l'historique",
}
```

- [ ] **Step 7: Colonne score max dans `AtRiskCustomersPage.jsx`**

Dans `frontend/src/pages/customers/AtRiskCustomersPage.jsx`, ajouter l'import :
```javascript
import RiskScoreBadge from '../../components/RiskScoreBadge'
```
Ajouter une colonne d'en-tête (chercher `<th className="px-4 py-3 font-medium">ORIGINE</th>`) juste avant :
```jsx
              <th className="px-4 py-3 font-medium">SCORE AVANCÉ</th>
```
Ajouter la cellule correspondante dans le rendu des lignes (chercher la `<td>` qui affiche `ORIGINE`/`c.manual_risk`) juste avant :
```jsx
                <td className="px-4 py-3"><RiskScoreBadge score={c.max_risk_score} /></td>
```

- [ ] **Step 8: Run la suite frontend complète pour vérifier l'absence de régression**

Run: `cd frontend && npm run test`
Expected: tous les tests passent, y compris `OrdersPage.test.jsx`, `OrderDetailPage.test.jsx`, `AtRiskCustomersPage.test.jsx` déjà existants (vérifier qu'aucun de ces 3 fichiers ne fait d'assertion stricte sur le nombre de colonnes/lignes qui casserait avec l'ajout — adapter ces tests existants uniquement si un tel échec apparaît, en ajoutant un mock `risk_score`/`max_risk_score: null` aux données de test plutôt qu'en supprimant l'assertion).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/RiskScoreBadge.jsx frontend/src/pages/orders/OrdersPage.jsx frontend/src/pages/orders/OrderDetailPage.jsx frontend/src/pages/customers/AtRiskCustomersPage.jsx frontend/src/tests/components/RiskScoreBadge.test.jsx
git commit -m "feat(risk): badge de score sur commandes + explication IA + clients à risque

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Étendre la section Assistant IA de `CLAUDE.md`**

Localiser la section `### Assistant IA (Ollama local + Groq cloud, 2026-09)` et ajouter, juste avant la ligne `Testé via manage.py test ai_assistant...` (fin de section) :
```markdown
**Détection de risque avancée (2026-09, 3ème chantier)** — score 0-100 calculé par du code Python **déterministe** (`orders/risk_scoring.py::compute_risk_score()`, aucun appel IA) sur 4 signaux pondérés : taux annulation/retour (réutilise `StoreSettings.risk_threshold_orders`/`risk_period_days`), fréquence anormale (≥3 commandes/24h), montant inhabituel (≥3× la moyenne du client ou de la boutique), localisation incohérente avec l'historique du téléphone. Stocké sur `Order.risk_score`/`risk_signals` à la création (dashboard et checkout public) — **jamais de blocage automatique**, signalement uniquement, `CustomerRisk`/`BlacklistedPhone` restent inchangés et séparés.

Explication en langage naturel générée **à la demande uniquement** (`POST /api/orders/<id>/risk-explanation/`, owner/admin ou `clients_risk_view`), mise en cache sur `Order.risk_explanation` (jamais régénérée). Prompt limité au score+signaux déjà calculés — jamais l'historique brut du client, même garde-fou anti-invention que les 2 chantiers précédents. Affiché via `components/RiskScoreBadge.jsx` (3 bandes de couleur) sur `OrdersPage.jsx`, `OrderDetailPage.jsx`, et le score maximal par client sur `AtRiskCustomersPage.jsx`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documente la détection de risque avancée

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review (fait avant remise du plan)

- **Couverture du spec** : calcul déterministe des 4 signaux (Task 1), stockage à la création dans les 2 points d'entrée (Task 2), explication IA à la demande + cache (Task 3), exposition API + score max client (Task 4), UI badge/détail/page clients (Task 5), doc (Task 6). Tous les points du spec sont couverts.
- **Placeholders** : aucun TBD/TODO. Deux points signalés explicitement comme "à vérifier en conditions réelles" plutôt que devinés à l'aveugle : le format exact du payload de test de création de commande (Task 2, Step 1 — le payload esquissé peut différer du format réel accepté par les vues, à confirmer en lisant un test existant avant d'écrire la version finale) et l'emplacement exact de l'encart risque dans le JSX de `OrderDetailPage.jsx` (Task 5, Step 6 — fichier volumineux, périmètre exact du bloc à localiser au moment de l'implémentation).
- **Cohérence des types/noms** : `compute_risk_score(store, phone, wilaya, commune, total) -> (int, list[str])` (Task 1) utilisé à l'identique dans Task 2 (création commande) — jamais dans un contexte nécessitant un appel IA. `RISK_SIGNAL_LABELS`/`RISK_SIGNAL_LABELS_FR` : deux constantes distinctes mais délibérément dupliquées (une côté backend pour le prompt IA en Task 3, une côté frontend pour l'affichage en Task 5) — même liste de 4 clés, cohérence vérifiable par lecture croisée, pas un import partagé (backend/frontend ne partagent pas de code). `order.risk_explanation` (Task 2 modèle, Task 3 vue, Task 4 serializer, Task 5 frontend) cohérent partout.
