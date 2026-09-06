# Prévision de rupture de stock — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à la page Stock & Inventaire une estimation "rupture dans N jours" par produit/variante, calculée à partir du rythme de vente réel des 14 derniers jours.

**Architecture:** Module pur `products/stock_forecast.py` (aucune I/O réseau, aucun appel IA), consommé par une requête groupée unique ajoutée dans `InventoryListView` existante (pas de nouvel endpoint), affiché en colonne supplémentaire sur `StockPage.jsx`.

**Tech Stack:** Django 5.2 + DRF (backend existant), React 18 (frontend existant).

## Global Constraints

- Aucun appel IA — calcul 100% déterministe.
- Fenêtre fixe de 14 jours pour cette v1 (pas de nouveau réglage `StoreSettings`).
- `days_until_stockout` : `0` si stock déjà épuisé, `null` si aucune vente récente (jamais un chiffre inventé faute de données), sinon un nombre de jours réel.
- Une seule requête groupée supplémentaire pour toute la page (pas une requête par ligne).
- Tests obligatoires par tâche, commits fréquents, jamais `git add -A`.

---

## File Structure

```
backend/
  products/
    stock_forecast.py     — days_until_stockout() pur (nouveau)
    views.py                — InventoryListView étendue (modifié)
    tests.py                 — tests des 2 tâches backend (modifié)

frontend/src/
  pages/StockPage.jsx      — colonne "RUPTURE ESTIMÉE" (modifié)
  tests/pages/StockPage.test.jsx (modifié, si le fichier existe déjà — sinon créé)

CLAUDE.md — section Assistant IA étendue (modifié)
```

---

### Task 1: `stock_forecast.py` — calcul déterministe pur

**Files:**
- Create: `backend/products/stock_forecast.py`
- Test: `backend/products/tests.py`

**Interfaces:**
- Produces: `stock_forecast.days_until_stockout(current_stock, units_sold_14d) -> float | None`. Fonction pure, ne touche pas la base — les deux arguments sont déjà résolus par l'appelant (`InventoryListView`, Task 2), qui a besoin d'agréger les ventes de TOUTE la page en une seule requête, pas produit par produit.

- [ ] **Step 1: Écrire les tests**

Vérifier d'abord en tête de `backend/products/tests.py` que `TestCase` et `make_owner` sont déjà importés (chercher `from django.test import TestCase` et `from core.test_utils import make_owner`) ; les ajouter s'ils manquent, avec le même style d'import que le reste du fichier.

Ajouter à `backend/products/tests.py` :
```python
class StockForecastTest(TestCase):
    def test_already_out_of_stock_returns_zero(self):
        from products.stock_forecast import days_until_stockout
        self.assertEqual(days_until_stockout(current_stock=0, units_sold_14d=20), 0)

    def test_no_recent_sales_returns_none(self):
        from products.stock_forecast import days_until_stockout
        self.assertIsNone(days_until_stockout(current_stock=10, units_sold_14d=0))

    def test_normal_case_computes_days(self):
        from products.stock_forecast import days_until_stockout
        # 14 unités vendues en 14 jours = 1/jour ; stock de 10 → 10 jours
        result = days_until_stockout(current_stock=10, units_sold_14d=14)
        self.assertAlmostEqual(result, 10.0, places=1)

    def test_high_sales_rate_gives_few_days(self):
        from products.stock_forecast import days_until_stockout
        # 140 unités vendues en 14 jours = 10/jour ; stock de 5 → 0.5 jour
        result = days_until_stockout(current_stock=5, units_sold_14d=140)
        self.assertAlmostEqual(result, 0.5, places=1)
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test products.tests.StockForecastTest -v 2`
Expected: `ModuleNotFoundError: No module named 'products.stock_forecast'`

- [ ] **Step 3: Implémenter `stock_forecast.py`**

```python
"""Prévision de rupture de stock — calcul DÉTERMINISTE pur, aucune I/O,
aucun appel IA. Voir docs/superpowers/specs/2026-09-06-prevision-rupture-stock-design.md."""

STOCKOUT_WINDOW_DAYS = 14


def days_until_stockout(current_stock, units_sold_14d):
    """`units_sold_14d` : unités vendues sur les 14 derniers jours (déjà
    agrégées par l'appelant depuis StockMovement). Retourne :
    - 0 si le stock est déjà à 0 (rupture déjà là, pas de calcul)
    - None si aucune vente récente (aucune estimation honnête possible)
    - sinon le nombre de jours estimé avant rupture."""
    if current_stock <= 0:
        return 0
    if not units_sold_14d:
        return None
    daily_rate = units_sold_14d / STOCKOUT_WINDOW_DAYS
    return current_stock / daily_rate
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test products.tests.StockForecastTest -v 2`
Expected: `Ran 4 tests ... OK`

- [ ] **Step 5: Commit**

```bash
git add backend/products/stock_forecast.py backend/products/tests.py
git commit -m "feat(stock-forecast): calcul déterministe de rupture de stock

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Extension de `InventoryListView`

**Files:**
- Modify: `backend/products/views.py`
- Test: `backend/products/tests.py`

**Interfaces:**
- Consumes: `stock_forecast.days_until_stockout(current_stock, units_sold_14d)` (Task 1).
- Produces: chaque ligne de `GET /api/products/inventory/` gagne `sales_rate_14d` (float, arrondi à 2 décimales) et `days_until_stockout` (float arrondi à 1 décimale, `0`, ou `null`).

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/products/tests.py` :
```python
class InventoryListViewStockForecastTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.client_ = auth_client(self.owner)

    def _sell(self, product, variant_option, qty, days_ago=1):
        from django.utils import timezone
        from products.models import StockMovement
        m = StockMovement.objects.create(
            store=self.store, product=product, variant_option=variant_option,
            quantity=-qty, reason='order_sale',
        )
        m.created_at = timezone.now() - timezone.timedelta(days=days_ago)
        m.save(update_fields=['created_at'])

    def test_simple_product_gets_forecast_fields(self):
        from products.models import Product
        p = Product.objects.create(store=self.store, name='Sans variante', price=1000, stock=10, is_active=True)
        self._sell(p, None, qty=14, days_ago=2)
        resp = self.client_.get('/api/products/inventory/')
        row = next(r for r in resp.data['results'] if r['product_id'] == p.id)
        self.assertAlmostEqual(row['days_until_stockout'], 10.0, places=1)

    def test_variant_option_sales_isolated_from_sibling_variant(self):
        from products.models import Product, ProductVariant, VariantOption
        p = Product.objects.create(store=self.store, name='Avec variantes', price=1000, is_active=True)
        variant = ProductVariant.objects.create(product=p, name='Couleur')
        opt_a = VariantOption.objects.create(variant=variant, value='Rouge', stock=10)
        opt_b = VariantOption.objects.create(variant=variant, value='Bleu', stock=10)
        self._sell(p, opt_a, qty=14, days_ago=2)  # seule l'option A a des ventes
        resp = self.client_.get('/api/products/inventory/')
        row_a = next(r for r in resp.data['results'] if r['variant_option_id'] == opt_a.id)
        row_b = next(r for r in resp.data['results'] if r['variant_option_id'] == opt_b.id)
        self.assertAlmostEqual(row_a['days_until_stockout'], 10.0, places=1)
        self.assertIsNone(row_b['days_until_stockout'])

    def test_out_of_stock_shows_zero(self):
        from products.models import Product
        p = Product.objects.create(store=self.store, name='Épuisé', price=1000, stock=0, is_active=True)
        self._sell(p, None, qty=5, days_ago=1)
        resp = self.client_.get('/api/products/inventory/')
        row = next(r for r in resp.data['results'] if r['product_id'] == p.id)
        self.assertEqual(row['days_until_stockout'], 0)

    def test_sale_older_than_14_days_excluded(self):
        from products.models import Product
        p = Product.objects.create(store=self.store, name='Vente ancienne', price=1000, stock=10, is_active=True)
        self._sell(p, None, qty=14, days_ago=20)
        resp = self.client_.get('/api/products/inventory/')
        row = next(r for r in resp.data['results'] if r['product_id'] == p.id)
        self.assertIsNone(row['days_until_stockout'])
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test products.tests.InventoryListViewStockForecastTest -v 2`
Expected: `KeyError: 'days_until_stockout'`

- [ ] **Step 3: Étendre `InventoryListView`**

Dans `backend/products/views.py`, ajouter l'import en haut du fichier (à côté des autres imports du module `products`) :
```python
from .stock_forecast import days_until_stockout
```

Dans `InventoryListView.get`, juste après la ligne `products = store.products.prefetch_related('variants__options').filter(is_active=True)` (et son éventuel filtre `search`, donc juste avant le bloc `try: threshold = ...`), ajouter la requête groupée :
```python
        from datetime import timedelta
        from django.db.models import Sum
        from django.utils import timezone
        from .stock_forecast import STOCKOUT_WINDOW_DAYS

        since = timezone.now() - timedelta(days=STOCKOUT_WINDOW_DAYS)
        sales_rows = (StockMovement.objects
                      .filter(store=store, reason='order_sale', created_at__gte=since)
                      .values('product_id', 'variant_option_id')
                      .annotate(sold=Sum('quantity')))
        sales_by_key = {(r['product_id'], r['variant_option_id']): abs(r['sold'] or 0) for r in sales_rows}
```

Vérifier que `StockMovement` est déjà importé en tête de `products/views.py` (chercher `from .models import`) — sinon l'ajouter à cet import existant plutôt que d'en créer un nouveau.

Modifier ensuite les deux endroits où une ligne de `results` est construite pour y ajouter les deux nouveaux champs. Premier endroit (variante avec option) :
```python
                        units_sold = sales_by_key.get((p.id, opt.id), 0)
                        results.append({
                            'product_id':        p.id,
                            'product_name':      p.name,
                            'variant_option_id': opt.id,
                            'variant_name':      v.name,
                            'option_value':      opt.value,
                            'sku':               opt.sku,
                            'stock':             opt.stock,
                            'sales_rate_14d':     round(units_sold / STOCKOUT_WINDOW_DAYS, 2),
                            'days_until_stockout': (lambda d: round(d, 1) if d is not None and d != 0 else d)(days_until_stockout(opt.stock, units_sold)),
                        })
```

Deuxième endroit (produit sans variante) :
```python
                units_sold = sales_by_key.get((p.id, None), 0)
                results.append({
                    'product_id':        p.id,
                    'product_name':      p.name,
                    'variant_option_id': None,
                    'variant_name':      None,
                    'option_value':      None,
                    'sku':               p.sku,
                    'stock':             p.stock,
                    'sales_rate_14d':     round(units_sold / STOCKOUT_WINDOW_DAYS, 2),
                    'days_until_stockout': (lambda d: round(d, 1) if d is not None and d != 0 else d)(days_until_stockout(p.stock, units_sold)),
                })
```

⚠️ Le `lambda` inline ci-dessus n'est là que pour arrondir un résultat non-`None`/non-`0` à 1 décimale sans dupliquer la logique — si cette écriture semble peu lisible à l'implémentation, la remplacer par une petite fonction locale équivalente au même endroit, tant que le comportement reste identique (arrondir uniquement le cas "nombre de jours réel", jamais transformer `None` ou `0`).

- [ ] **Step 4: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test products.tests.InventoryListViewStockForecastTest -v 2`
Expected: `Ran 4 tests ... OK`

- [ ] **Step 5: Run toute la suite `products` pour vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test products -v 1 --noinput`
Expected: `OK`. Si une erreur de connexion à `test_mzsolutions` apparaît (déjà rencontré plusieurs fois dans cette session), l'éliminer avant de relancer :
```bash
venv/Scripts/python manage.py shell -c "
from django.db import connections
conn = connections['default']
with conn.cursor() as c:
    c.execute(\"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='test_mzsolutions'\")
"
```

- [ ] **Step 6: Commit**

```bash
git add backend/products/views.py backend/products/tests.py
git commit -m "feat(stock-forecast): expose la prévision de rupture sur l'inventaire

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — colonne "Rupture estimée"

**Files:**
- Modify: `frontend/src/pages/StockPage.jsx`
- Test: `frontend/src/tests/pages/StockPage.test.jsx` (modifié s'il existe déjà, sinon vérifier avant de créer un doublon — chercher le fichier avant d'écrire cette étape)

**Interfaces:**
- Consumes: `item.days_until_stockout` (Task 2, `number | 0 | null`).
- Produces: colonne visuelle supplémentaire dans le tableau d'inventaire.

- [ ] **Step 1: Vérifier si un fichier de test existe déjà pour `StockPage.jsx`**

Run: `ls frontend/src/tests/pages/StockPage.test.jsx 2>&1 || echo "n'existe pas"`

Si le fichier existe, lire son contenu avant de l'étendre. Ajouter le test suivant dans la structure déjà en place (adapter le mock d'API existant du fichier pour que la réponse `/products/inventory/` de test contienne les 3 cas). Si le fichier n'existe pas, créer un nouveau fichier minimal focalisé sur ce test précis (ne pas tenter de reproduire toute la couverture de `StockPage.jsx`, hors périmètre de cette tâche) :

```jsx
// frontend/src/tests/pages/StockPage.test.jsx (nouveau, si absent)
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import StockPage from '../../pages/StockPage'

vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/products/inventory/')) {
        return Promise.resolve({ data: { count: 3, page: 1, per_page: 20, threshold: 5, results: [
          { product_id: 1, product_name: 'Épuisé', variant_option_id: null, variant_name: null, option_value: null, sku: '', stock: 0, sales_rate_14d: 0.5, days_until_stockout: 0 },
          { product_id: 2, product_name: 'Urgent', variant_option_id: null, variant_name: null, option_value: null, sku: '', stock: 5, sales_rate_14d: 2, days_until_stockout: 2.5 },
          { product_id: 3, product_name: 'Sans estimation', variant_option_id: null, variant_name: null, option_value: null, sku: '', stock: 20, sales_rate_14d: 0, days_until_stockout: null },
        ] } })
      }
      if (url.includes('/products/low-stock/')) return Promise.resolve({ data: { threshold: 5, products: [] } })
      return Promise.resolve({ data: { count: 0 } })
    }),
  },
}))
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

describe('StockPage — colonne rupture estimée', () => {
  it('affiche "Épuisé" pour un stock à 0', async () => {
    render(<MemoryRouter><StockPage /></MemoryRouter>)
    expect(await screen.findByText(/Épuisé/i)).toBeInTheDocument()
  })

  it('affiche le nombre de jours pour une estimation normale', async () => {
    render(<MemoryRouter><StockPage /></MemoryRouter>)
    expect(await screen.findByText(/2.5/)).toBeInTheDocument()
  })

  it('affiche "—" quand aucune estimation n\'est possible', async () => {
    render(<MemoryRouter><StockPage /></MemoryRouter>)
    const cells = await screen.findAllByText('—')
    expect(cells.length).toBeGreaterThan(0)
  })
})
```

⚠️ Adapter les URLs mockées (`/products/inventory/`, `/products/low-stock/`) et les noms de champs exacts en relisant `StockPage.jsx` avant d'écrire ce test — la page peut appeler d'autres endpoints au montage (ex. réglage de seuil) qui doivent aussi être mockés pour éviter un rejet de promesse non géré.

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd frontend && npm run test -- StockPage`
Expected: échec (pas de texte "Épuisé"/jours affiché — la colonne n'existe pas encore).

- [ ] **Step 3: Ajouter la colonne dans `StockPage.jsx`**

Dans `frontend/src/pages/StockPage.jsx`, dans l'en-tête du tableau (chercher `<th className="px-4 py-3 font-medium">STOCK</th>`), ajouter juste après :
```jsx
              <th className="px-4 py-3 font-medium">RUPTURE ESTIMÉE</th>
```

Dans le rendu du corps du tableau, juste après la cellule qui affiche `item.stock` (chercher le bloc `<td className="px-4 py-3">` qui contient `item.stock === 0 ? theme.badge.danger : ...`), ajouter une nouvelle cellule :
```jsx
                <td className="px-4 py-3">
                  {item.days_until_stockout === 0 ? (
                    <span className={theme.badge.danger}>Épuisé</span>
                  ) : item.days_until_stockout === null || item.days_until_stockout === undefined ? (
                    <span className={theme.badge.neutral}>—</span>
                  ) : (
                    <span className={item.days_until_stockout < 7 ? theme.badge.danger : item.days_until_stockout < 14 ? theme.badge.warning : theme.badge.success}>
                      ~{item.days_until_stockout} jour{item.days_until_stockout >= 2 ? 's' : ''}
                    </span>
                  )}
                </td>
```

Mettre à jour tout `colSpan` fixe du tableau (lignes de chargement/état vide, chercher `colSpan={6}`) en `colSpan={7}` pour tenir compte de la colonne ajoutée.

- [ ] **Step 4: Run pour vérifier le succès**

Run: `cd frontend && npm run test -- StockPage`
Expected: tous les tests du fichier passent.

- [ ] **Step 5: Run la suite frontend complète pour vérifier l'absence de régression**

Run: `cd frontend && npm run test`
Expected: tous les tests passent.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/StockPage.jsx frontend/src/tests/pages/StockPage.test.jsx
git commit -m "feat(stock-forecast): colonne rupture estimée sur la page Stock

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Étendre la section Assistant IA de `CLAUDE.md`**

Localiser la section `### Assistant IA (Ollama local + Groq cloud, 2026-09)` et ajouter, juste avant la ligne finale `Testé via manage.py test orders team...` (fin de section — repérer la ligne exacte au moment de l'implémentation) :
```markdown
**Prévision de rupture de stock (2026-09, sous-chantier de l'analyse prédictive)** — aucun appel IA, calcul déterministe (`products/stock_forecast.py::days_until_stockout()`) à partir du rythme de vente réel des 14 derniers jours (`products.StockMovement`, `reason='order_sale'`). `0` si déjà épuisé, `null` si aucune vente récente (pas d'estimation inventée), sinon un nombre de jours. Extension de `GET /api/products/inventory/` existant (pas de nouvel endpoint) — colonne "RUPTURE ESTIMÉE" sur `StockPage.jsx`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documente la prévision de rupture de stock

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review (fait avant remise du plan)

- **Couverture du spec** : calcul déterministe (Task 1), extension de l'endpoint existant avec agrégation groupée (Task 2), colonne visuelle avec 3 cas (Task 3), doc (Task 4). Tous les points du spec sont couverts. Notifications automatiques et réglage de fenêtre par boutique explicitement exclus, non traités.
- **Placeholders** : aucun TBD/TODO. Un point signalé explicitement comme à vérifier avant d'écrire la version finale : le test frontend (Task 3, Step 1) doit être adapté aux endpoints réellement appelés par `StockPage.jsx` au montage, à lire avant d'écrire le mock final.
- **Cohérence des types/noms** : `days_until_stockout(current_stock, units_sold_14d) -> float | None` (Task 1) consommé à l'identique dans `InventoryListView` (Task 2). Champs de réponse (`sales_rate_14d`, `days_until_stockout`) identiques entre Task 2 (backend) et Task 3 (consommation frontend). `STOCKOUT_WINDOW_DAYS` (Task 1) réutilisé tel quel dans Task 2 plutôt que dupliqué en dur.
