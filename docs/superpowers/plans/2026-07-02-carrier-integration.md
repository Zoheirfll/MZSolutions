# Intégration transporteurs (Yalidine + ZR Express) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un vendeur de connecter ses comptes Yalidine / ZR Express et de déclencher automatiquement la création d'une expédition (mockée pour l'instant) dès qu'une commande passe au statut "Confirmée".

**Architecture:** Nouveau modèle `CarrierAccount` (backend/orders), un module `backend/orders/carriers/` avec une interface commune et des clients mockés par transporteur, extension de `OrderStatusView` pour déclencher la création d'expédition, et une nouvelle page frontend `ParametresLivraisonPage.jsx` reprenant le style RiseCart validé par l'utilisateur.

**Tech Stack:** Django 5.2 + DRF (backend), React 18 + Vite + Tailwind v4 (frontend), pas de framework de test frontend existant dans le projet (vérification manuelle pour les tâches frontend).

## Global Constraints

- Zéro CSS custom côté frontend — Tailwind uniquement, toujours via `theme.js` (`c:\Users\filali\MZSolutions\frontend\src\theme.js`).
- Isolation multi-tenant obligatoire : toute vue filtre par `_get_store(request)` (pattern existant dans `backend/orders/views.py:19`).
- `api_token` ne doit jamais être renvoyé en clair dans une réponse GET/PUT (write-only + champ masqué séparé).
- Périmètre limité à Yalidine et ZR Express ; clients transporteurs mockés (pas d'appel réseau réel), voir spec `docs/superpowers/specs/2026-07-02-carrier-integration-design.md`.
- Chaque commit suit les messages courts du style existant (`feat: ...`, voir `git log`).

---

### Task 1: Modèle `CarrierAccount` + champs transporteur sur `Order`

**Files:**
- Modify: `backend/orders/models.py`
- Create: `backend/orders/migrations/0009_carrieraccount_order_carrier_fields.py` (générée par `makemigrations`, ne pas l'écrire à la main)
- Test: `backend/orders/tests.py`

**Interfaces:**
- Produces: `orders.models.CARRIER_CHOICES` (liste de tuples `('yalidine', 'Yalidine'), ('zr_express', 'ZR Express')`), `orders.models.CarrierAccount` (champs `store`, `carrier`, `api_id`, `api_token`, `is_active`, `is_default`, `created_at`), champs `Order.carrier` (FK nullable vers `CarrierAccount`), `Order.carrier_tracking_number`, `Order.carrier_status`, `Order.carrier_shipment_created_at`.

- [ ] **Step 1: Écrire le test qui échoue (contrainte "un seul défaut par boutique")**

Dans `backend/orders/tests.py`, remplacer le contenu (actuellement vide) par :

```python
from django.test import TestCase
from accounts.models import User
from stores.models import Store
from orders.models import CarrierAccount


class CarrierAccountModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='owner@test.com', password='pass1234')
        self.store = Store.objects.create(owner=self.user, name='Ma Boutique', slug='ma-boutique')

    def test_setting_default_unsets_previous_default(self):
        yalidine = CarrierAccount.objects.create(store=self.store, carrier='yalidine', is_default=True)
        zr = CarrierAccount.objects.create(store=self.store, carrier='zr_express', is_default=True)

        yalidine.refresh_from_db()
        zr.refresh_from_db()

        self.assertFalse(yalidine.is_default)
        self.assertTrue(zr.is_default)
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `venv/Scripts/python manage.py test orders.tests.CarrierAccountModelTests -v 2`
Expected: FAIL — `ImportError: cannot import name 'CarrierAccount' from 'orders.models'`

- [ ] **Step 3: Ajouter `CARRIER_CHOICES` et `CarrierAccount` dans `backend/orders/models.py`**

Insérer juste après le bloc `PAYMENT_METHOD_CHOICES = [...]` (avant `class Order(models.Model):`) :

```python
CARRIER_CHOICES = [
    ('yalidine',   'Yalidine'),
    ('zr_express', 'ZR Express'),
]


class CarrierAccount(models.Model):
    store      = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='carrier_accounts')
    carrier    = models.CharField(max_length=20, choices=CARRIER_CHOICES)
    api_id     = models.CharField(max_length=100, blank=True)
    api_token  = models.CharField(max_length=200, blank=True)
    is_active  = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['carrier']
        unique_together = [('store', 'carrier')]

    def save(self, *args, **kwargs):
        if self.is_default:
            CarrierAccount.objects.filter(store=self.store, is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_carrier_display()} — {self.store.name}"
```

Puis ajouter les champs transporteur sur `Order`, juste avant `created_at = models.DateTimeField(auto_now_add=True)` dans la classe `Order` :

```python
    carrier                      = models.ForeignKey(CarrierAccount, null=True, blank=True, on_delete=models.SET_NULL, related_name='shipments')
    carrier_tracking_number      = models.CharField(max_length=100, blank=True)
    carrier_status               = models.CharField(max_length=50, blank=True)
    carrier_shipment_created_at  = models.DateTimeField(null=True, blank=True)
```

- [ ] **Step 4: Générer et appliquer la migration**

Run:
```bash
cd backend
venv/Scripts/python manage.py makemigrations orders
venv/Scripts/python manage.py migrate
```
Expected: une nouvelle migration `orders/migrations/0009_...py` est créée et appliquée sans erreur.

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `venv/Scripts/python manage.py test orders.tests.CarrierAccountModelTests -v 2`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add backend/orders/models.py backend/orders/migrations/ backend/orders/tests.py
git commit -m "feat(orders): add CarrierAccount model and Order carrier fields"
```

---

### Task 2: Module `orders/carriers/` (clients transporteurs mockés)

**Files:**
- Create: `backend/orders/carriers/__init__.py`
- Create: `backend/orders/carriers/base.py`
- Create: `backend/orders/carriers/yalidine.py`
- Create: `backend/orders/carriers/zr_express.py`
- Test: `backend/orders/tests.py`

**Interfaces:**
- Consumes: rien (module autonome).
- Produces: `orders.carriers.base.ShipmentResult(tracking_number, status, raw_response)`, `orders.carriers.base.BaseCarrierClient`, `orders.carriers.get_carrier_client(carrier_account) -> BaseCarrierClient` (lève `ValueError` si `carrier_account.carrier` est inconnu).

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `backend/orders/tests.py` :

```python
from orders.carriers import get_carrier_client


class CarrierClientTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='owner2@test.com', password='pass1234')
        self.store = Store.objects.create(owner=self.user, name='Boutique 2', slug='boutique-2')
        self.account = CarrierAccount.objects.create(store=self.store, carrier='yalidine', is_default=True)

    def test_mock_client_creates_shipment_with_tracking_number(self):
        from orders.models import Order
        order = Order.objects.create(store=self.store, first_name='Ali', phone='0555000000', wilaya='Alger')

        client = get_carrier_client(self.account)
        result = client.create_shipment(order)

        self.assertTrue(result.tracking_number.startswith('MOCK-yalidine-'))
        self.assertEqual(result.status, 'created')

    def test_unknown_carrier_raises_value_error(self):
        self.account.carrier = 'unknown_carrier'
        with self.assertRaises(ValueError):
            get_carrier_client(self.account)
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `venv/Scripts/python manage.py test orders.tests.CarrierClientTests -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'orders.carriers'`

- [ ] **Step 3: Créer `backend/orders/carriers/base.py`**

```python
from dataclasses import dataclass, field


@dataclass
class ShipmentResult:
    tracking_number: str
    status: str
    raw_response: dict = field(default_factory=dict)


class BaseCarrierClient:
    carrier_code = None

    def __init__(self, carrier_account):
        self.carrier_account = carrier_account

    def create_shipment(self, order):
        raise NotImplementedError

    def get_status(self, tracking_number):
        raise NotImplementedError


class MockCarrierClient(BaseCarrierClient):
    """Client transporteur simulé — utilisé tant que les accès API réels
    (Yalidine, ZR Express) ne sont pas obtenus. Retourne un tracking number
    factice sans appel réseau."""

    def create_shipment(self, order):
        import uuid
        tracking_number = f"MOCK-{self.carrier_code}-{order.id}-{uuid.uuid4().hex[:6]}"
        return ShipmentResult(tracking_number=tracking_number, status='created', raw_response={'mock': True})

    def get_status(self, tracking_number):
        return 'created'
```

- [ ] **Step 4: Créer `backend/orders/carriers/yalidine.py`**

```python
from .base import MockCarrierClient


class YalidineClient(MockCarrierClient):
    carrier_code = 'yalidine'
```

- [ ] **Step 5: Créer `backend/orders/carriers/zr_express.py`**

```python
from .base import MockCarrierClient


class ZRExpressClient(MockCarrierClient):
    carrier_code = 'zr_express'
```

- [ ] **Step 6: Créer `backend/orders/carriers/__init__.py`**

```python
from .yalidine import YalidineClient
from .zr_express import ZRExpressClient

_CLIENTS = {
    'yalidine':   YalidineClient,
    'zr_express': ZRExpressClient,
}


def get_carrier_client(carrier_account):
    cls = _CLIENTS.get(carrier_account.carrier)
    if not cls:
        raise ValueError(f"Transporteur inconnu: {carrier_account.carrier}")
    return cls(carrier_account)
```

- [ ] **Step 7: Lancer le test pour vérifier qu'il passe**

Run: `venv/Scripts/python manage.py test orders.tests.CarrierClientTests -v 2`
Expected: PASS (2 tests)

- [ ] **Step 8: Commit**

```bash
git add backend/orders/carriers/ backend/orders/tests.py
git commit -m "feat(orders): add mocked Yalidine/ZR Express carrier clients"
```

---

### Task 3: `CarrierAccountSerializer` + extension des serializers `Order`

**Files:**
- Modify: `backend/orders/serializers.py`
- Test: `backend/orders/tests.py`

**Interfaces:**
- Consumes: `orders.models.CarrierAccount`, `orders.models.CARRIER_CHOICES` (Task 1).
- Produces: `orders.serializers.CarrierAccountSerializer` (champs `id, carrier, carrier_label, api_id, api_token [write_only], api_token_masked, is_active, is_default, created_at`). `OrderSerializer` gagne les champs `carrier_label`, `carrier_tracking_number`, `carrier_status`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `backend/orders/tests.py` :

```python
from orders.serializers import CarrierAccountSerializer


class CarrierAccountSerializerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='owner3@test.com', password='pass1234')
        self.store = Store.objects.create(owner=self.user, name='Boutique 3', slug='boutique-3')

    def test_api_token_never_serialized_in_clear(self):
        account = CarrierAccount.objects.create(
            store=self.store, carrier='yalidine', api_id='ID123', api_token='SECRET-TOKEN-1234',
        )
        data = CarrierAccountSerializer(account).data

        self.assertNotIn('api_token', data)
        self.assertEqual(data['api_token_masked'], '••••••••••••••1234')
        self.assertEqual(data['carrier_label'], 'Yalidine')
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `venv/Scripts/python manage.py test orders.tests.CarrierAccountSerializerTests -v 2`
Expected: FAIL — `ImportError: cannot import name 'CarrierAccountSerializer' from 'orders.serializers'`

- [ ] **Step 3: Ajouter `CarrierAccountSerializer` dans `backend/orders/serializers.py`**

Modifier l'import en haut du fichier :

```python
from .models import (
    Order, OrderItem, OrderStatusHistory, STATUS_CHOICES,
    OrderAssignment, FailureReason, CallAttempt, CALL_STATUS_CHOICES,
    PAYMENT_METHOD_CHOICES, AbandonedCart, CarrierAccount, CARRIER_CHOICES,
)
```

Ajouter la classe (avant `class OrderSerializer`) :

```python
class CarrierAccountSerializer(serializers.ModelSerializer):
    carrier_label     = serializers.SerializerMethodField()
    api_token         = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_token_masked  = serializers.SerializerMethodField()

    class Meta:
        model  = CarrierAccount
        fields = ['id', 'carrier', 'carrier_label', 'api_id', 'api_token', 'api_token_masked',
                  'is_active', 'is_default', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_carrier_label(self, obj):
        return dict(CARRIER_CHOICES).get(obj.carrier, obj.carrier)

    def get_api_token_masked(self, obj):
        if not obj.api_token:
            return ''
        return '•' * max(0, len(obj.api_token) - 4) + obj.api_token[-4:]
```

Puis étendre `OrderSerializer` : ajouter `carrier_label = serializers.SerializerMethodField()` dans la classe et `'carrier_label', 'carrier_tracking_number', 'carrier_status'` dans `Meta.fields`, avec la méthode :

```python
    def get_carrier_label(self, obj):
        return obj.carrier.get_carrier_display() if obj.carrier else None
```

(Insérer la déclaration du champ juste après `payment_method_label = serializers.SerializerMethodField()`, l'ajout dans `fields` juste après `'payment_method', 'payment_method_label'`, et la méthode juste après `get_payment_method_label`.)

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `venv/Scripts/python manage.py test orders.tests.CarrierAccountSerializerTests -v 2`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add backend/orders/serializers.py backend/orders/tests.py
git commit -m "feat(orders): add CarrierAccountSerializer, expose carrier fields on OrderSerializer"
```

---

### Task 4: Vues CRUD `CarrierAccount` + URLs

**Files:**
- Modify: `backend/orders/views.py`
- Modify: `backend/config/urls.py`
- Test: `backend/orders/tests.py`

**Interfaces:**
- Consumes: `CarrierAccount`, `CARRIER_CHOICES` (Task 1), `CarrierAccountSerializer` (Task 3), `_get_store(request)`, `is_owner_or_admin(request)` (déjà importés dans `views.py`).
- Produces: `orders.views.CarrierAccountListCreateView`, `orders.views.CarrierAccountDetailView`, montées sur `GET/POST /api/stores/me/carriers/` et `PUT/DELETE /api/stores/me/carriers/<id>/`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `backend/orders/tests.py` :

```python
from rest_framework.test import APIClient
from rest_framework import status as http_status


class CarrierAccountAPITests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='owner4@test.com', password='pass1234')
        self.store = Store.objects.create(owner=self.user, name='Boutique 4', slug='boutique-4')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_create_carrier_account(self):
        resp = self.client.post('/api/stores/me/carriers/', {
            'carrier': 'yalidine', 'api_id': 'ID1', 'api_token': 'TOKEN1', 'is_default': True,
        }, format='json')

        self.assertEqual(resp.status_code, http_status.HTTP_201_CREATED)
        self.assertEqual(resp.data['carrier'], 'yalidine')
        self.assertTrue(resp.data['is_default'])
        self.assertNotIn('api_token', resp.data)

    def test_duplicate_carrier_for_same_store_rejected(self):
        self.client.post('/api/stores/me/carriers/', {'carrier': 'yalidine'}, format='json')
        resp = self.client.post('/api/stores/me/carriers/', {'carrier': 'yalidine'}, format='json')

        self.assertEqual(resp.status_code, 400)

    def test_update_default_unsets_other_account(self):
        r1 = self.client.post('/api/stores/me/carriers/', {'carrier': 'yalidine', 'is_default': True}, format='json')
        r2 = self.client.post('/api/stores/me/carriers/', {'carrier': 'zr_express'}, format='json')

        self.client.put(f"/api/stores/me/carriers/{r2.data['id']}/", {'is_default': True}, format='json')

        list_resp = self.client.get('/api/stores/me/carriers/')
        defaults = [a['is_default'] for a in list_resp.data]
        self.assertEqual(defaults.count(True), 1)

    def test_delete_carrier_account(self):
        r1 = self.client.post('/api/stores/me/carriers/', {'carrier': 'yalidine'}, format='json')
        resp = self.client.delete(f"/api/stores/me/carriers/{r1.data['id']}/")

        self.assertEqual(resp.status_code, 204)
        self.assertEqual(self.client.get('/api/stores/me/carriers/').data, [])
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `venv/Scripts/python manage.py test orders.tests.CarrierAccountAPITests -v 2`
Expected: FAIL — 404 sur `/api/stores/me/carriers/` (route inexistante)

- [ ] **Step 3: Ajouter les vues dans `backend/orders/views.py`**

Modifier l'import en haut du fichier :

```python
from .models import Order, OrderItem, OrderStatusHistory, STATUS_CHOICES, OrderAssignment, FailureReason, CallAttempt, CALL_STATUS_CHOICES, PaymentWebhookLog, AbandonedCart, CarrierAccount, CARRIER_CHOICES
from .serializers import OrderSerializer, OrderDetailSerializer, OrderAssignmentSerializer, FailureReasonSerializer, CallAttemptSerializer, AbandonedCartSerializer, CarrierAccountSerializer
```

Ajouter les deux vues (par exemple juste après `class OrderStatusView`) :

```python
class CarrierAccountListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        accounts = store.carrier_accounts.all()
        return Response(CarrierAccountSerializer(accounts, many=True).data)

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Création réservée au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        carrier = request.data.get('carrier')
        valid = [c[0] for c in CARRIER_CHOICES]
        if carrier not in valid:
            return Response({'detail': f'Transporteur invalide. Valeurs : {valid}'}, status=400)
        if store.carrier_accounts.filter(carrier=carrier).exists():
            return Response({'detail': 'Ce transporteur est déjà connecté pour cette boutique.'}, status=400)

        account = CarrierAccount.objects.create(
            store      = store,
            carrier    = carrier,
            api_id     = request.data.get('api_id', ''),
            api_token  = request.data.get('api_token', ''),
            is_default = request.data.get('is_default', False),
        )
        return Response(CarrierAccountSerializer(account).data, status=status.HTTP_201_CREATED)


class CarrierAccountDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.carrier_accounts.get(pk=pk), None
        except CarrierAccount.DoesNotExist:
            return None, Response({'detail': 'Compte transporteur introuvable.'}, status=404)

    def put(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Modification réservée au propriétaire ou administrateur.'}, status=403)
        account, err = self._get(request, pk)
        if err: return err
        for field in ['api_id', 'api_token', 'is_active', 'is_default']:
            if field in request.data:
                setattr(account, field, request.data[field])
        account.save()
        return Response(CarrierAccountSerializer(account).data)

    def delete(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Suppression réservée au propriétaire ou administrateur.'}, status=403)
        account, err = self._get(request, pk)
        if err: return err
        account.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Monter les routes dans `backend/config/urls.py`**

Modifier l'import existant des vues `stores` :

```python
from stores.views import (StorePageListCreateView, StorePageDetailView,
                           MediaFolderListCreateView, MediaFolderDeleteView,
                           MediaFileListView, MediaFileUploadView, MediaFileDeleteView)
from orders.views import CarrierAccountListCreateView, CarrierAccountDetailView
```

Ajouter dans le bloc `urlpatterns += [...]` qui suit (celui qui contient déjà `api/stores/pages/`) :

```python
    path('api/stores/me/carriers/',           CarrierAccountListCreateView.as_view()),
    path('api/stores/me/carriers/<int:pk>/',  CarrierAccountDetailView.as_view()),
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `venv/Scripts/python manage.py test orders.tests.CarrierAccountAPITests -v 2`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/orders/views.py backend/config/urls.py backend/orders/tests.py
git commit -m "feat(orders): add CarrierAccount CRUD endpoints under /api/stores/me/carriers/"
```

---

### Task 5: Création automatique de l'expédition à la confirmation

**Files:**
- Modify: `backend/orders/views.py` (`OrderStatusView.post`)
- Test: `backend/orders/tests.py`

**Interfaces:**
- Consumes: `orders.carriers.get_carrier_client` (Task 2), `CarrierAccount` (Task 1), `OrderDetailSerializer` (existant).
- Produces: `POST /api/orders/{id}/status/` accepte désormais un champ optionnel `carrier_id` dans le body ; la réponse JSON gagne une clé optionnelle `carrier_warning` (string) quand aucune expédition n'a pu être créée.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `backend/orders/tests.py` :

```python
from orders.models import Order


class OrderStatusCarrierTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='owner5@test.com', password='pass1234')
        self.store = Store.objects.create(owner=self.user, name='Boutique 5', slug='boutique-5')
        self.order = Order.objects.create(store=self.store, first_name='Sara', phone='0555111111', wilaya='Oran')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_confirming_order_with_default_carrier_creates_mock_shipment(self):
        CarrierAccount.objects.create(store=self.store, carrier='yalidine', is_default=True, is_active=True)

        resp = self.client.post(f'/api/orders/{self.order.id}/status/', {'status': 'confirmed'}, format='json')

        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['carrier_tracking_number'].startswith('MOCK-yalidine-'))
        self.assertNotIn('carrier_warning', resp.data)

    def test_confirming_order_without_carrier_returns_warning_but_confirms(self):
        resp = self.client.post(f'/api/orders/{self.order.id}/status/', {'status': 'confirmed'}, format='json')

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'confirmed')
        self.assertIn('carrier_warning', resp.data)

    def test_confirming_twice_does_not_recreate_shipment(self):
        CarrierAccount.objects.create(store=self.store, carrier='yalidine', is_default=True, is_active=True)

        first = self.client.post(f'/api/orders/{self.order.id}/status/', {'status': 'confirmed'}, format='json')
        self.client.post(f'/api/orders/{self.order.id}/status/', {'status': 'shipped'}, format='json')
        second = self.client.post(f'/api/orders/{self.order.id}/status/', {'status': 'confirmed'}, format='json')

        self.assertEqual(first.data['carrier_tracking_number'], second.data['carrier_tracking_number'])

    def test_confirming_with_explicit_carrier_id_overrides_default(self):
        default_account = CarrierAccount.objects.create(store=self.store, carrier='yalidine', is_default=True, is_active=True)
        override_account = CarrierAccount.objects.create(store=self.store, carrier='zr_express', is_active=True)

        resp = self.client.post(
            f'/api/orders/{self.order.id}/status/',
            {'status': 'confirmed', 'carrier_id': override_account.id},
            format='json',
        )

        self.assertTrue(resp.data['carrier_tracking_number'].startswith('MOCK-zr_express-'))
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `venv/Scripts/python manage.py test orders.tests.OrderStatusCarrierTests -v 2`
Expected: FAIL — `carrier_tracking_number` absent/vide, `carrier_warning` absent de la réponse

- [ ] **Step 3: Étendre `OrderStatusView.post` dans `backend/orders/views.py`**

Ajouter l'import en haut du fichier :

```python
from .carriers import get_carrier_client
```

Remplacer le corps de `class OrderStatusView` par :

```python
class OrderStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            order = store.orders.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=404)

        new_status = request.data.get('status')
        valid = [s[0] for s in STATUS_CHOICES]
        if new_status not in valid:
            return Response({'detail': f'Statut invalide. Valeurs : {valid}'}, status=400)

        order.status = new_status
        order.save(update_fields=['status'])
        OrderStatusHistory.objects.create(
            order      = order,
            status     = new_status,
            changed_by = request.user,
            note       = request.data.get('note', ''),
        )

        carrier_warning = self._maybe_create_shipment(request, store, order, new_status)

        data = OrderDetailSerializer(order).data
        if carrier_warning:
            data['carrier_warning'] = carrier_warning
        return Response(data)

    def _maybe_create_shipment(self, request, store, order, new_status):
        if new_status != 'confirmed' or order.carrier_tracking_number:
            return None

        carrier_id = request.data.get('carrier_id')
        account = None
        if carrier_id:
            account = store.carrier_accounts.filter(pk=carrier_id, is_active=True).first()
        if not account:
            account = store.carrier_accounts.filter(is_default=True, is_active=True).first()

        if not account:
            return 'Aucun transporteur configuré — expédition non créée.'

        try:
            result = get_carrier_client(account).create_shipment(order)
        except Exception as e:
            return f"Erreur transporteur : {e}"

        order.carrier = account
        order.carrier_tracking_number = result.tracking_number
        order.carrier_status = result.status
        order.carrier_shipment_created_at = timezone.now()
        order.save(update_fields=['carrier', 'carrier_tracking_number', 'carrier_status', 'carrier_shipment_created_at'])
        return None
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `venv/Scripts/python manage.py test orders.tests.OrderStatusCarrierTests -v 2`
Expected: PASS (4 tests)

- [ ] **Step 5: Lancer toute la suite `orders` pour vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test orders -v 2`
Expected: PASS (tous les tests, y compris ceux des Tasks 1 à 4)

- [ ] **Step 6: Commit**

```bash
git add backend/orders/views.py backend/orders/tests.py
git commit -m "feat(orders): auto-create mock shipment when order is confirmed"
```

---

### Task 6: Page frontend `ParametresLivraisonPage.jsx`

**Files:**
- Create: `frontend/src/pages/ParametresLivraisonPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/DashboardLayout.jsx`

**Interfaces:**
- Consumes: `GET/POST /api/stores/me/carriers/`, `PUT/DELETE /api/stores/me/carriers/<id>/` (Task 4), `api` (défaut, `frontend/src/api/axios.js`), `theme` (`frontend/src/theme.js`).
- Produces: route `/dashboard/parametres-livraison`, lien sidebar "Paramètres livraison".

- [ ] **Step 1: Créer `frontend/src/pages/ParametresLivraisonPage.jsx`**

```jsx
import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import api from '../api/axios'
import { theme } from '../theme'

const CARRIERS = [
  { code: 'yalidine',   label: 'Yalidine' },
  { code: 'zr_express', label: 'ZR Express' },
]

export default function ParametresLivraisonPage() {
  const [accounts, setAccounts]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [modalCarrier, setModalCarrier] = useState(null)
  const [apiId, setApiId]               = useState('')
  const [apiToken, setApiToken]         = useState('')
  const [saving, setSaving]             = useState(false)

  const fetchAccounts = () => {
    setLoading(true)
    api.get('/stores/me/carriers/')
      .then(({ data }) => setAccounts(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAccounts() }, [])

  const accountFor = (code) => accounts.find(a => a.carrier === code)

  const openModal = (code) => {
    const existing = accountFor(code)
    setApiId(existing?.api_id || '')
    setApiToken('')
    setModalCarrier(code)
  }

  const saveAccount = async () => {
    if (!modalCarrier) return
    setSaving(true)
    try {
      const existing = accountFor(modalCarrier)
      if (existing) {
        await api.put(`/stores/me/carriers/${existing.id}/`, { api_id: apiId, api_token: apiToken })
      } else {
        await api.post('/stores/me/carriers/', { carrier: modalCarrier, api_id: apiId, api_token: apiToken })
      }
      setModalCarrier(null)
      fetchAccounts()
    } catch {} finally { setSaving(false) }
  }

  const toggleDefault = async (account) => {
    await api.put(`/stores/me/carriers/${account.id}/`, { is_default: !account.is_default })
    fetchAccounts()
  }

  const removeAccount = async (account) => {
    await api.delete(`/stores/me/carriers/${account.id}/`)
    fetchAccounts()
  }

  return (
    <DashboardLayout title="Paramètres livraison">
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className={theme.skeleton + ' h-48'} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARRIERS.map(c => {
            const account = accountFor(c.code)
            return (
              <div key={c.code} className="rounded-xl border p-5 flex flex-col items-center text-center gap-3"
                style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center text-lg font-bold text-violet-300">
                  {c.label[0]}
                </div>
                <p className="font-semibold text-gray-200">{c.label}</p>
                {account ? (
                  <>
                    <span className={theme.badge.success}>Connecté</span>
                    <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: theme.dark.muted }}>
                      <input type="checkbox" checked={account.is_default} onChange={() => toggleDefault(account)} />
                      Transporteur par défaut
                    </label>
                    <div className="flex gap-2 w-full">
                      <button onClick={() => openModal(c.code)} className={theme.btn.outline + ' flex-1 text-xs'}>Modifier</button>
                      <button onClick={() => removeAccount(account)} className={theme.btn.danger + ' flex-1 text-xs'}>Retirer</button>
                    </div>
                  </>
                ) : (
                  <button onClick={() => openModal(c.code)} className={theme.btn.primary + ' w-full'}>Ajouter</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modalCarrier && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setModalCarrier(null)}>
          <div className="rounded-xl border p-6 w-full max-w-sm" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-200 mb-4">
              Connecter {CARRIERS.find(c => c.code === modalCarrier)?.label}
            </h3>
            <label className={theme.labelDark}>API ID</label>
            <input value={apiId} onChange={e => setApiId(e.target.value)} className={theme.inputDark + ' mb-3'} />
            <label className={theme.labelDark}>API Token</label>
            <input value={apiToken} onChange={e => setApiToken(e.target.value)} type="password" className={theme.inputDark + ' mb-4'} />
            <div className="flex gap-2">
              <button onClick={() => setModalCarrier(null)} className={theme.btn.secondary + ' flex-1'}>Annuler</button>
              <button onClick={saveAccount} disabled={saving} className={theme.btn.primary + ' flex-1'}>
                {saving ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
```

- [ ] **Step 2: Ajouter la route dans `frontend/src/App.jsx`**

Ajouter l'import (après `import StockPage from './pages/StockPage'`) :

```jsx
import ParametresLivraisonPage from './pages/ParametresLivraisonPage'
```

Ajouter la route (après la ligne `<Route path="/dashboard/stock" ...>`) :

```jsx
          <Route path="/dashboard/parametres-livraison"      element={<PD><ParametresLivraisonPage /></PD>} />
```

- [ ] **Step 3: Ajouter le lien sidebar dans `frontend/src/components/DashboardLayout.jsx`**

Dans la section `{/* PARAMÈTRES */}` (`frontend/src/components/DashboardLayout.jsx:300-321`), ajouter une entrée juste après le bloc `{mainLink('/dashboard/boutique', ...)}` et avant `{!['confirmateur', 'dropshipper'].includes(teamRole) && (<li>{mainLink('/dashboard/equipe', ...)}</li>)}` :

```jsx
                <li>{mainLink('/dashboard/parametres-livraison', ICONS.shipping, 'Paramètres livraison')}</li>
```

(`ICONS.shipping` existe déjà — utilisé actuellement par `disabled(ICONS.shipping, 'Expéditions')` à la ligne 291 de ce même fichier.)

- [ ] **Step 4: Vérification manuelle**

Run:
```bash
cd backend && venv/Scripts/python manage.py runserver
cd frontend && npm run dev
```
Ouvrir `http://localhost:5173/dashboard/parametres-livraison` (connecté en tant que owner) :
- Les deux cartes Yalidine / ZR Express s'affichent avec un bouton "Ajouter".
- Cliquer "Ajouter" sur Yalidine, saisir un API ID/Token factices, "Enregistrer" → la carte passe à "Connecté" avec la case "Transporteur par défaut".
- Cocher la case par défaut sur ZR Express après l'avoir connecté → vérifier que Yalidine se décoche automatiquement (rafraîchir si besoin).
- "Retirer" un compte → la carte revient à l'état "Ajouter".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ParametresLivraisonPage.jsx frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx
git commit -m "feat(frontend): add Paramètres livraison page for carrier account management"
```

---

### Task 7: Sélecteur transporteur + suivi dans `OrderDetailPage.jsx`

**Files:**
- Modify: `frontend/src/pages/orders/OrderDetailPage.jsx`

**Interfaces:**
- Consumes: `GET /api/stores/me/carriers/` (Task 4), `POST /api/orders/{id}/status/` étendu avec `carrier_id` optionnel et réponse `carrier_warning` (Task 5), champs `order.carrier_label`, `order.carrier_tracking_number`, `order.carrier_status` (Task 3).
- Produces: rien de consommé par d'autres tâches — fin de la chaîne.

- [ ] **Step 1: Charger les comptes transporteurs actifs et ajouter l'état associé**

Dans `frontend/src/pages/orders/OrderDetailPage.jsx`, ajouter après la ligne `const [confirmateurs, setConfirmateurs] = useState([])` :

```jsx
  const [carrierAccounts, setCarrierAccounts] = useState([])
  const [selectedCarrierId, setSelectedCarrierId] = useState('')
  const [carrierWarning, setCarrierWarning] = useState('')
```

Modifier le `useEffect` existant (celui qui appelle `api.get('/team/members/?role=confirmateur')`) pour ajouter l'appel :

```jsx
  useEffect(() => {
    fetchOrder()
    api.get('/team/members/?role=confirmateur').then(({ data }) => setConfirmateurs(data)).catch(() => {})
    api.get('/stores/me/carriers/').then(({ data }) => setCarrierAccounts(data.filter(a => a.is_active))).catch(() => {})
  }, [fetchOrder])
```

- [ ] **Step 2: Envoyer le transporteur choisi et afficher l'avertissement**

Remplacer la fonction `changeStatus` existante par :

```jsx
  const changeStatus = async () => {
    if (!newStatus || newStatus === order?.status) return
    setSavingStatus(true)
    setCarrierWarning('')
    try {
      const payload = { status: newStatus, note: statusNote }
      if (newStatus === 'confirmed' && selectedCarrierId) payload.carrier_id = selectedCarrierId
      const { data } = await api.post(`/orders/${id}/status/`, payload)
      if (data.carrier_warning) setCarrierWarning(data.carrier_warning)
      setStatusNote('')
      fetchOrder()
    } catch {} finally { setSavingStatus(false) }
  }
```

- [ ] **Step 3: Afficher le sélecteur de transporteur (si plusieurs comptes actifs) et le tracking**

Dans le bloc "Changer le statut" (`frontend/src/pages/orders/OrderDetailPage.jsx:226-235`), insérer le sélecteur juste avant le `<textarea>` de note, conditionné à `newStatus === 'confirmed'` et à la présence de plusieurs comptes :

```jsx
            {newStatus === 'confirmed' && carrierAccounts.length > 1 && (
              <select value={selectedCarrierId} onChange={e => setSelectedCarrierId(e.target.value)} className={inputCls + ' mb-2'} style={{ ...bdrStyle, background: theme.dark.sidebar }}>
                <option value="">Transporteur par défaut de la boutique</option>
                {carrierAccounts.map(a => <option key={a.id} value={a.id}>{a.carrier_label}</option>)}
              </select>
            )}
```

Puis, juste après le `<button onClick={changeStatus} ...>` de ce même bloc, ajouter l'affichage de l'avertissement transporteur :

```jsx
            {carrierWarning && (
              <p className="mt-2 text-xs text-amber-400">{carrierWarning}</p>
            )}
```

Enfin, dans le bloc "Infos client" (`frontend/src/pages/orders/OrderDetailPage.jsx:135-150`), ajouter le suivi transporteur à la liste des champs affichés quand il existe — remplacer le tableau de paires par :

```jsx
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[
                ['Nom', `${order.first_name} ${order.last_name}`],
                ['Téléphone', order.phone],
                ['Wilaya', order.wilaya],
                ['Commune', order.commune || '—'],
                ['Livraison', order.delivery_type || '—'],
                ['Paiement', order.payment_method_label || '—'],
                ['Total', `${Number(order.total).toLocaleString('fr-DZ')} DZD`],
                ...(order.carrier_tracking_number
                  ? [['Transporteur', `${order.carrier_label} — ${order.carrier_tracking_number}`]]
                  : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs mb-0.5" style={{ color: theme.dark.muted }}>{label}</p>
                  <p className="text-gray-200 font-medium">{value}</p>
                </div>
              ))}
            </div>
```

- [ ] **Step 4: Vérification manuelle**

Avec le backend et le frontend lancés (Task 6, Step 4) :
- Sans compte transporteur configuré : ouvrir une commande, passer le statut à "Confirmée" → un message ambre "Aucun transporteur configuré — expédition non créée." s'affiche, le statut passe bien à "Confirmée".
- Connecter Yalidine et le marquer par défaut (via `/dashboard/parametres-livraison`) → confirmer une nouvelle commande → le champ "Transporteur" apparaît dans les infos client avec un tracking `MOCK-yalidine-...`.
- Connecter aussi ZR Express (sans le marquer par défaut) → sur une nouvelle commande passée à "Confirmée", le sélecteur de transporteur apparaît ; choisir ZR Express → vérifier que le tracking commence par `MOCK-zr_express-`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/orders/OrderDetailPage.jsx
git commit -m "feat(frontend): carrier selection and tracking display on order confirmation"
```

---

## Verification (end-to-end)

1. Suite backend complète : `cd backend && venv/Scripts/python manage.py test orders -v 2` → tous les tests des Tasks 1-5 passent.
2. `venv/Scripts/python manage.py test` (suite complète) → pas de régression sur les autres apps.
3. Parcours manuel complet décrit aux Steps de vérification des Tasks 6 et 7 (connexion compte, transporteur par défaut, confirmation de commande avec et sans transporteur, override ponctuel).
4. Relire `docs/superpowers/specs/2026-07-02-carrier-integration-design.md` — confirmer que chaque US-6.1.1 / US-6.1.2 du cahier des charges est couverte par au moins une tâche ci-dessus.
