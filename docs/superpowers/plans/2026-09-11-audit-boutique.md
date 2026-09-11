# Audit global de la boutique Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un audit global de la boutique — 4 scores de dimension + score global, 100% déterministes, avec une synthèse IA (points forts/faibles/recommandations) générée à la demande et sauvegardée jusqu'au prochain recalcul.

**Architecture:** Module pur `stores/audit.py` (aucun appel réseau, aucun appel IA), modèle `stores.StoreAudit` (une ligne par boutique, écrasée à chaque recalcul), consommé par 2 endpoints (`stores/views.py`) et une nouvelle page dashboard sous le menu IA.

**Tech Stack:** Django 5.2 + DRF (backend existant), React 18 (frontend existant).

## Global Constraints

- Aucun calcul de chiffre par un LLM — uniquement du calcul Python déterministe ; le LLM ne fait que rédiger une synthèse à partir de chiffres déjà calculés, jamais l'historique brut.
- Chaque dimension retourne `None` (pas 0) si les données sont insuffisantes pour un calcul honnête — le score global ignore les dimensions `None` dans sa moyenne.
- Réutiliser telles quelles les définitions déjà établies dans le projet : `orders.stats_views.REAL_EXCLUDED_STATUSES` (`['duplicate', 'fake']`), `orders.stats_views.CONFIRMED_STATUSES` (`['confirmed', 'shipped', 'delivered']`), `orders.views.RISK_STATUSES` (`['cancelled', 'returned']`), `StoreSettings.low_stock_threshold`/`risk_threshold_orders`/`risk_period_days`.
- Nouvelle permission `store_audit_view`, catégorie IA, masquée par défaut confirmateur/dropshipper.
- `POST /api/stores/me/audit/` sauvegarde toujours les scores calculés, même si l'appel IA échoue (dégradation `503` sur la synthèse uniquement, jamais sur les scores).
- Pas de recalcul automatique planifié — uniquement à la demande (bouton "Analyser ma boutique"/"Réanalyser").
- Tests obligatoires par tâche, commits fréquents, jamais `git add -A`. Avant chaque `git add` sur un fichier partagé (`team/models.py`, `App.jsx`, `DashboardLayout.jsx`, `stores/urls.py`, `stores/views.py`), vérifier `git diff <fichier>` pour isoler son propre diff d'un éventuel travail en cours d'un autre terminal.

---

## File Structure

```
backend/
  stores/
    audit.py                — compute_store_audit() pur (nouveau)
    models.py                 — StoreAudit (modifié)
    migrations/000X_storeaudit.py — nouvelle migration (généré)
    serializers.py              — StoreAuditSerializer (modifié)
    views.py                     — StoreAuditView (modifié)
    urls.py                       — route me/audit/ (modifié)
    tests.py                       — tests des 2 tâches backend (modifié)
  team/
    models.py                      — permission store_audit_view (modifié)

frontend/src/
  pages/orders/StoreAuditPage.jsx  — nouvelle page (nouveau)
  tests/pages/orders/StoreAuditPage.test.jsx — tests (nouveau)
  App.jsx                             — route + import (modifié)
  components/DashboardLayout.jsx     — lien sidebar sous IA (modifié)

CLAUDE.md — section Assistant IA étendue (modifié, dernière tâche)
```

---

### Task 1: `audit.py` — calcul déterministe pur

**Files:**
- Create: `backend/stores/audit.py`
- Test: `backend/stores/tests.py`

**Interfaces:**
- Produces: `compute_store_audit(store) -> {'global_score': int|None, 'dimensions': {'catalogue': {'score': int|None, 'details': dict}, 'logistics': {...}, 'stock': {...}, 'returns_risk': {...}}}`

- [ ] **Step 1: Vérifier l'existence et la structure de `backend/stores/tests.py`**

Run: `Get-Content backend/stores/tests.py -TotalCount 20` (ou `head -20` sous bash) — confirmer les imports déjà présents (`TestCase`, `make_owner`, etc., voir `core/test_utils.py`). Ajouter les imports manquants en tête de fichier si nécessaire, avec le même style que le reste du fichier.

- [ ] **Step 2: Écrire les tests**

Ajouter à `backend/stores/tests.py` :
```python
class StoreAuditEngineTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_catalogue_score_no_active_products_returns_none(self):
        from stores.audit import compute_store_audit
        result = compute_store_audit(self.store)
        self.assertIsNone(result['dimensions']['catalogue']['score'])

    def test_catalogue_score_full_completeness_is_100(self):
        from products.models import Product, Category, ProductImage
        from stores.audit import compute_store_audit
        cat = Category.objects.create(store=self.store, name='Cat')
        p = Product.objects.create(store=self.store, name='Complet', price=1000, cost_price=500,
                                    description='Une description', stock=5, is_active=True)
        p.categories.add(cat)
        ProductImage.objects.create(product=p, image='products/x.jpg')
        result = compute_store_audit(self.store)
        self.assertEqual(result['dimensions']['catalogue']['score'], 100)

    def test_catalogue_score_incomplete_product_lowers_score(self):
        from products.models import Product
        from stores.audit import compute_store_audit
        Product.objects.create(store=self.store, name='Incomplet', price=1000, stock=5, is_active=True)
        result = compute_store_audit(self.store)
        self.assertEqual(result['dimensions']['catalogue']['score'], 0)

    def test_logistics_score_none_without_recent_orders(self):
        from stores.audit import compute_store_audit
        result = compute_store_audit(self.store)
        self.assertIsNone(result['dimensions']['logistics']['score'])

    def _make_order(self, status, days_ago=1, created_at=None):
        from django.utils import timezone
        from orders.models import Order
        o = Order.objects.create(
            store=self.store, first_name='C', last_name='L', phone='0555000000',
            wilaya='Alger', commune='Alger Centre', address='Adr', status=status,
            subtotal=1000, shipping_cost=0, total=1000,
        )
        o.created_at = created_at or (timezone.now() - timezone.timedelta(days=days_ago))
        o.save(update_fields=['created_at'])
        return o

    def test_logistics_score_penalizes_late_pending_orders(self):
        from django.utils import timezone
        from stores.audit import compute_store_audit
        self._make_order('confirmed', days_ago=1)
        self._make_order('confirmed', days_ago=1)
        self._make_order('pending', created_at=timezone.now() - timezone.timedelta(hours=48))
        result = compute_store_audit(self.store)
        # confirmation_rate = 2/3*100 = 66.7, late_ratio = 1/1 = 1 -> score = round(66.7 * 0.5) = 33
        self.assertEqual(result['dimensions']['logistics']['score'], 33)

    def test_logistics_score_excludes_duplicate_and_fake(self):
        from stores.audit import compute_store_audit
        self._make_order('confirmed', days_ago=1)
        self._make_order('duplicate', days_ago=1)
        self._make_order('fake', days_ago=1)
        result = compute_store_audit(self.store)
        self.assertEqual(result['dimensions']['logistics']['score'], 100)

    def test_stock_score_none_without_active_products(self):
        from stores.audit import compute_store_audit
        result = compute_store_audit(self.store)
        self.assertIsNone(result['dimensions']['stock']['score'])

    def test_stock_score_penalizes_out_of_stock_more_than_low_stock(self):
        from products.models import Product
        from stores.audit import compute_store_audit
        Product.objects.create(store=self.store, name='OK', price=100, stock=50, is_active=True)
        Product.objects.create(store=self.store, name='Bas', price=100, stock=3, is_active=True)
        Product.objects.create(store=self.store, name='Rupture', price=100, stock=0, is_active=True)
        result = compute_store_audit(self.store)
        # out_of_stock_ratio = 1/3, low_stock_ratio = 1/3 (seuil défaut 5)
        # score = round(100 - 33.33*0.7 - 33.33*0.3) = round(100 - 33.33) = 67
        self.assertEqual(result['dimensions']['stock']['score'], 67)

    def test_returns_risk_score_none_without_any_signal(self):
        from stores.audit import compute_store_audit
        result = compute_store_audit(self.store)
        self.assertIsNone(result['dimensions']['returns_risk']['score'])

    def test_returns_risk_score_penalizes_untreated_risk_and_losses(self):
        from products.models import Product
        from stores.audit import compute_store_audit
        self._make_order('cancelled', days_ago=1)
        self._make_order('cancelled', days_ago=1)
        self._make_order('cancelled', days_ago=1)  # 3 cancelled même téléphone -> auto-détecté à risque, jamais marqué manuellement
        Product.objects.create(store=self.store, name='Perte', price=100, cost_price=200, stock=5, is_active=True)
        result = compute_store_audit(self.store)
        self.assertLess(result['dimensions']['returns_risk']['score'], 100)

    def test_global_score_ignores_none_dimensions(self):
        from products.models import Product, Category, ProductImage
        from stores.audit import compute_store_audit
        cat = Category.objects.create(store=self.store, name='Cat')
        p = Product.objects.create(store=self.store, name='Complet', price=1000, cost_price=500,
                                    description='Une description', stock=5, is_active=True)
        p.categories.add(cat)
        ProductImage.objects.create(product=p, image='products/x.jpg')
        # Aucune commande -> logistics=None, returns_risk=None (aucun signal) ;
        # seuls catalogue=100 et stock (produit non en rupture, pas bas) comptent.
        result = compute_store_audit(self.store)
        self.assertIsNotNone(result['global_score'])
        self.assertIsNone(result['dimensions']['logistics']['score'])
```

⚠️ Vérifier `ProductImage.image='products/x.jpg'` — si le champ exige un vrai fichier uploadé (`ImageField` avec validators stricts), remplacer par une image factice comme `PNG_1PX` déjà utilisée dans `products/tests.py` (`SimpleUploadedFile`) plutôt qu'une chaîne brute qui pourrait échouer à la validation du modèle en `full_clean()` — mais comme ce test utilise `.objects.create()` direct (pas de serializer), `full_clean()` n'est pas appelé automatiquement ; à vérifier à l'implémentation si une erreur apparaît.

- [ ] **Step 3: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test stores.tests.StoreAuditEngineTest -v 2`
Expected: `ModuleNotFoundError: No module named 'stores.audit'`

- [ ] **Step 4: Implémenter `audit.py`**

```python
"""Audit global de la boutique — calcul DÉTERMINISTE pur, aucun appel réseau,
aucun appel IA. Voir docs/superpowers/specs/2026-09-11-audit-boutique-design.md."""
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from orders.stats_views import REAL_EXCLUDED_STATUSES, CONFIRMED_STATUSES
from orders.views import RISK_STATUSES

LOGISTICS_WINDOW_DAYS = 30
RETURNS_WINDOW_DAYS = 30
LATE_PENDING_HOURS = 24


def _clamp(value):
    return max(0, min(100, round(value)))


def _catalogue_score(store):
    from products.models import Product
    products = store.products.filter(is_active=True)
    total = products.count()
    if total == 0:
        return {'score': None, 'details': {'active_products': 0}}

    with_image = products.filter(images__isnull=False).distinct().count()
    with_description = products.exclude(description='').filter(description__isnull=False).count()
    with_cost_price = products.exclude(cost_price__isnull=True).count()
    with_category = products.filter(categories__isnull=False).distinct().count()

    rates = [with_image / total, with_description / total, with_cost_price / total, with_category / total]
    score = _clamp(sum(rates) / len(rates) * 100)
    return {'score': score, 'details': {
        'active_products': total,
        'pct_with_image': round(with_image / total * 100, 1),
        'pct_with_description': round(with_description / total * 100, 1),
        'pct_with_cost_price': round(with_cost_price / total * 100, 1),
        'pct_with_category': round(with_category / total * 100, 1),
    }}


def _logistics_score(store):
    since = timezone.now() - timedelta(days=LOGISTICS_WINDOW_DAYS)
    qs = store.orders.filter(created_at__gte=since).exclude(status__in=REAL_EXCLUDED_STATUSES)
    total = qs.count()
    if total == 0:
        return {'score': None, 'details': {'orders': 0}}

    confirmed = qs.filter(status__in=CONFIRMED_STATUSES).count()
    confirmation_rate = confirmed / total * 100

    late_cutoff = timezone.now() - timedelta(hours=LATE_PENDING_HOURS)
    pending_qs = qs.filter(status='pending')
    pending_total = pending_qs.count()
    late_pending = pending_qs.filter(created_at__lte=late_cutoff).count()
    late_ratio = (late_pending / pending_total) if pending_total else 0.0

    score = _clamp(confirmation_rate * (1 - late_ratio * 0.5))
    return {'score': score, 'details': {
        'orders': total, 'confirmation_rate': round(confirmation_rate, 1),
        'pending_total': pending_total, 'late_pending': late_pending,
    }}


def _stock_score(store):
    products = store.products.filter(is_active=True)
    total = products.count()
    if total == 0:
        return {'score': None, 'details': {'active_products': 0}}

    try:
        threshold = store.settings.low_stock_threshold
    except Exception:
        threshold = 5

    out_of_stock = sum(1 for p in products if p.total_stock == 0)
    low_stock = sum(1 for p in products if 0 < p.total_stock <= threshold)

    out_of_stock_ratio = out_of_stock / total
    low_stock_ratio = low_stock / total
    score = _clamp(100 - out_of_stock_ratio * 70 - low_stock_ratio * 30)
    return {'score': score, 'details': {
        'active_products': total, 'out_of_stock': out_of_stock, 'low_stock': low_stock,
    }}


def _returns_risk_score(store):
    from products.models import Product
    from orders.models import CustomerRisk

    since = timezone.now() - timedelta(days=RETURNS_WINDOW_DAYS)
    orders_qs = store.orders.filter(created_at__gte=since)
    total_orders = orders_qs.count()
    return_rate = (orders_qs.filter(status='returned').count() / total_orders * 100) if total_orders else None

    try:
        risk_threshold = store.settings.risk_threshold_orders
        risk_period_days = store.settings.risk_period_days
    except Exception:
        risk_threshold, risk_period_days = 3, 90
    risk_cutoff = timezone.now() - timedelta(days=risk_period_days)
    risky_phones = (store.orders
                     .filter(status__in=RISK_STATUSES, created_at__gte=risk_cutoff)
                     .values('phone')
                     .annotate(risky_count=Count('id'))
                     .filter(risky_count__gte=risk_threshold)
                     .values_list('phone', flat=True))
    risky_phones = set(risky_phones)
    manual_risk_phones = set(CustomerRisk.objects.filter(store=store, manual_risk=True, phone__in=risky_phones)
                              .values_list('phone', flat=True))
    untreated_risk_ratio = (len(risky_phones - manual_risk_phones) / len(risky_phones)) if risky_phones else None

    products_with_cost = store.products.filter(is_active=True).exclude(cost_price__isnull=True)
    total_with_cost = products_with_cost.count()
    at_loss = products_with_cost.filter(price__lt=models_F('cost_price')).count() if total_with_cost else 0
    loss_ratio = (at_loss / total_with_cost) if total_with_cost else None

    if return_rate is None and untreated_risk_ratio is None and loss_ratio is None:
        return {'score': None, 'details': {}}

    score = 100.0
    if return_rate is not None:
        score -= return_rate * 0.5
    if untreated_risk_ratio is not None:
        score -= untreated_risk_ratio * 30
    if loss_ratio is not None:
        score -= loss_ratio * 20
    return {'score': _clamp(score), 'details': {
        'return_rate': round(return_rate, 1) if return_rate is not None else None,
        'at_risk_customers': len(risky_phones), 'untreated_at_risk_customers': len(risky_phones - manual_risk_phones),
        'products_at_loss': at_loss,
    }}


def compute_store_audit(store):
    dimensions = {
        'catalogue': _catalogue_score(store),
        'logistics': _logistics_score(store),
        'stock': _stock_score(store),
        'returns_risk': _returns_risk_score(store),
    }
    scores = [d['score'] for d in dimensions.values() if d['score'] is not None]
    global_score = _clamp(sum(scores) / len(scores)) if scores else None
    return {'global_score': global_score, 'dimensions': dimensions}
```

⚠️ `models_F('cost_price')` dans `_returns_risk_score` est un espace réservé fautif — remplacer par un import correct : ajouter `from django.db.models import F` en tête de fichier et utiliser `F('cost_price')` directement (`products_with_cost.filter(price__lt=F('cost_price'))`). Corriger avant de lancer les tests, cette étape ne doit pas être recopiée telle quelle.

- [ ] **Step 5: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test stores.tests.StoreAuditEngineTest -v 2`
Expected: `Ran 11 tests ... OK`

- [ ] **Step 6: Commit**

```bash
git diff backend/stores/tests.py | head -5
git add backend/stores/audit.py backend/stores/tests.py
git commit -m "feat(store-audit): calcul déterministe des 4 scores de dimension

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Modèle `StoreAudit` + permission

**Files:**
- Modify: `backend/stores/models.py`
- Create: migration (générée)
- Modify: `backend/team/models.py`

**Interfaces:**
- Produces: modèle `stores.models.StoreAudit` (`store` OneToOne, `computed_at`, `global_score`, `catalogue_score`, `logistics_score`, `stock_score`, `returns_risk_score`, `details` JSONField, `synthesis` TextField). Permission `store_audit_view`.

- [ ] **Step 1: Ajouter le modèle**

À la fin de `backend/stores/models.py` :
```python
class StoreAudit(models.Model):
    """Dernier audit calculé pour la boutique — une seule ligne, écrasée à
    chaque recalcul (pas d'historique en v1). Scores 100% déterministes
    (stores/audit.py), synthesis = texte IA généré à partir de ces scores."""
    store = models.OneToOneField(Store, on_delete=models.CASCADE, related_name='audit')
    computed_at = models.DateTimeField(auto_now=True)
    global_score = models.PositiveSmallIntegerField(null=True)
    catalogue_score = models.PositiveSmallIntegerField(null=True)
    logistics_score = models.PositiveSmallIntegerField(null=True)
    stock_score = models.PositiveSmallIntegerField(null=True)
    returns_risk_score = models.PositiveSmallIntegerField(null=True)
    details = models.JSONField(default=dict)
    synthesis = models.TextField(blank=True)

    def __str__(self):
        return f"Audit {self.store.name} — {self.global_score}"
```

- [ ] **Step 2: Générer et vérifier la migration**

Run: `cd backend && venv/Scripts/python manage.py makemigrations stores`
Expected: crée `stores/migrations/000X_storeaudit.py` (numéro exact dépend des migrations déjà présentes). Lire le fichier généré pour confirmer qu'il ne contient qu'une création de table (`CreateModel`), rien d'autre.

- [ ] **Step 3: Appliquer localement et vérifier**

Run: `venv/Scripts/python manage.py migrate stores`
Expected: `Applying stores.000X_storeaudit... OK`

- [ ] **Step 4: Ajouter la permission dans `team/models.py`**

Vérifier d'abord `git diff backend/team/models.py` (doit être vide). Juste après :
```python
    ('recommendations_view',        'Recommandations produit'),
```
Ajouter :
```python
    ('store_audit_view',            'Audit de la boutique'),
```
Juste après :
```python
    'recommendations_view':         ('Ventes & finances', 'Statistiques'),
```
Ajouter :
```python
    'store_audit_view':             ('Ventes & finances', 'Statistiques'),
```
Dans les deux occurrences de :
```python
        'stats_returns_forecast_view': False, 'recommendations_view': False,
```
Remplacer par :
```python
        'stats_returns_forecast_view': False, 'recommendations_view': False, 'store_audit_view': False,
```

- [ ] **Step 5: Vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test team stores -v 1`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git diff backend/team/models.py
git add backend/stores/models.py backend/stores/migrations/ backend/team/models.py
git commit -m "feat(store-audit): modèle StoreAudit + permission store_audit_view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Endpoints `GET`/`POST /api/stores/me/audit/`

**Files:**
- Modify: `backend/stores/serializers.py`
- Modify: `backend/stores/views.py`
- Modify: `backend/stores/urls.py`
- Test: `backend/stores/tests.py`

**Interfaces:**
- Consumes: `stores.audit.compute_store_audit(store)` (Task 1), `stores.models.StoreAudit` (Task 2), `ai_assistant.ollama_client.generate()`/`OllamaUnavailableError`.
- Produces: `GET /api/stores/me/audit/` (200 avec le dernier audit, 404 si aucun), `POST /api/stores/me/audit/` (recalcule, sauvegarde, 200 avec le résultat, ou 200 avec `synthesis: ''` + `ai_unavailable: true` si l'IA échoue — jamais 503 sur cet endpoint puisque les scores doivent être renvoyés quoi qu'il arrive).

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/stores/tests.py` :
```python
class StoreAuditViewsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.client_ = auth_client(self.owner)

    def test_get_returns_404_without_prior_audit(self):
        resp = self.client_.get('/api/stores/me/audit/')
        self.assertEqual(resp.status_code, 404)

    def test_post_requires_permission(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.post('/api/stores/me/audit/')
        self.assertEqual(resp.status_code, 403)

    def test_post_computes_and_saves_even_with_no_data(self):
        from unittest.mock import patch
        with patch('stores.views.ollama_client.generate', return_value='Synthèse test.'):
            resp = self.client_.post('/api/stores/me/audit/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['global_score'])
        self.assertEqual(resp.data['synthesis'], 'Synthèse test.')

    def test_post_saves_scores_even_if_ai_fails(self):
        from unittest.mock import patch
        from ai_assistant.ollama_client import OllamaUnavailableError
        from products.models import Product, Category, ProductImage
        cat = Category.objects.create(store=self.store, name='Cat')
        p = Product.objects.create(store=self.store, name='Complet', price=1000, cost_price=500,
                                    description='Une description', stock=5, is_active=True)
        p.categories.add(cat)
        ProductImage.objects.create(product=p, image='products/x.jpg')
        with patch('stores.views.ollama_client.generate', side_effect=OllamaUnavailableError('down')):
            resp = self.client_.post('/api/stores/me/audit/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.data['global_score'])
        self.assertEqual(resp.data['synthesis'], '')
        self.assertTrue(resp.data['ai_unavailable'])

    def test_get_returns_saved_audit_after_post(self):
        from unittest.mock import patch
        with patch('stores.views.ollama_client.generate', return_value='Synthèse test.'):
            self.client_.post('/api/stores/me/audit/')
        resp = self.client_.get('/api/stores/me/audit/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['synthesis'], 'Synthèse test.')
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `venv/Scripts/python manage.py test stores.tests.StoreAuditViewsTest -v 2`
Expected: `404` sur chaque test (route inexistante).

- [ ] **Step 3: Ajouter `StoreAuditSerializer`**

Dans `backend/stores/serializers.py`, ajouter (importer `StoreAudit` depuis `.models` dans l'import existant en tête de fichier) :
```python
class StoreAuditSerializer(serializers.ModelSerializer):
    ai_unavailable = serializers.SerializerMethodField()

    class Meta:
        model = StoreAudit
        fields = ['computed_at', 'global_score', 'catalogue_score', 'logistics_score',
                  'stock_score', 'returns_risk_score', 'details', 'synthesis', 'ai_unavailable']

    def get_ai_unavailable(self, obj):
        return not obj.synthesis
```

- [ ] **Step 4: Ajouter `StoreAuditView`**

Dans `backend/stores/views.py`, ajouter les imports nécessaires en tête de fichier (`from .models import ... StoreAudit`, `from .serializers import ... StoreAuditSerializer`, `from ai_assistant import ollama_client`, `from ai_assistant.ollama_client import OllamaUnavailableError`), puis à la fin du fichier :
```python
class StoreAuditView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'store_audit_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            audit = store.audit
        except StoreAudit.DoesNotExist:
            return Response({'detail': "Aucun audit n'a encore été calculé."}, status=404)
        return Response(StoreAuditSerializer(audit).data)

    def post(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'store_audit_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        from .audit import compute_store_audit
        result = compute_store_audit(store)
        dims = result['dimensions']

        prompt_lines = [f"Analyse de la boutique {store.name} :"]
        if dims['catalogue']['score'] is not None:
            d = dims['catalogue']['details']
            prompt_lines.append(
                f"- Catalogue (score {dims['catalogue']['score']}/100) : {d['pct_with_image']}% des produits actifs "
                f"ont une image, {d['pct_with_description']}% ont une description, {d['pct_with_cost_price']}% ont "
                f"un prix d'achat renseigné, {d['pct_with_category']}% ont une catégorie."
            )
        if dims['logistics']['score'] is not None:
            d = dims['logistics']['details']
            prompt_lines.append(
                f"- Confirmation & logistique (score {dims['logistics']['score']}/100) : taux de confirmation "
                f"{d['confirmation_rate']}% sur {d['orders']} commandes (30 derniers jours), "
                f"{d['late_pending']} commande(s) en attente depuis plus de 24h sur {d['pending_total']}."
            )
        if dims['stock']['score'] is not None:
            d = dims['stock']['details']
            prompt_lines.append(
                f"- Stock (score {dims['stock']['score']}/100) : {d['out_of_stock']} produit(s) en rupture, "
                f"{d['low_stock']} en stock bas, sur {d['active_products']} produits actifs."
            )
        if dims['returns_risk']['score'] is not None:
            d = dims['returns_risk']['details']
            prompt_lines.append(
                f"- Retours & clients à risque (score {dims['returns_risk']['score']}/100) : taux de retour "
                f"{d['return_rate']}%, {d['untreated_at_risk_customers']} client(s) à risque sur "
                f"{d['at_risk_customers']} jamais traités manuellement, {d['products_at_loss']} produit(s) vendu(s) "
                "à un prix inférieur à leur coût d'achat."
            )
        prompt_lines.append(
            "Rédige en français, de façon concise (pas plus de 8 phrases au total), une synthèse en 3 blocs : "
            "Points forts (2-3 phrases), Points faibles (2-3 phrases), Recommandations (2-4 actions concrètes, une "
            "par point faible significatif). Base-toi UNIQUEMENT sur les chiffres fournis ci-dessus, n'invente rien "
            "d'autre — si une dimension est absente ci-dessus, ne la mentionne pas."
        )
        prompt = '\n'.join(prompt_lines)

        ai_unavailable = False
        try:
            synthesis = ollama_client.generate(prompt).strip()
        except OllamaUnavailableError:
            synthesis = ''
            ai_unavailable = True

        audit, _ = StoreAudit.objects.update_or_create(store=store, defaults={
            'global_score': result['global_score'],
            'catalogue_score': dims['catalogue']['score'],
            'logistics_score': dims['logistics']['score'],
            'stock_score': dims['stock']['score'],
            'returns_risk_score': dims['returns_risk']['score'],
            'details': dims,
            'synthesis': synthesis,
        })
        data = StoreAuditSerializer(audit).data
        data['ai_unavailable'] = ai_unavailable
        return Response(data)
```

- [ ] **Step 5: Enregistrer la route**

Dans `backend/stores/urls.py` :
```python
from .views import (MyStoreView, QuotaView, StoreSettingsView, PixelConfigListCreateView, PixelConfigDetailView,
                     SubscriptionPlanListView, SubscribeView, StoreAuditView)

urlpatterns = [
    path('me/',          MyStoreView.as_view(),      name='store-me'),
    path('me/quota/',    QuotaView.as_view(),         name='store-quota'),
    path('me/settings/', StoreSettingsView.as_view(), name='store-settings'),
    path('me/audit/',    StoreAuditView.as_view()),
    path('me/pixels/',        PixelConfigListCreateView.as_view()),
    path('me/pixels/<int:pk>/', PixelConfigDetailView.as_view()),
    path('plans/',        SubscriptionPlanListView.as_view()),
    path('me/subscribe/', SubscribeView.as_view()),
]
```

- [ ] **Step 6: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test stores.tests.StoreAuditViewsTest -v 2`
Expected: `Ran 5 tests ... OK`

- [ ] **Step 7: Run toute la suite `stores` pour vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test stores -v 1 --noinput`
Expected: `OK`.

- [ ] **Step 8: Commit**

```bash
git diff backend/stores/urls.py backend/stores/views.py backend/stores/serializers.py
git add backend/stores/serializers.py backend/stores/views.py backend/stores/urls.py backend/stores/tests.py
git commit -m "feat(store-audit): endpoints GET/POST /api/stores/me/audit/

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — page `StoreAuditPage.jsx`

**Files:**
- Create: `frontend/src/pages/orders/StoreAuditPage.jsx`
- Test: `frontend/src/tests/pages/orders/StoreAuditPage.test.jsx`

**Interfaces:**
- Consumes: `GET/POST /stores/me/audit/` (Task 3) → `{computed_at, global_score, catalogue_score, logistics_score, stock_score, returns_risk_score, details, synthesis, ai_unavailable}`.

- [ ] **Step 1: Écrire les tests**

```jsx
// frontend/src/tests/pages/orders/StoreAuditPage.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import StoreAuditPage from '../../../pages/orders/StoreAuditPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
import api from '../../../api/axios'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

const AUDIT_RESULT = {
  computed_at: '2026-09-11T10:00:00Z', global_score: 72,
  catalogue_score: 60, logistics_score: 85, stock_score: 90, returns_risk_score: 55,
  details: {
    catalogue: { score: 60, details: { active_products: 10, pct_with_image: 60 } },
    logistics: { score: 85, details: { orders: 20, confirmation_rate: 85 } },
    stock: { score: 90, details: { active_products: 10, out_of_stock: 0, low_stock: 1 } },
    returns_risk: { score: 55, details: { return_rate: 10 } },
  },
  synthesis: 'Points forts : bonne logistique.\nPoints faibles : catalogue incomplet.',
  ai_unavailable: false,
}

describe('StoreAuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche le bouton "Analyser ma boutique" quand aucun audit n\'existe', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 404 } })
    render(<MemoryRouter><StoreAuditPage /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /Analyser ma boutique/ })).toBeInTheDocument()
  })

  it('affiche le score global et la synthèse après un audit existant', async () => {
    api.get.mockResolvedValueOnce({ data: AUDIT_RESULT })
    render(<MemoryRouter><StoreAuditPage /></MemoryRouter>)
    expect(await screen.findByText('72')).toBeInTheDocument()
    expect(screen.getByText(/bonne logistique/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Réanalyser/ })).toBeInTheDocument()
  })

  it('relance un calcul au clic sur "Analyser ma boutique"', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 404 } })
    api.post.mockResolvedValueOnce({ data: AUDIT_RESULT })
    render(<MemoryRouter><StoreAuditPage /></MemoryRouter>)
    const button = await screen.findByRole('button', { name: /Analyser ma boutique/ })
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByText('72')).toBeInTheDocument())
  })

  it('affiche un message si la synthèse IA est indisponible', async () => {
    api.get.mockResolvedValueOnce({ data: { ...AUDIT_RESULT, synthesis: '', ai_unavailable: true } })
    render(<MemoryRouter><StoreAuditPage /></MemoryRouter>)
    expect(await screen.findByText('72')).toBeInTheDocument()
    expect(screen.getByText(/Synthèse indisponible/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd frontend && npm run test -- StoreAuditPage`
Expected: échec (module inexistant).

- [ ] **Step 3: Créer `StoreAuditPage.jsx`**

```jsx
import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className={theme.badge.neutral}>—</span>
  if (score < 50) return <span className={theme.badge.danger}>{score}</span>
  if (score < 75) return <span className={theme.badge.warning}>{score}</span>
  return <span className={theme.badge.success}>{score}</span>
}

const DIMENSION_CARDS = [
  { key: 'catalogue_score', label: 'Catalogue', link: '/dashboard/produits' },
  { key: 'logistics_score', label: 'Confirmation & logistique', link: '/dashboard/commandes' },
  { key: 'stock_score', label: 'Stock', link: '/dashboard/stock' },
  { key: 'returns_risk_score', label: 'Retours & clients à risque', link: '/dashboard/clients/risque' },
]

export default function StoreAuditPage() {
  const [audit, setAudit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    api.get('/stores/me/audit/')
      .then(({ data }) => setAudit(data))
      .catch(() => setAudit(null))
      .finally(() => setLoading(false))
  }, [])

  const runAudit = () => {
    setAnalyzing(true)
    api.post('/stores/me/audit/')
      .then(({ data }) => setAudit(data))
      .catch(() => {})
      .finally(() => setAnalyzing(false))
  }

  return (
    <DashboardLayout title="Audit de la boutique" subtitle="Score calculé à partir de vos données réelles (catalogue, logistique, stock, retours) — synthèse rédigée par IA à partir de ces chiffres, jamais inventée.">
      {loading ? <p className="text-sm text-app-muted">Chargement…</p> : !audit ? (
        <div className="rounded-xl border p-8 text-center" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          <p className="text-sm text-app-muted mb-4">Aucun audit n'a encore été réalisé pour cette boutique.</p>
          <button onClick={runAudit} disabled={analyzing} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
            {analyzing ? 'Analyse en cours…' : 'Analyser ma boutique'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border p-6 flex items-center justify-between" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <div>
              <p className="text-xs text-app-muted mb-1">Score global</p>
              <p className="text-3xl font-bold text-app-primary">{audit.global_score ?? '—'}</p>
            </div>
            <button onClick={runAudit} disabled={analyzing} className={theme.btn.primary + ' text-sm disabled:opacity-60'}>
              {analyzing ? 'Analyse en cours…' : 'Réanalyser'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {DIMENSION_CARDS.map(c => (
              <a key={c.key} href={c.link} className="rounded-xl border p-4 block hover:bg-violet-500/5 transition" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                <p className="text-xs text-app-muted mb-2">{c.label}</p>
                <ScoreBadge score={audit[c.key]} />
              </a>
            ))}
          </div>

          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <h3 className="text-sm font-semibold text-app-primary mb-2">Synthèse</h3>
            {audit.ai_unavailable ? (
              <p className="text-sm text-app-muted">Synthèse indisponible pour le moment — réessayez plus tard.</p>
            ) : (
              <p className="text-sm text-app-muted-light whitespace-pre-line">{audit.synthesis}</p>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
```

⚠️ La condition `api.get.mockRejectedValueOnce({ response: { status: 404 } })` du test attend un `.catch(() => setAudit(null))` générique — le code ci-dessus ne distingue pas 404 des autres erreurs, ce qui est correct ici (n'importe quelle erreur retombe sur l'état vide, cohérent avec le reste du projet qui traite les échecs réseau silencieusement).

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npm run test -- StoreAuditPage`
Expected: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/orders/StoreAuditPage.jsx frontend/src/tests/pages/orders/StoreAuditPage.test.jsx
git commit -m "feat(store-audit): page dashboard Audit de la boutique

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Route + sidebar

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/DashboardLayout.jsx`

**Interfaces:**
- Consumes: `StoreAuditPage` (Task 4), permission `store_audit_view` (Task 2).

- [ ] **Step 1: Vérifier le diff avant modification**

Run: `git diff frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx`
Expected: vide.

- [ ] **Step 2: Ajouter l'import et la route dans `App.jsx`**

Juste après :
```jsx
import RecommendationsPage from './pages/orders/RecommendationsPage'
```
Ajouter :
```jsx
import StoreAuditPage from './pages/orders/StoreAuditPage'
```
Juste après la route `/dashboard/recommandations`, ajouter :
```jsx
          <Route path="/dashboard/audit-boutique"              element={<PD perm="store_audit_view"><StoreAuditPage /></PD>} />
```

- [ ] **Step 3: Run le test qui vérifie que toute route a bien `perm=`**

Run: `cd frontend && npm run test -- App.test`
Expected: `PASS`.

- [ ] **Step 4: Ajouter le lien sidebar dans le bloc IA**

Dans `frontend/src/components/DashboardLayout.jsx`, remplacer :
```jsx
          {(can('ai_assistant_view') || can('stats_forecast_view') || can('stats_returns_forecast_view') || can('recommendations_view')) && (
```
par :
```jsx
          {(can('ai_assistant_view') || can('stats_forecast_view') || can('stats_returns_forecast_view') || can('recommendations_view') || can('store_audit_view')) && (
```
Et ajouter, juste après le lien "Recommandations" :
```jsx
                {can('store_audit_view') && (
                  <li>{mainLink('/dashboard/audit-boutique', ICONS.stats, 'Audit de la boutique')}</li>
                )}
```

- [ ] **Step 5: Run les tests concernés**

Run: `npm run test -- DashboardLayout App.test StoreAuditPage`
Expected: `PASS`.

- [ ] **Step 6: Commit**

```bash
git diff frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx
git add frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx
git commit -m "feat(store-audit): route + lien sidebar sous IA

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Suite complète + documentation + déploiement

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Lancer la suite backend complète**

```bash
cd backend
venv/Scripts/python manage.py test stores products orders team -v 1 --noinput
```
Expected: `OK`. Si erreur de connexion à `test_mzsolutions`, nettoyer avant de relancer :
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
Expected: tous les tests passent (aucune régression sur les ~412+ tests déjà en place).

- [ ] **Step 3: Étendre `CLAUDE.md`**

Localiser le paragraphe de clôture des recommandations produit et ajouter juste après son "Testé via..." :
```markdown
**Audit global de la boutique (2026-09, 6ème chantier IA)** — 4 scores de dimension 100% déterministes (`stores/audit.py::compute_store_audit()`, aucun appel IA dans le calcul) : Catalogue (complétude des fiches produit), Confirmation & logistique (taux de confirmation 30j + commandes en retard >24h), Stock (ruptures/stock bas), Retours & clients à risque (taux de retour 30j, clients auto-détectés jamais traités manuellement, produits vendus à perte). Score global = moyenne des dimensions disponibles (`None` ignoré, jamais pénalisé à tort une boutique neuve). Résultat sauvegardé (`stores.StoreAudit`, une ligne par boutique, écrasée à chaque recalcul) — à la demande uniquement (bouton "Analyser ma boutique"/"Réanalyser"), aucune tâche planifiée. Synthèse IA (points forts/points faibles/recommandations, texte libre) générée à partir des scores + détails chiffrés uniquement — **les scores sont toujours sauvegardés même si l'IA échoue** (`ai_unavailable: true`, jamais de perte du calcul déterministe pour une panne IA ponctuelle). Page `pages/orders/StoreAuditPage.jsx`, permission `store_audit_view`, sous le menu IA — chaque carte de dimension pointe vers la page dashboard pertinente (Produits/Commandes/Stock/Clients à risque), pas de nouveau filtre profond ajouté aux pages existantes.

Testé via `manage.py test stores products orders team` (X tests, dont Y dédiés à l'audit) + suite frontend complète (Z tests, aucune régression).
```
Remplacer X/Y/Z par les chiffres réels.

- [ ] **Step 4: Commit la doc**

```bash
git diff CLAUDE.md
git add CLAUDE.md
git commit -m "docs: documente l'audit global de la boutique (6ème chantier IA)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Pousser sur origin/main**

```bash
git push origin main
```

- [ ] **Step 6: Déployer sur le serveur de production**

```bash
SSH_KEY="C:\Users\filali\Downloads\Key server MZSolutions\mzsolutions-key.pem"
ssh -i "$SSH_KEY" ubuntu@mzsol.online "cd /home/ubuntu/mzsolutions && mkdir -p ~/backups && docker compose exec -T db pg_dump -U mzsolutions mzsolutions > ~/backups/pre_store_audit_\$(date +%Y%m%d_%H%M%S).sql"
ssh -i "$SSH_KEY" ubuntu@mzsol.online "cd /home/ubuntu/mzsolutions && git pull origin main"
ssh -i "$SSH_KEY" ubuntu@mzsol.online "cd /home/ubuntu/mzsolutions && docker compose build backend frontend && docker compose up -d --no-deps backend frontend"
```
⚠️ Ce chantier ajoute une **vraie migration de données** (`StoreAudit`, nouvelle table) — contrairement aux 2 chantiers précédents. Vérifier après le `up -d` que la migration s'est bien appliquée :
```bash
ssh -i "$SSH_KEY" ubuntu@mzsol.online "cd /home/ubuntu/mzsolutions && docker compose exec -T backend python manage.py migrate --check 2>&1 | tail -5; echo EXIT:\$?"
```
Expected: `EXIT:0`. Si `EXIT:1`, appliquer manuellement (`docker compose exec -T backend python manage.py migrate stores`) et revérifier avant de continuer — ne jamais laisser une migration en attente sur un déploiement.

- [ ] **Step 7: Vérifier la santé du site et le comportement d'ollama**

```bash
ssh -i "$SSH_KEY" ubuntu@mzsol.online "docker ps -a --format 'table {{.Names}}\t{{.Status}}' | grep -i ollama"
curl -sI https://mzsol.online/ | head -3
```
Expected : conteneur `ollama` toujours `Exited`, site `200 OK`.

- [ ] **Step 8: Vérifier en conditions réelles sur le serveur**

Même méthode que les chantiers précédents (créer un utilisateur/boutique/produits de test avec un email unique via `uuid`, appeler l'endpoint via `APIClient` avec `SERVER_NAME='mzsol.online', secure=True`, nettoyer les données de test créées) — vérifier au minimum que `POST /api/stores/me/audit/` répond `200` avec un `global_score` cohérent pour un compte owner réel.

- [ ] **Step 9: Rapport final**

Résumer à l'utilisateur : nombre de tests backend/frontend, ce qui a été déployé.
