# Recommandations produit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un moteur de recommandation produit déterministe (achats fréquents ensemble, similarité de contenu, tendance, candidats à mettre en avant, bundles), exposé côté boutique publique (fiche produit + panier) et côté dashboard vendeur (nouvelle page sous le menu IA, avec explication IA à la demande).

**Architecture:** Module pur `products/recommendations.py` (aucun appel réseau, aucun appel IA), consommé par 2 endpoints publics (`products/views.py`/`products/public_urls.py`) et 4 endpoints dashboard (`products/views.py`/`products/urls.py`). L'explication IA réutilise `ai_assistant/ollama_client.py::generate()` telle quelle, sans cache (contrairement à l'explication de risque qui est mise en cache indéfiniment).

**Tech Stack:** Django 5.2 + DRF (backend existant), React 18 (frontend existant).

## Global Constraints

- Aucun calcul de chiffre par un LLM — uniquement du calcul Python déterministe ; le LLM ne fait que rédiger une explication à partir de chiffres déjà calculés, jamais l'historique brut.
- « Commandes réelles » = `store.orders.exclude(status__in=REAL_EXCLUDED_STATUSES)` — réutiliser `orders.stats_views.REAL_EXCLUDED_STATUSES` (`['duplicate', 'fake']`) telle quelle, ne pas dupliquer la liste.
- Seuil minimum de 2 co-occurrences pour toute paire de produits « achetés ensemble ».
- Repli automatique sur la similarité de contenu (même catégorie, prix ±30%) si les achats fréquents ne suffisent pas à atteindre la limite demandée.
- Nouvelle permission `recommendations_view`, catégorie IA, masquée par défaut confirmateur/dropshipper — même convention que `stats_forecast_view`/`stats_returns_forecast_view`.
- Aucun cache sur l'explication IA (les chiffres sous-jacents changent chaque jour) — dégradation `503` explicite si le fournisseur IA est indisponible, jamais un blocage de l'affichage des recommandations elles-mêmes.
- Tests obligatoires par tâche, commits fréquents, jamais `git add -A`. Avant chaque `git add` sur un fichier partagé (`team/models.py`, `App.jsx`, `DashboardLayout.jsx`, `products/public_urls.py`, `products/urls.py`), vérifier `git diff <fichier>` pour isoler son propre diff d'un éventuel travail en cours d'un autre terminal (des changements non liés sur les transporteurs de livraison sont en cours sur des fichiers différents de `orders/carriers/`, ne devraient pas toucher ces fichiers mais à vérifier par prudence).

---

## File Structure

```
backend/
  products/
    recommendations.py     — moteur pur (nouveau)
    views.py                  — 2 vues publiques + 4 vues dashboard (modifié)
    public_urls.py             — 2 routes publiques (modifié)
    urls.py                     — 4 routes dashboard (modifié)
    tests.py                     — tests des 3 tâches backend (modifié)
  team/
    models.py                    — permission recommendations_view (modifié)

frontend/src/
  components/storefront/ProductCard.jsx  — extrait de StorefrontProductsPage.jsx (nouveau, réutilisé)
  pages/storefront/StorefrontProductsPage.jsx — utilise le ProductCard extrait (modifié, comportement inchangé)
  pages/storefront/StorefrontProductPage.jsx  — section "Vous pourriez aussi aimer" (modifié)
  pages/storefront/CartPage.jsx (ou équivalent existant) — section "Souvent achetés ensemble" (modifié — chemin exact à confirmer en Task 6)
  pages/orders/RecommendationsPage.jsx     — nouvelle page dashboard (nouveau)
  components/DashboardLayout.jsx           — lien sidebar sous IA (modifié)
  App.jsx                                    — route + import (modifié)
  tests/pages/storefront/StorefrontProductPage.test.jsx (modifié)
  tests/pages/orders/RecommendationsPage.test.jsx (nouveau)

CLAUDE.md — section Assistant IA étendue (modifié, dernière tâche)
```

---

### Task 1: `recommendations.py` — moteur déterministe pur

**Files:**
- Create: `backend/products/recommendations.py`
- Test: `backend/products/tests.py`

**Interfaces:**
- Produces:
  - `co_purchased_products(store, product_id, limit=4) -> list[Product]`
  - `similar_products(store, product, limit=4, exclude_ids=None) -> list[Product]`
  - `recommended_products_for(store, product, limit=4) -> list[Product]`
  - `cart_recommendations(store, product_ids_in_cart, limit=4) -> list[Product]`
  - `products_to_promote(store, limit=10) -> list[dict]` (`{'product': Product, 'margin_pct': float, 'total_stock': int, 'sales_rate_14d': float, 'score': float}`)
  - `trending_products(store, limit=10) -> list[dict]` (`{'product': Product, 'recent_rate': float, 'prior_rate': float, 'growth': float}`)
  - `bundle_suggestions(store, limit=10) -> list[dict]` (`{'product_a': Product, 'product_b': Product, 'count': int}`)

- [ ] **Step 1: Écrire les tests**

Vérifier d'abord en tête de `backend/products/tests.py` que `make_owner`/`auth_client` sont importés (déjà le cas, confirmé — voir imports existants du fichier). Ajouter :

```python
class RecommendationsEngineTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.cat = Category.objects.create(store=self.store, name='Chaussures')

    def _order_with_items(self, product_ids, status='delivered'):
        from orders.models import Order, OrderItem
        order = Order.objects.create(
            store=self.store, first_name='C', last_name='L', phone='0555000000',
            wilaya='Alger', commune='Alger Centre', address='Adr', status=status,
            subtotal=1000, shipping_cost=0, total=1000,
        )
        for pid in product_ids:
            OrderItem.objects.create(order=order, product_id=pid, product_name='X', price=100, quantity=1)
        return order

    def test_co_purchased_counts_pairs_across_orders(self):
        from products.recommendations import co_purchased_products
        p1 = Product.objects.create(store=self.store, name='A', price=100, stock=10, is_active=True)
        p2 = Product.objects.create(store=self.store, name='B', price=100, stock=10, is_active=True)
        p3 = Product.objects.create(store=self.store, name='C', price=100, stock=10, is_active=True)
        self._order_with_items([p1.id, p2.id])
        self._order_with_items([p1.id, p2.id])
        self._order_with_items([p1.id, p3.id])
        result = co_purchased_products(self.store, p1.id, limit=4)
        result_ids = [p.id for p in result]
        self.assertEqual(result_ids[0], p2.id)  # 2 co-occurrences > 1 pour p3

    def test_co_purchased_excludes_duplicate_and_fake_orders(self):
        from products.recommendations import co_purchased_products
        p1 = Product.objects.create(store=self.store, name='A', price=100, stock=10, is_active=True)
        p2 = Product.objects.create(store=self.store, name='B', price=100, stock=10, is_active=True)
        self._order_with_items([p1.id, p2.id], status='duplicate')
        self._order_with_items([p1.id, p2.id], status='fake')
        result = co_purchased_products(self.store, p1.id, limit=4)
        self.assertNotIn(p2.id, [p.id for p in result])

    def test_co_purchased_requires_minimum_two_occurrences(self):
        from products.recommendations import co_purchased_products
        p1 = Product.objects.create(store=self.store, name='A', price=100, stock=10, is_active=True)
        p2 = Product.objects.create(store=self.store, name='B', price=100, stock=10, is_active=True)
        self._order_with_items([p1.id, p2.id])  # une seule occurrence
        result = co_purchased_products(self.store, p1.id, limit=4)
        self.assertNotIn(p2.id, [p.id for p in result])

    def test_similar_products_same_category_and_price_range(self):
        from products.recommendations import similar_products
        ref = Product.objects.create(store=self.store, name='Ref', price=1000, stock=5, is_active=True)
        ref.categories.add(self.cat)
        close = Product.objects.create(store=self.store, name='Close', price=1100, stock=5, is_active=True)
        close.categories.add(self.cat)
        far = Product.objects.create(store=self.store, name='Far', price=5000, stock=5, is_active=True)
        far.categories.add(self.cat)
        other_cat = Product.objects.create(store=self.store, name='OtherCat', price=1000, stock=5, is_active=True)
        result = similar_products(self.store, ref, limit=4)
        result_ids = [p.id for p in result]
        self.assertIn(close.id, result_ids)
        self.assertNotIn(far.id, result_ids)
        self.assertNotIn(other_cat.id, result_ids)

    def test_recommended_products_for_falls_back_to_similar(self):
        from products.recommendations import recommended_products_for
        ref = Product.objects.create(store=self.store, name='Ref', price=1000, stock=5, is_active=True)
        ref.categories.add(self.cat)
        similar = Product.objects.create(store=self.store, name='Similar', price=1050, stock=5, is_active=True)
        similar.categories.add(self.cat)
        result = recommended_products_for(self.store, ref, limit=4)
        self.assertIn(similar.id, [p.id for p in result])

    def test_cart_recommendations_aggregates_across_cart_items(self):
        from products.recommendations import cart_recommendations
        p1 = Product.objects.create(store=self.store, name='A', price=100, stock=10, is_active=True)
        p2 = Product.objects.create(store=self.store, name='B', price=100, stock=10, is_active=True)
        p3 = Product.objects.create(store=self.store, name='C', price=100, stock=10, is_active=True)
        self._order_with_items([p1.id, p3.id])
        self._order_with_items([p1.id, p3.id])
        self._order_with_items([p2.id, p3.id])
        self._order_with_items([p2.id, p3.id])
        result = cart_recommendations(self.store, [p1.id, p2.id], limit=4)
        result_ids = [p.id for p in result]
        self.assertIn(p3.id, result_ids)
        self.assertNotIn(p1.id, result_ids)
        self.assertNotIn(p2.id, result_ids)

    def _sell(self, product, qty, days_ago):
        from django.utils import timezone
        from products.models import StockMovement
        m = StockMovement.objects.create(store=self.store, product=product, quantity=-qty, reason='order_sale')
        m.created_at = timezone.now() - timezone.timedelta(days=days_ago)
        m.save(update_fields=['created_at'])

    def test_products_to_promote_favors_high_margin_high_stock_low_velocity(self):
        from products.recommendations import products_to_promote
        good = Product.objects.create(store=self.store, name='Good', price=1000, cost_price=200, stock=50, is_active=True)
        bad = Product.objects.create(store=self.store, name='Bad', price=1000, cost_price=900, stock=2, is_active=True)
        self._sell(bad, qty=20, days_ago=1)  # forte vélocité récente, pas un candidat
        result = products_to_promote(self.store, limit=10)
        result_ids = [r['product'].id for r in result]
        self.assertIn(good.id, result_ids)
        good_idx = result_ids.index(good.id)
        self.assertNotIn(bad.id, result_ids[:good_idx]) if bad.id in result_ids else None

    def test_products_to_promote_excludes_out_of_stock_and_no_cost_price(self):
        from products.recommendations import products_to_promote
        Product.objects.create(store=self.store, name='NoCost', price=1000, stock=50, is_active=True)
        Product.objects.create(store=self.store, name='OutOfStock', price=1000, cost_price=200, stock=0, is_active=True)
        result = products_to_promote(self.store, limit=10)
        self.assertEqual(result, [])

    def test_trending_products_only_positive_growth(self):
        from products.recommendations import trending_products
        rising = Product.objects.create(store=self.store, name='Rising', price=100, stock=50, is_active=True)
        falling = Product.objects.create(store=self.store, name='Falling', price=100, stock=50, is_active=True)
        # rising : rien il y a 8-14j, ventes fortes ces 7 derniers jours
        self._sell(rising, qty=10, days_ago=2)
        # falling : ventes fortes il y a 8-14j, rien récemment
        self._sell(falling, qty=10, days_ago=10)
        result = trending_products(self.store, limit=10)
        result_ids = [r['product'].id for r in result]
        self.assertIn(rising.id, result_ids)
        self.assertNotIn(falling.id, result_ids)

    def test_bundle_suggestions_symmetric_pair_counted_once(self):
        from products.recommendations import bundle_suggestions
        p1 = Product.objects.create(store=self.store, name='A', price=100, stock=10, is_active=True)
        p2 = Product.objects.create(store=self.store, name='B', price=100, stock=10, is_active=True)
        self._order_with_items([p1.id, p2.id])
        self._order_with_items([p2.id, p1.id])  # même paire, ordre inversé dans les items
        result = bundle_suggestions(self.store, limit=10)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['count'], 2)
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test products.tests.RecommendationsEngineTest -v 2`
Expected: `ModuleNotFoundError: No module named 'products.recommendations'`

- [ ] **Step 3: Implémenter `recommendations.py`**

```python
"""Moteur de recommandation produit — calcul DÉTERMINISTE pur, aucune I/O
réseau, aucun appel IA. Voir docs/superpowers/specs/2026-09-11-recommandations-produit-design.md."""
from collections import Counter
from datetime import timedelta
from itertools import combinations

from django.db.models import Sum
from django.utils import timezone

from orders.stats_views import REAL_EXCLUDED_STATUSES
from .models import Product, StockMovement

MIN_CO_OCCURRENCES = 2
PRICE_RANGE_PCT = 0.30
PROMOTE_WINDOW_DAYS = 14
TRENDING_WINDOW_DAYS = 7


def _order_item_product_ids_by_order(store):
    """{order_id: [product_id, ...]} pour les commandes réelles avec au moins
    un OrderItem lié à un produit (jamais un article sans product_id)."""
    from orders.models import OrderItem
    rows = (OrderItem.objects
            .filter(order__store=store, product_id__isnull=False)
            .exclude(order__status__in=REAL_EXCLUDED_STATUSES)
            .values('order_id', 'product_id'))
    by_order = {}
    for r in rows:
        by_order.setdefault(r['order_id'], []).append(r['product_id'])
    return by_order


def co_purchased_products(store, product_id, limit=4):
    by_order = _order_item_product_ids_by_order(store)
    counts = Counter()
    for product_ids in by_order.values():
        if product_id not in product_ids:
            continue
        for pid in product_ids:
            if pid != product_id:
                counts[pid] += 1
    candidate_ids = [pid for pid, c in counts.most_common() if c >= MIN_CO_OCCURRENCES][:limit]
    products_by_id = {p.id: p for p in store.products.filter(id__in=candidate_ids, is_active=True)}
    return [products_by_id[pid] for pid in candidate_ids if pid in products_by_id]


def similar_products(store, product, limit=4, exclude_ids=None):
    exclude_ids = set(exclude_ids or []) | {product.id}
    low = product.price * (1 - PRICE_RANGE_PCT)
    high = product.price * (1 + PRICE_RANGE_PCT)
    category_ids = list(product.categories.values_list('id', flat=True))
    if not category_ids:
        return []
    candidates = (store.products
                  .filter(is_active=True, categories__id__in=category_ids, price__gte=low, price__lte=high)
                  .exclude(id__in=exclude_ids)
                  .distinct())
    return sorted(candidates, key=lambda p: abs(p.price - product.price))[:limit]


def recommended_products_for(store, product, limit=4):
    co_purchased = co_purchased_products(store, product.id, limit=limit)
    if len(co_purchased) >= limit:
        return co_purchased
    filler = similar_products(store, product, limit=limit - len(co_purchased),
                              exclude_ids=[p.id for p in co_purchased])
    return co_purchased + filler


def cart_recommendations(store, product_ids_in_cart, limit=4):
    by_order = _order_item_product_ids_by_order(store)
    counts = Counter()
    cart_set = set(product_ids_in_cart)
    for product_ids in by_order.values():
        matched = cart_set.intersection(product_ids)
        if not matched:
            continue
        for pid in product_ids:
            if pid not in cart_set:
                counts[pid] += 1
    candidate_ids = [pid for pid, c in counts.most_common() if c >= MIN_CO_OCCURRENCES][:limit]
    products_by_id = {p.id: p for p in store.products.filter(id__in=candidate_ids, is_active=True)}
    result = [products_by_id[pid] for pid in candidate_ids if pid in products_by_id]
    if result:
        return result
    first_product = store.products.filter(id__in=product_ids_in_cart).first()
    if not first_product:
        return []
    return similar_products(store, first_product, limit=limit, exclude_ids=product_ids_in_cart)


def _sales_rate(store, product_id, since_days, until_days=0):
    since = timezone.now() - timedelta(days=since_days)
    until = timezone.now() - timedelta(days=until_days)
    total = (StockMovement.objects
             .filter(store=store, product_id=product_id, reason='order_sale',
                     created_at__gte=since, created_at__lt=until)
             .aggregate(s=Sum('quantity'))['s'] or 0)
    window = since_days - until_days
    return abs(total) / window if window else 0.0


def products_to_promote(store, limit=10):
    results = []
    for product in store.products.filter(is_active=True, stock__gt=0).exclude(cost_price__isnull=True):
        total_stock = product.total_stock
        if total_stock <= 0 or not product.price:
            continue
        margin_pct = float(product.price - product.cost_price) / float(product.price)
        rate = _sales_rate(store, product.id, PROMOTE_WINDOW_DAYS)
        score = margin_pct * total_stock / (1 + rate)
        results.append({'product': product, 'margin_pct': round(margin_pct, 3),
                        'total_stock': total_stock, 'sales_rate_14d': round(rate, 2),
                        'score': round(score, 2)})
    results.sort(key=lambda r: r['score'], reverse=True)
    return results[:limit]


def trending_products(store, limit=10):
    results = []
    for product in store.products.filter(is_active=True):
        recent = _sales_rate(store, product.id, TRENDING_WINDOW_DAYS)
        prior = _sales_rate(store, product.id, TRENDING_WINDOW_DAYS * 2, TRENDING_WINDOW_DAYS)
        growth = recent - prior
        if growth > 0:
            results.append({'product': product, 'recent_rate': round(recent, 2),
                            'prior_rate': round(prior, 2), 'growth': round(growth, 2)})
    results.sort(key=lambda r: r['growth'], reverse=True)
    return results[:limit]


def bundle_suggestions(store, limit=10):
    by_order = _order_item_product_ids_by_order(store)
    counts = Counter()
    for product_ids in by_order.values():
        unique_ids = sorted(set(product_ids))
        for a, b in combinations(unique_ids, 2):
            counts[(a, b)] += 1
    pairs = [(pair, c) for pair, c in counts.most_common() if c >= MIN_CO_OCCURRENCES][:limit]
    all_ids = {pid for pair, _ in pairs for pid in pair}
    products_by_id = {p.id: p for p in store.products.filter(id__in=all_ids, is_active=True)}
    results = []
    for (a, b), count in pairs:
        if a in products_by_id and b in products_by_id:
            results.append({'product_a': products_by_id[a], 'product_b': products_by_id[b], 'count': count})
    return results
```

⚠️ `Product.total_stock` (property déjà existante, `products/models.py`) — utiliser cette property et non `product.stock` directement (piège déjà rencontré sur `stock_forecast.py` : `stock` reste à 0 pour un produit à variantes).

- [ ] **Step 4: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test products.tests.RecommendationsEngineTest -v 2`
Expected: `Ran 10 tests ... OK`

- [ ] **Step 5: Commit**

```bash
git diff backend/products/tests.py | head -5
git add backend/products/recommendations.py backend/products/tests.py
git commit -m "feat(recommendations): moteur déterministe de recommandation produit

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Permission `recommendations_view`

**Files:**
- Modify: `backend/team/models.py`

**Interfaces:**
- Produces: clé `recommendations_view` dans `PERMISSION_CATALOG`, `PERMISSION_CATEGORIES`, `DEFAULT_PERMISSIONS['confirmateur']`, `DEFAULT_PERMISSIONS['dropshipper']` (toutes `False`).

- [ ] **Step 1: Vérifier le diff avant modification**

Run: `git diff backend/team/models.py`
Expected: vide (aucun changement en cours d'un autre terminal sur ce fichier).

- [ ] **Step 2: Ajouter au `PERMISSION_CATALOG`**

Juste après :
```python
    ('stats_returns_forecast_view', 'Prévision de taux de retour'),
```
Ajouter :
```python
    ('recommendations_view',        'Recommandations produit'),
```

- [ ] **Step 3: Ajouter à `PERMISSION_CATEGORIES`**

Juste après :
```python
    'stats_returns_forecast_view':  ('Ventes & finances', 'Statistiques'),
```
Ajouter :
```python
    'recommendations_view':         ('Ventes & finances', 'Statistiques'),
```

- [ ] **Step 4: Ajouter aux deux `DEFAULT_PERMISSIONS`**

Dans les deux occurrences de :
```python
        'stats_confirmateurs_view': False, 'stats_wilayas_view': False, 'stats_sources_view': False, 'stats_forecast_view': False,
        'stats_returns_forecast_view': False,
```
Remplacer par :
```python
        'stats_confirmateurs_view': False, 'stats_wilayas_view': False, 'stats_sources_view': False, 'stats_forecast_view': False,
        'stats_returns_forecast_view': False, 'recommendations_view': False,
```

- [ ] **Step 5: Vérifier l'absence de régression**

Run: `cd backend && venv/Scripts/python manage.py test team -v 1`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git diff backend/team/models.py
git add backend/team/models.py
git commit -m "feat(recommendations): permission recommendations_view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Endpoints dashboard (promote/trending/bundles + explication IA)

**Files:**
- Modify: `backend/products/views.py`
- Modify: `backend/products/urls.py`
- Test: `backend/products/tests.py`

**Interfaces:**
- Consumes: `products.recommendations.products_to_promote/trending_products/bundle_suggestions` (Task 1), `recommendations_view` (Task 2), `ai_assistant.ollama_client.generate()`/`OllamaUnavailableError`.
- Produces: `GET /api/products/recommendations/promote/`, `GET /api/products/recommendations/trending/`, `GET /api/products/recommendations/bundles/`, `POST /api/products/recommendations/<int:pk>/explain/?type=promote|trending`, `POST /api/products/recommendations/bundle-explain/`.

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/products/tests.py` :
```python
class RecommendationsViewsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.client_ = auth_client(self.owner)

    def test_promote_requires_permission(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.get('/api/products/recommendations/promote/')
        self.assertEqual(resp.status_code, 403)

    def test_promote_returns_serialized_results(self):
        Product.objects.create(store=self.store, name='Good', price=1000, cost_price=200, stock=50, is_active=True)
        resp = self.client_.get('/api/products/recommendations/promote/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 1)
        self.assertIn('score', resp.data['results'][0])

    def test_trending_returns_empty_without_sales(self):
        resp = self.client_.get('/api/products/recommendations/trending/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['results'], [])

    def test_bundles_returns_empty_without_history(self):
        resp = self.client_.get('/api/products/recommendations/bundles/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['results'], [])

    def test_explain_promote_calls_ai_and_returns_text(self):
        from unittest.mock import patch
        p = Product.objects.create(store=self.store, name='Good', price=1000, cost_price=200, stock=50, is_active=True)
        with patch('products.views.ollama_client.generate', return_value='Bonne marge, stock élevé.'):
            resp = self.client_.post(f'/api/products/recommendations/{p.id}/explain/?type=promote')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['explanation'], 'Bonne marge, stock élevé.')

    def test_explain_returns_503_on_ai_failure(self):
        from unittest.mock import patch
        from ai_assistant.ollama_client import OllamaUnavailableError
        p = Product.objects.create(store=self.store, name='Good', price=1000, cost_price=200, stock=50, is_active=True)
        with patch('products.views.ollama_client.generate', side_effect=OllamaUnavailableError('down')):
            resp = self.client_.post(f'/api/products/recommendations/{p.id}/explain/?type=promote')
        self.assertEqual(resp.status_code, 503)

    def test_bundle_explain_calls_ai(self):
        from unittest.mock import patch
        pa = Product.objects.create(store=self.store, name='A', price=100, stock=10, is_active=True)
        pb = Product.objects.create(store=self.store, name='B', price=100, stock=10, is_active=True)
        with patch('products.views.ollama_client.generate', return_value='Souvent achetés ensemble.'):
            resp = self.client_.post('/api/products/recommendations/bundle-explain/',
                                      {'product_id_a': pa.id, 'product_id_b': pb.id}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['explanation'], 'Souvent achetés ensemble.')
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `venv/Scripts/python manage.py test products.tests.RecommendationsViewsTest -v 2`
Expected: `404` sur chaque test (routes inexistantes).

- [ ] **Step 3: Ajouter l'import `ollama_client` en tête de `products/views.py`**

Vérifier d'abord qu'aucun import similaire n'existe déjà (`grep ollama_client backend/products/views.py`). Ajouter avec les autres imports de tête de fichier :
```python
from ai_assistant import ollama_client
from ai_assistant.ollama_client import OllamaUnavailableError
```

- [ ] **Step 4: Ajouter les 5 vues**

À la fin de `backend/products/views.py` :
```python
class RecommendationsPromoteView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'recommendations_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        from .recommendations import products_to_promote
        results = products_to_promote(store)
        return Response({'results': [{
            'product_id': r['product'].id, 'product_name': r['product'].name,
            'margin_pct': r['margin_pct'], 'total_stock': r['total_stock'],
            'sales_rate_14d': r['sales_rate_14d'], 'score': r['score'],
        } for r in results]})


class RecommendationsTrendingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'recommendations_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        from .recommendations import trending_products
        results = trending_products(store)
        return Response({'results': [{
            'product_id': r['product'].id, 'product_name': r['product'].name,
            'recent_rate': r['recent_rate'], 'prior_rate': r['prior_rate'], 'growth': r['growth'],
        } for r in results]})


class RecommendationsBundlesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'recommendations_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        from .recommendations import bundle_suggestions
        results = bundle_suggestions(store)
        return Response({'results': [{
            'product_id_a': r['product_a'].id, 'product_name_a': r['product_a'].name,
            'product_id_b': r['product_b'].id, 'product_name_b': r['product_b'].name,
            'count': r['count'],
        } for r in results]})


class RecommendationExplainView(APIView):
    """Explication IA à la demande pour un produit « à mettre en avant » ou
    « en tendance » — JAMAIS de cache (contrairement à Order.risk_explanation),
    ces chiffres changent chaque jour. Le prompt ne reçoit que les chiffres
    déjà calculés par recommendations.py, jamais l'historique brut."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not (is_owner_or_admin(request) or has_permission(request, 'recommendations_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            product = store.products.get(pk=pk)
        except Product.DoesNotExist:
            return Response({'detail': 'Produit introuvable.'}, status=404)

        kind = request.query_params.get('type')
        from .recommendations import products_to_promote, trending_products
        if kind == 'promote':
            match = next((r for r in products_to_promote(store) if r['product'].id == product.id), None)
            if not match:
                return Response({'detail': 'Ce produit n\'est plus un candidat à mettre en avant.'}, status=400)
            prompt = (
                f"Le produit « {product.name} » de la boutique {store.name} a une marge de "
                f"{match['margin_pct'] * 100:.0f}%, un stock disponible de {match['total_stock']} unités, "
                f"et un rythme de vente de {match['sales_rate_14d']:.1f} unités/jour sur les 14 derniers jours.\n"
                "Explique en 2-3 phrases, en français, pourquoi ce produit est un bon candidat à mettre en "
                "avant (promo, mise en avant accueil) — base-toi UNIQUEMENT sur ces chiffres, n'invente rien d'autre."
            )
        elif kind == 'trending':
            match = next((r for r in trending_products(store) if r['product'].id == product.id), None)
            if not match:
                return Response({'detail': 'Ce produit n\'est plus en tendance.'}, status=400)
            prompt = (
                f"Le produit « {product.name} » de la boutique {store.name} se vendait à "
                f"{match['prior_rate']:.1f} unités/jour, contre {match['recent_rate']:.1f} unités/jour "
                f"maintenant (croissance de {match['growth']:.1f} unité/jour).\n"
                "Explique en 2-3 phrases, en français, pourquoi ce produit est en tendance et qu'il faut "
                "surveiller son stock — base-toi UNIQUEMENT sur ces chiffres, n'invente rien d'autre."
            )
        else:
            return Response({'detail': "Paramètre 'type' invalide (attendu : promote ou trending)."}, status=400)

        try:
            explanation = ollama_client.generate(prompt)
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)
        return Response({'explanation': explanation.strip()})


class RecommendationBundleExplainView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'recommendations_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            product_a = store.products.get(pk=request.data.get('product_id_a'))
            product_b = store.products.get(pk=request.data.get('product_id_b'))
        except (Product.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'Produit introuvable.'}, status=404)

        from .recommendations import bundle_suggestions
        match = next((r for r in bundle_suggestions(store)
                      if {r['product_a'].id, r['product_b'].id} == {product_a.id, product_b.id}), None)
        if not match:
            return Response({'detail': "Cette paire n'est plus une suggestion de bundle."}, status=400)
        prompt = (
            f"Les produits « {product_a.name} » et « {product_b.name} » de la boutique {store.name} ont été "
            f"achetés ensemble dans {match['count']} commandes.\n"
            "Explique en 2-3 phrases, en français, pourquoi proposer ces deux produits en offre groupée "
            "(bundle) — base-toi UNIQUEMENT sur ce chiffre, n'invente rien d'autre."
        )
        try:
            explanation = ollama_client.generate(prompt)
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)
        return Response({'explanation': explanation.strip()})
```

- [ ] **Step 5: Enregistrer les routes**

Dans `backend/products/urls.py`, étendre l'import existant :
```python
from .views import (
    CategoryListCreateView, CategoryDetailView, CategoryRestoreView,
    ProductListCreateView, ProductDetailView, ProductImageView, ProductImageReorderView,
    ProductVariantView, ProductVariantDetailView,
    VariantOptionView, VariantOptionDetailView,
    VariantSubOptionView, VariantSubOptionDetailView,
    LowStockView, InventoryListView, StockAdjustmentView, StockMovementListView,
    SupplierListCreateView, SupplierDetailView,
    SupplierCreditView, SupplierCreditDetailView,
    SupplierPaymentView, SupplierPaymentDetailView,
    SupplierBalanceView,
    AllCreditsView, AllPaymentsView,
    ProductReviewListView, ProductReviewDetailView, PublicReviewView,
    PromotionListCreateView, PromotionDetailView, PromotionValidateView,
    RecommendationsPromoteView, RecommendationsTrendingView, RecommendationsBundlesView,
    RecommendationExplainView, RecommendationBundleExplainView,
)
```
Ajouter à `urlpatterns`, juste avant la fermeture de la liste :
```python
    # Recommandations produit
    path('recommendations/promote/',                      RecommendationsPromoteView.as_view()),
    path('recommendations/trending/',                      RecommendationsTrendingView.as_view()),
    path('recommendations/bundles/',                        RecommendationsBundlesView.as_view()),
    path('recommendations/<int:pk>/explain/',               RecommendationExplainView.as_view()),
    path('recommendations/bundle-explain/',                  RecommendationBundleExplainView.as_view()),
```

- [ ] **Step 6: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test products.tests.RecommendationsViewsTest -v 2`
Expected: `Ran 7 tests ... OK`

- [ ] **Step 7: Commit**

```bash
git diff backend/products/urls.py backend/products/views.py
git add backend/products/views.py backend/products/urls.py backend/products/tests.py
git commit -m "feat(recommendations): endpoints dashboard promote/trending/bundles + explication IA

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Endpoints publics (fiche produit + panier)

**Files:**
- Modify: `backend/products/views.py`
- Modify: `backend/products/public_urls.py`
- Test: `backend/products/tests.py`

**Interfaces:**
- Consumes: `products.recommendations.recommended_products_for/cart_recommendations` (Task 1).
- Produces: `GET /api/public/store/<slug>/products/<int:pk>/recommendations/`, `POST /api/public/store/<slug>/cart-recommendations/`.

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/products/tests.py` :
```python
class PublicRecommendationsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.cat = Category.objects.create(store=self.store, name='Chaussures')

    def test_product_recommendations_returns_similar_products(self):
        ref = Product.objects.create(store=self.store, name='Ref', price=1000, stock=5, is_active=True)
        ref.categories.add(self.cat)
        similar = Product.objects.create(store=self.store, name='Similar', price=1050, stock=5, is_active=True)
        similar.categories.add(self.cat)
        resp = self.client.get(f'/api/public/store/{self.store.slug}/products/{ref.id}/recommendations/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn(similar.id, [r['id'] for r in resp.data['results']])

    def test_product_recommendations_404_unknown_product(self):
        resp = self.client.get(f'/api/public/store/{self.store.slug}/products/999999/recommendations/')
        self.assertEqual(resp.status_code, 404)

    def test_cart_recommendations_returns_similar_fallback(self):
        ref = Product.objects.create(store=self.store, name='Ref', price=1000, stock=5, is_active=True)
        ref.categories.add(self.cat)
        similar = Product.objects.create(store=self.store, name='Similar', price=1050, stock=5, is_active=True)
        similar.categories.add(self.cat)
        resp = self.client.post(f'/api/public/store/{self.store.slug}/cart-recommendations/',
                                 {'product_ids': [ref.id]}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn(similar.id, [r['id'] for r in resp.data['results']])

    def test_cart_recommendations_empty_list_returns_empty(self):
        resp = self.client.post(f'/api/public/store/{self.store.slug}/cart-recommendations/',
                                 {'product_ids': []}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['results'], [])
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `venv/Scripts/python manage.py test products.tests.PublicRecommendationsTest -v 2`
Expected: `404` sur chaque test.

- [ ] **Step 3: Ajouter une fonction de sérialisation partagée**

Dans `backend/products/views.py`, juste avant `class PublicProductListView`, ajouter une petite fonction réutilisée par les 2 nouvelles vues et par `PublicProductListView` (extraction du bloc déjà dupliqué serait plus large que ce chantier — on ajoute une fonction dédiée aux recommandations plutôt que refactorer `PublicProductListView` maintenant, YAGNI) :
```python
def _serialize_public_product_card(request, p):
    first_image = p.images.order_by('order').first()
    image_url = request.build_absolute_uri(first_image.image.url) if first_image and first_image.image else None
    promo = p.active_auto_promotion()
    display_price = p.price
    original_price = None
    if promo:
        display_price = p.price - promo.compute_discount(p.price)
        original_price = p.price
    return {
        'id': p.id, 'slug': p.slug, 'name': p.name,
        'price': str(display_price),
        'original_price': str(original_price) if original_price is not None else None,
        'image_url': image_url,
    }
```

- [ ] **Step 4: Ajouter les 2 vues publiques**

Juste après `class PublicProductListView` (avant `class PublicCatalogFeedView`) :
```python
class PublicProductRecommendationsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug, pk):
        store = _get_public_store(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        try:
            product = store.products.filter(is_active=True).get(pk=pk)
        except Product.DoesNotExist:
            return Response({'detail': 'Produit introuvable.'}, status=404)
        from .recommendations import recommended_products_for
        results = recommended_products_for(store, product)
        return Response({'results': [_serialize_public_product_card(request, p) for p in results]})


class PublicCartRecommendationsView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, slug):
        store = _get_public_store(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        product_ids = request.data.get('product_ids') or []
        if not product_ids:
            return Response({'results': []})
        from .recommendations import cart_recommendations
        results = cart_recommendations(store, product_ids)
        return Response({'results': [_serialize_public_product_card(request, p) for p in results]})
```

- [ ] **Step 5: Enregistrer les routes**

Dans `backend/products/public_urls.py` :
```python
from .views import (PublicStoreView, PublicCategoryListView, PublicProductListView,
                    PublicProductDetailView, PublicStorePageListView, PublicStorePageView,
                    PublicPromoValidateView, PublicCatalogFeedView, PublicSitemapView,
                    PublicProductRecommendationsView, PublicCartRecommendationsView)
```
Ajouter à `urlpatterns`, après la ligne `products/<str:pk>/` :
```python
    path('products/<int:pk>/recommendations/', PublicProductRecommendationsView.as_view()),
    path('cart-recommendations/',               PublicCartRecommendationsView.as_view()),
```

⚠️ Vérifier que cette nouvelle route `products/<int:pk>/recommendations/` est bien déclarée **avant** `products/<str:pk>/` dans `urlpatterns` si Django matche dans l'ordre (à vérifier à l'implémentation — sinon `<str:pk>/` intercepterait `recommendations` comme une valeur de `pk`). Si un conflit est détecté au test, réordonner les deux lignes.

- [ ] **Step 6: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test products.tests.PublicRecommendationsTest -v 2`
Expected: `Ran 4 tests ... OK`

- [ ] **Step 7: Run toute la suite `products` pour vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test products -v 1 --noinput`
Expected: `OK`.

- [ ] **Step 8: Commit**

```bash
git diff backend/products/public_urls.py backend/products/views.py
git add backend/products/views.py backend/products/public_urls.py backend/products/tests.py
git commit -m "feat(recommendations): endpoints publics fiche produit + panier

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — extraction `ProductCard` réutilisable

**Files:**
- Create: `frontend/src/components/storefront/ProductCard.jsx`
- Modify: `frontend/src/pages/storefront/StorefrontProductsPage.jsx`
- Test: `frontend/src/tests/pages/storefront/StorefrontProductsPage.test.jsx` (vérifier qu'il passe sans modification)

**Interfaces:**
- Produces: `export default function ProductCard({ product, slug })` — identique au composant local actuel de `StorefrontProductsPage.jsx`, extrait tel quel.

- [ ] **Step 1: Lire le test existant pour confirmer l'absence de régression attendue**

Run: `cd frontend && cat src/tests/pages/storefront/StorefrontProductsPage.test.jsx 2>&1 | head -30` (ou `Get-Content` sous PowerShell) — vérifier qu'aucun test ne cible `ProductCard` par son nom interne (peu probable, les tests ciblent le texte affiché).

- [ ] **Step 2: Créer le composant extrait**

```jsx
// frontend/src/components/storefront/ProductCard.jsx
import { Link } from 'react-router-dom'

function PackageIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  )
}

function TruckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 17h4V5H2v12h3" />
      <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1" />
      <circle cx="7.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  )
}

export default function ProductCard({ product, slug }) {
  return (
    <Link to={`/store/${slug}/products/${product.slug || product.id}`}
      className="group rounded-2xl overflow-hidden border transition-all duration-300 hover:-translate-y-0.5 block"
      style={{ background: 'var(--sf-card-bg)', borderColor: 'color-mix(in srgb, var(--sf-primary) 15%, transparent)' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--sf-primary) 40%, transparent)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--sf-primary) 15%, transparent)' }}>
      {product.show_images !== false && (
        <div className="aspect-square overflow-hidden" style={{ background: 'var(--sf-primary-light)' }}>
          {product.image_url
            ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            : <div className="w-full h-full flex items-center justify-center opacity-30"><PackageIcon className="w-10 h-10" /></div>
          }
        </div>
      )}
      <div className="p-3">
        {product.show_title !== false && (
          <p className="text-sm font-medium truncate" style={{ color: 'var(--sf-text)' }}>{product.name}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="font-semibold" style={{ color: 'var(--sf-primary)' }}>{Number(product.price).toLocaleString('fr-DZ')} DZD</span>
          {product.original_price ? (
            <span className="text-xs line-through" style={{ color: 'var(--sf-text-muted)' }}>{Number(product.original_price).toLocaleString('fr-DZ')}</span>
          ) : product.compare_price && (
            <span className="text-xs line-through" style={{ color: 'var(--sf-text-muted)' }}>{Number(product.compare_price).toLocaleString('fr-DZ')}</span>
          )}
        </div>
        {product.free_shipping && (
          <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ring-emerald-400/40" style={{ background: 'rgba(16,185,129,0.14)', color: '#6ee7b7' }}>
            <TruckIcon className="w-3 h-3" /> Livraison gratuite
          </span>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 3: Remplacer le composant local de `StorefrontProductsPage.jsx` par l'import**

Dans `frontend/src/pages/storefront/StorefrontProductsPage.jsx`, supprimer la définition locale de `function ProductCard({ product, slug }) { ... }` (lignes 55-90 constatées à la lecture) et les fonctions `PackageIcon`/`TruckIcon` **si elles ne sont utilisées nulle part ailleurs dans ce fichier** (vérifier par recherche avant suppression — sinon les garder). Ajouter en haut du fichier :
```jsx
import ProductCard from '../../components/storefront/ProductCard'
```

- [ ] **Step 4: Run le test existant pour vérifier l'absence de régression**

Run: `npm run test -- StorefrontProductsPage`
Expected: `PASS` (comportement visuel identique, juste déplacé).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/storefront/ProductCard.jsx frontend/src/pages/storefront/StorefrontProductsPage.jsx
git commit -m "refactor(storefront): extrait ProductCard en composant réutilisable

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — section « Vous pourriez aussi aimer » + « Souvent achetés ensemble »

**Files:**
- Modify: `frontend/src/pages/storefront/StorefrontProductPage.jsx`
- Modify: le composant panier existant (à localiser en Step 1 — probablement `frontend/src/pages/storefront/CartPage.jsx` ou une modale panier montée depuis `StorefrontLayout.jsx`, à confirmer par recherche avant de coder)
- Test: `frontend/src/tests/pages/storefront/StorefrontProductPage.test.jsx` (modifié)

**Interfaces:**
- Consumes: `GET /store/:slug/products/:id/recommendations/` (Task 4), `POST /store/:slug/cart-recommendations/` (Task 4), `ProductCard` (Task 5), `useCart()` (`CartContext.jsx`, déjà existant).

- [ ] **Step 1: Localiser le composant panier réel du projet**

Run: `grep -rl "getItems\|getSubtotal" frontend/src/pages/storefront/ frontend/src/components/` — confirmer le fichier exact qui affiche le contenu du panier (liste des articles + total) avant d'y ajouter la section recommandations. Adapter le chemin ci-dessous à ce qui est trouvé.

- [ ] **Step 2: Écrire les tests**

Lire d'abord `frontend/src/tests/pages/storefront/StorefrontProductPage.test.jsx` en entier pour reprendre exactement son style de mock (`publicApi`, `useCart`, etc.). Ajouter un test dans ce fichier :
```jsx
it('affiche la section "Vous pourriez aussi aimer" avec les produits recommandés', async () => {
  publicApi.get.mockImplementation((url) => {
    if (url.includes('/recommendations/')) {
      return Promise.resolve({ data: { results: [
        { id: 99, slug: 'reco', name: 'Produit recommandé', price: '500', image_url: null },
      ] } })
    }
    // ... conserver le mock existant pour l'appel de détail produit déjà testé plus haut dans ce fichier
    return Promise.resolve({ data: {} })
  })
  render(<MemoryRouter><StorefrontProductPage /></MemoryRouter>)
  expect(await screen.findByText('Produit recommandé')).toBeInTheDocument()
})
```

⚠️ Adapter ce test au mock réel déjà en place dans le fichier (probablement un seul gros `publicApi.get.mockImplementation` avec plusieurs branches `if (url.includes(...))` déjà présentes pour le détail produit/avis) — ne pas écraser les branches existantes, ajouter une branche `recommendations` en plus.

- [ ] **Step 3: Run pour vérifier l'échec**

Run: `npm run test -- StorefrontProductPage`
Expected: le nouveau test échoue (texte absent).

- [ ] **Step 4: Ajouter la section sur `StorefrontProductPage.jsx`**

Ajouter l'import :
```jsx
import ProductCard from '../../components/storefront/ProductCard'
```
Ajouter un state et un effet, à côté des autres `useState`/`useEffect` du composant (après le chargement du produit principal) :
```jsx
const [recommendations, setRecommendations] = useState([])

useEffect(() => {
  if (!product?.id) return
  publicApi.get(`/store/${slug}/products/${product.id}/recommendations/`)
    .then(({ data }) => setRecommendations(data.results || []))
    .catch(() => {})
}, [slug, product?.id])
```
Ajouter la section JSX, juste avant la fermeture de `</StorefrontLayout>` (après le bloc avis clients existant, à localiser précisément à l'implémentation) :
```jsx
{recommendations.length > 0 && (
  <div className="max-w-6xl mx-auto px-4 py-10">
    <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--sf-text)' }}>Vous pourriez aussi aimer</h2>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {recommendations.map(p => <ProductCard key={p.id} product={p} slug={slug} />)}
    </div>
  </div>
)}
```

- [ ] **Step 5: Ajouter la section « Souvent achetés ensemble » sur le composant panier localisé en Step 1**

Ajouter l'import `ProductCard` et `useCart` s'ils n'y sont pas déjà. Ajouter :
```jsx
const [cartRecommendations, setCartRecommendations] = useState([])

useEffect(() => {
  const items = getItems(slug)
  if (items.length === 0) { setCartRecommendations([]); return }
  publicApi.post(`/store/${slug}/cart-recommendations/`, { product_ids: items.map(i => i.product) })
    .then(({ data }) => setCartRecommendations(data.results || []))
    .catch(() => {})
}, [slug, getItems(slug).length])
```
Ajouter la section JSX équivalente à celle de la fiche produit (titre "Souvent achetés ensemble" au lieu de "Vous pourriez aussi aimer").

⚠️ `getItems(slug).length` comme dépendance d'effet est fragile (nouvelle référence de tableau à chaque rendu, `.length` seul suffit à détecter un ajout/retrait) — si un test échoue en boucle infinie de re-render, remplacer par un state dérivé explicite (`useMemo`) plutôt que de dépendre directement de l'appel de fonction dans le tableau de dépendances.

- [ ] **Step 6: Run pour vérifier le succès**

Run: `npm run test -- StorefrontProductPage`
Expected: `PASS`.

- [ ] **Step 7: Run la suite frontend complète pour vérifier l'absence de régression**

Run: `npm run test`
Expected: tous les tests passent (référence avant ce chantier : 406 tests).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/storefront/StorefrontProductPage.jsx frontend/src/tests/pages/storefront/StorefrontProductPage.test.jsx
git commit -m "feat(recommendations): section recommandations sur fiche produit + panier

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(Le fichier panier localisé en Step 1 sera ajouté à ce commit également — vérifier `git status` avant de composer la commande finale d'ajout.)

---

### Task 7: Frontend — page dashboard `RecommendationsPage.jsx`

**Files:**
- Create: `frontend/src/pages/orders/RecommendationsPage.jsx`
- Test: `frontend/src/tests/pages/orders/RecommendationsPage.test.jsx`

**Interfaces:**
- Consumes: `GET /products/recommendations/promote|trending|bundles/` (Task 3), `POST /products/recommendations/<id>/explain/`, `POST /products/recommendations/bundle-explain/` (Task 3).

- [ ] **Step 1: Écrire les tests**

```jsx
// frontend/src/tests/pages/orders/RecommendationsPage.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import RecommendationsPage from '../../../pages/orders/RecommendationsPage'

vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
import api from '../../../api/axios'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

describe('RecommendationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockImplementation((url) => {
      if (url.includes('/promote/'))  return Promise.resolve({ data: { results: [
        { product_id: 1, product_name: 'Produit A', margin_pct: 0.6, total_stock: 40, sales_rate_14d: 0.2, score: 100 },
      ] } })
      if (url.includes('/trending/')) return Promise.resolve({ data: { results: [
        { product_id: 2, product_name: 'Produit B', recent_rate: 5, prior_rate: 1, growth: 4 },
      ] } })
      if (url.includes('/bundles/'))  return Promise.resolve({ data: { results: [
        { product_id_a: 1, product_name_a: 'Produit A', product_id_b: 2, product_name_b: 'Produit B', count: 3 },
      ] } })
      return Promise.resolve({ data: { count: 0 } })
    })
  })

  it('affiche les 3 sections avec leurs données', async () => {
    render(<MemoryRouter><RecommendationsPage /></MemoryRouter>)
    expect(await screen.findByText('Produit A')).toBeInTheDocument()
    expect(await screen.findByText('Produit B')).toBeInTheDocument()
  })

  it('affiche l\'explication IA au clic sur "Pourquoi ce produit ?"', async () => {
    api.post.mockResolvedValueOnce({ data: { explanation: 'Bonne marge, stock élevé.' } })
    render(<MemoryRouter><RecommendationsPage /></MemoryRouter>)
    await screen.findByText('Produit A')
    const buttons = await screen.findAllByText('Pourquoi ce produit ?')
    fireEvent.click(buttons[0])
    await waitFor(() => expect(screen.getByText('Bonne marge, stock élevé.')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `npm run test -- RecommendationsPage`
Expected: échec (module inexistant).

- [ ] **Step 3: Créer `RecommendationsPage.jsx`**

```jsx
import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { theme } from '../../theme'

function ExplainButton({ onExplain }) {
  const [explanation, setExplanation] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleClick = () => {
    setLoading(true)
    onExplain()
      .then(text => setExplanation(text))
      .catch(() => setExplanation('Explication indisponible pour le moment.'))
      .finally(() => setLoading(false))
  }

  if (explanation) return <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>{explanation}</p>
  return (
    <button onClick={handleClick} disabled={loading} className="text-xs text-violet-400 hover:underline">
      {loading ? '…' : 'Pourquoi ce produit ?'}
    </button>
  )
}

export default function RecommendationsPage() {
  const [promote, setPromote] = useState([])
  const [trending, setTrending] = useState([])
  const [bundles, setBundles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/products/recommendations/promote/'),
      api.get('/products/recommendations/trending/'),
      api.get('/products/recommendations/bundles/'),
    ]).then(([p, t, b]) => {
      setPromote(p.data.results || [])
      setTrending(t.data.results || [])
      setBundles(b.data.results || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const explainProduct = (productId, type) =>
    api.post(`/products/recommendations/${productId}/explain/?type=${type}`).then(({ data }) => data.explanation)

  const explainBundle = (idA, idB) =>
    api.post('/products/recommendations/bundle-explain/', { product_id_a: idA, product_id_b: idB }).then(({ data }) => data.explanation)

  return (
    <DashboardLayout title="Recommandations" subtitle="Suggestions calculées à partir de vos ventes réelles — à mettre en avant, en tendance, ou à proposer en bundle.">
      {loading ? <p className="text-sm text-app-muted">Chargement…</p> : (
        <div className="space-y-8">
          <section>
            <h2 className="text-base font-semibold text-app-primary mb-3">Produits à mettre en avant</h2>
            {promote.length === 0 ? <p className="text-sm text-app-muted">Aucun candidat pour le moment.</p> : (
              <div className="space-y-2">
                {promote.map(r => (
                  <div key={r.product_id} className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                    <p className="text-sm font-medium text-app-primary">{r.product_name}</p>
                    <p className="text-xs text-app-muted-light">Marge {Math.round(r.margin_pct * 100)}% · Stock {r.total_stock} · {r.sales_rate_14d}/jour</p>
                    <ExplainButton onExplain={() => explainProduct(r.product_id, 'promote')} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-base font-semibold text-app-primary mb-3">Produits en tendance</h2>
            {trending.length === 0 ? <p className="text-sm text-app-muted">Aucun produit en tendance pour le moment.</p> : (
              <div className="space-y-2">
                {trending.map(r => (
                  <div key={r.product_id} className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                    <p className="text-sm font-medium text-app-primary">{r.product_name}</p>
                    <p className="text-xs text-app-muted-light">{r.prior_rate}/jour → {r.recent_rate}/jour (+{r.growth})</p>
                    <ExplainButton onExplain={() => explainProduct(r.product_id, 'trending')} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-base font-semibold text-app-primary mb-3">Associations de vente croisée</h2>
            {bundles.length === 0 ? <p className="text-sm text-app-muted">Aucune association détectée pour le moment.</p> : (
              <div className="space-y-2">
                {bundles.map(r => (
                  <div key={`${r.product_id_a}-${r.product_id_b}`} className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                    <p className="text-sm font-medium text-app-primary">{r.product_name_a} + {r.product_name_b}</p>
                    <p className="text-xs text-app-muted-light">Achetés ensemble {r.count} fois</p>
                    <ExplainButton onExplain={() => explainBundle(r.product_id_a, r.product_id_b)} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </DashboardLayout>
  )
}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npm run test -- RecommendationsPage`
Expected: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/orders/RecommendationsPage.jsx frontend/src/tests/pages/orders/RecommendationsPage.test.jsx
git commit -m "feat(recommendations): page dashboard Recommandations (à mettre en avant / tendance / bundles)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Route + sidebar

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/DashboardLayout.jsx`

**Interfaces:**
- Consumes: `RecommendationsPage` (Task 7), permission `recommendations_view` (Task 2).

- [ ] **Step 1: Vérifier le diff avant modification**

Run: `git diff frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx`
Expected: vide ou limité aux changements attendus (aucun travail en cours d'un autre terminal sur ces fichiers à ce stade — à confirmer, sinon isoler le diff par patch ciblé comme fait dans les chantiers précédents).

- [ ] **Step 2: Ajouter l'import et la route dans `App.jsx`**

Juste après :
```jsx
import ReturnsForecastPage from './pages/orders/stats/ReturnsForecastPage'
```
Ajouter :
```jsx
import RecommendationsPage from './pages/orders/RecommendationsPage'
```
Juste après la route `/dashboard/stats/previsions-retours`, ajouter :
```jsx
          <Route path="/dashboard/recommandations"            element={<PD perm="recommendations_view"><RecommendationsPage /></PD>} />
```

- [ ] **Step 3: Run le test qui vérifie que toute route a bien `perm=`**

Run: `cd frontend && npm run test -- App.test`
Expected: `PASS`.

- [ ] **Step 4: Ajouter le lien sidebar dans le bloc IA**

Dans `frontend/src/components/DashboardLayout.jsx`, localiser le bloc IA (recherché via `IA</p>` ou le commentaire `menu IA`). Étendre sa condition d'affichage et son contenu — remplacer :
```jsx
          {(can('ai_assistant_view') || can('stats_forecast_view') || can('stats_returns_forecast_view')) && (
```
par :
```jsx
          {(can('ai_assistant_view') || can('stats_forecast_view') || can('stats_returns_forecast_view') || can('recommendations_view')) && (
```
Et ajouter, juste après le lien "Prévision de taux de retour" dans la même liste :
```jsx
                {can('recommendations_view') && (
                  <li>{mainLink('/dashboard/recommandations', ICONS.stats, 'Recommandations')}</li>
                )}
```

- [ ] **Step 5: Run les tests concernés**

Run: `npm run test -- DashboardLayout App.test RecommendationsPage`
Expected: `PASS`.

- [ ] **Step 6: Commit**

```bash
git diff frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx
git add frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx
git commit -m "feat(recommendations): route + lien sidebar sous IA

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Suite complète + documentation + déploiement

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Lancer la suite backend complète**

```bash
cd backend
venv/Scripts/python manage.py test products orders team -v 1 --noinput
```
Expected: `OK`. Si erreur de connexion à `test_mzsolutions` (déjà rencontré cette session), nettoyer avant de relancer :
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
Expected: tous les tests passent (aucune régression sur les ~406+ tests déjà en place).

- [ ] **Step 3: Étendre `CLAUDE.md`**

Localiser la ligne de clôture de l'analyse prédictive :
```markdown
Les 3 volets de l'analyse prédictive (prévision de ventes, prévision de rupture de stock, prévision de taux de retour) sont désormais tous en production.
```
Ajouter juste après :
```markdown
**Recommandations produit (2026-09, 5ème chantier IA)** — moteur déterministe (`products/recommendations.py`, aucun appel IA dans le calcul) : « achetés ensemble » (comptage de co-occurrences sur les commandes réelles, `OrderItem`, seuil minimum 2, exclut `duplicate`/`fake`) avec repli automatique sur la similarité de contenu (même catégorie, prix ±30%) si l'historique d'achat est insuffisant. Exposé côté boutique publique (fiche produit « Vous pourriez aussi aimer », panier « Souvent achetés ensemble ») et côté dashboard vendeur (nouvelle page `pages/orders/RecommendationsPage.jsx`, permission `recommendations_view`, sous le menu IA) : produits à mettre en avant (score marge×stock/vélocité), produits en tendance (croissance du rythme de vente sur 7j vs 7j précédents), associations de vente croisée (bundles). Explication IA à la demande sur chaque ligne dashboard (« Pourquoi ce produit ? ») — le prompt ne reçoit que les chiffres déjà calculés, jamais l'historique brut, **aucun cache** contrairement à l'explication du score de risque (ces chiffres changent chaque jour).

Testé via `manage.py test products` (X tests, dont Y dédiés aux recommandations) + suite frontend complète (Z tests, aucune régression).
```
Remplacer X/Y/Z par les chiffres réels obtenus à l'étape 1/2.

- [ ] **Step 4: Commit la doc**

```bash
git diff CLAUDE.md
git add CLAUDE.md
git commit -m "docs: documente les recommandations produit (5ème chantier IA)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Pousser sur origin/main**

```bash
git push origin main
```

- [ ] **Step 6: Déployer sur le serveur de production**

```bash
SSH_KEY="C:\Users\filali\Downloads\Key server MZSolutions\mzsolutions-key.pem"
ssh -i "$SSH_KEY" ubuntu@mzsol.online "cd /home/ubuntu/mzsolutions && mkdir -p ~/backups && docker compose exec -T db pg_dump -U mzsolutions mzsolutions > ~/backups/pre_recommendations_\$(date +%Y%m%d_%H%M%S).sql"
```
Puis :
```bash
ssh -i "$SSH_KEY" ubuntu@mzsol.online "cd /home/ubuntu/mzsolutions && git pull origin main && docker compose exec -T backend python manage.py showmigrations products team | tail -10"
```
Vérifier qu'aucune migration n'est en attente (attendu — ce chantier n'ajoute aucun champ modèle, `recommendations_view` est une entrée de dict Python dans `team/models.py`, pas un modèle). Si une migration apparaît en attente de façon inattendue, s'arrêter et investiguer avant de continuer (ne pas appliquer à l'aveugle).

```bash
ssh -i "$SSH_KEY" ubuntu@mzsol.online "cd /home/ubuntu/mzsolutions && docker compose build backend frontend && docker compose up -d --no-deps backend frontend"
```

- [ ] **Step 7: Vérifier la santé du site et le comportement d'ollama**

```bash
ssh -i "$SSH_KEY" ubuntu@mzsol.online "docker ps -a --format 'table {{.Names}}\t{{.Status}}' | grep -i ollama"
curl -sI https://mzsol.online/ | head -3
```
Expected : conteneur `ollama` toujours `Exited`, site `200 OK`.

- [ ] **Step 8: Vérifier en conditions réelles sur le serveur**

Utiliser la même méthode que pour la vérification post-déploiement de la prévision de rupture de stock (créer un utilisateur/boutique/produits de test avec un email unique via `uuid`, appeler l'endpoint via `APIClient` avec `SERVER_NAME='mzsol.online', secure=True` pour contourner `ALLOWED_HOSTS`/`SECURE_SSL_REDIRECT`, puis nettoyer les données de test créées) — vérifier au minimum que `GET /api/products/recommendations/promote/` répond `200` pour un compte owner réel.

- [ ] **Step 9: Rapport final**

Résumer au utilisateur : nombre de tests backend/frontend, ce qui a été déployé, et rappeler que l'audit global de la boutique (chantier 2 de l'analyse prédictive IA élargie) reste à brainstormer séparément.
