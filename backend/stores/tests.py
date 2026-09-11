from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile

from .models import Store, PixelConfig, SubscriptionPlan
from core.test_utils import make_owner, make_team_member, auth_client


class MyStoreTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner(store_name='Original', store_slug='original-slug')

    def test_get_returns_own_store(self):
        client = auth_client(self.owner)
        resp = client.get('/api/stores/me/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['slug'], 'original-slug')

    def test_put_updates_store(self):
        client = auth_client(self.owner)
        resp = client.put('/api/stores/me/', {'name': 'Updated Name'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.store.refresh_from_db()
        self.assertEqual(self.store.name, 'Updated Name')

    def test_confirmateur_cannot_update_store(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.put('/api/stores/me/', {'name': 'Hacked'}, format='json')
        self.assertEqual(resp.status_code, 403)


class QuotaTests(TestCase):
    def test_quota_created_with_trial_defaults(self):
        owner, store = make_owner()
        client = auth_client(owner)
        resp = client.get('/api/stores/me/quota/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['orders_limit'], 50)
        self.assertTrue(resp.data['is_trial_active'])
        self.assertIsNone(resp.data['plan'])


class StoreSettingsTests(TestCase):
    def test_get_creates_default_settings(self):
        owner, _ = make_owner()
        client = auth_client(owner)
        resp = client.get('/api/stores/me/settings/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['low_stock_threshold'], 5)

    def test_put_updates_settings(self):
        owner, _ = make_owner()
        client = auth_client(owner)
        resp = client.put('/api/stores/me/settings/', {'low_stock_threshold': 10}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['low_stock_threshold'], 10)


class PixelConfigTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_create_and_list_pixel(self):
        client = auth_client(self.owner)
        resp = client.post('/api/stores/me/pixels/', {
            'pixel_type': 'facebook', 'pixel_id': '1234567890', 'label': 'Main',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertNotIn('api_key', resp.data)  # jamais de champ api_key sur un pixel (pas pertinent ici)

        resp2 = client.get('/api/stores/me/pixels/')
        self.assertEqual(len(resp2.data), 1)

    def test_invalid_pixel_type_rejected(self):
        client = auth_client(self.owner)
        resp = client.post('/api/stores/me/pixels/', {'pixel_type': 'bogus', 'pixel_id': 'x'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_confirmateur_without_permission_cannot_view(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.get('/api/stores/me/pixels/')
        self.assertEqual(resp.status_code, 403)

    def test_isolated_per_store(self):
        PixelConfig.objects.create(store=self.store, pixel_type='facebook', pixel_id='111')
        other_owner, _ = make_owner()
        client = auth_client(other_owner)
        resp = client.get('/api/stores/me/pixels/')
        self.assertEqual(len(resp.data), 0)

    def test_delete_pixel(self):
        pixel = PixelConfig.objects.create(store=self.store, pixel_type='facebook', pixel_id='111')
        client = auth_client(self.owner)
        resp = client.delete(f'/api/stores/me/pixels/{pixel.id}/')
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(PixelConfig.objects.filter(id=pixel.id).exists())


class SubscriptionPlanTests(TestCase):
    def test_plans_seeded_and_listable(self):
        owner, _ = make_owner()
        client = auth_client(owner)
        resp = client.get('/api/stores/plans/')
        self.assertEqual(resp.status_code, 200)
        names = {p['name'] for p in resp.data}
        self.assertEqual(names, {'Starter', 'Pro', 'Business'})


class SubscribeTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.plan = SubscriptionPlan.objects.filter(name='Pro').first()
        if not self.plan:
            self.plan = SubscriptionPlan.objects.create(name='Pro', orders_limit=1000, price_monthly=4500, price_yearly=45000)

    @patch('orders.chargily.requests.post')
    def test_subscribe_creates_checkout_without_touching_quota(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.raise_for_status = lambda: None
        mock_post.return_value.json = lambda: {'id': 'chk_1', 'checkout_url': 'https://pay.test/chk_1'}

        client = auth_client(self.owner)
        resp = client.post('/api/stores/me/subscribe/', {'plan_id': self.plan.id, 'billing_cycle': 'monthly'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['payment_url'], 'https://pay.test/chk_1')

        self.store.quota.refresh_from_db()
        self.assertIsNone(self.store.quota.plan)  # pas encore upgradé, juste le checkout créé

    def test_confirmateur_cannot_subscribe(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.post('/api/stores/me/subscribe/', {'plan_id': self.plan.id, 'billing_cycle': 'monthly'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_subscribe_webhook_upgrades_quota(self):
        import json
        from django.test import Client as PublicClient
        c = PublicClient()
        payload = {
            'type': 'checkout.paid',
            'data': {'id': 'chk_sub_x', 'metadata': {
                'subscription': True, 'store_id': self.store.id, 'plan_id': self.plan.id, 'billing_cycle': 'monthly',
            }},
        }
        with patch('orders.chargily.verify_webhook_signature', return_value=True):
            resp = c.post('/api/public/webhooks/chargily/', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(resp.status_code, 200)
        self.store.quota.refresh_from_db()
        self.assertEqual(self.store.quota.plan_id, self.plan.id)
        self.assertEqual(self.store.quota.orders_limit, 1000)

    def test_subscribe_invalid_plan_id_404(self):
        client = auth_client(self.owner)
        resp = client.post('/api/stores/me/subscribe/', {'plan_id': 999999, 'billing_cycle': 'monthly'}, format='json')
        self.assertEqual(resp.status_code, 404)

    def test_subscribe_invalid_billing_cycle_400(self):
        client = auth_client(self.owner)
        resp = client.post('/api/stores/me/subscribe/', {'plan_id': self.plan.id, 'billing_cycle': 'weekly'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_monthly_upgrade_sets_period_end_30_days(self):
        import json
        from django.test import Client as PublicClient
        from django.utils import timezone
        c = PublicClient()
        payload = {
            'type': 'checkout.paid',
            'data': {'id': 'chk_monthly', 'metadata': {
                'subscription': True, 'store_id': self.store.id, 'plan_id': self.plan.id, 'billing_cycle': 'monthly',
            }},
        }
        before = timezone.now()
        with patch('orders.chargily.verify_webhook_signature', return_value=True):
            resp = c.post('/api/public/webhooks/chargily/', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(resp.status_code, 200)
        self.store.quota.refresh_from_db()
        self.assertEqual(self.store.quota.billing_cycle, 'monthly')
        delta = self.store.quota.period_end - before
        self.assertTrue(28 <= delta.days <= 31, delta.days)

    def test_yearly_upgrade_sets_period_end_365_days(self):
        import json
        from django.test import Client as PublicClient
        from django.utils import timezone
        c = PublicClient()
        payload = {
            'type': 'checkout.paid',
            'data': {'id': 'chk_yearly', 'metadata': {
                'subscription': True, 'store_id': self.store.id, 'plan_id': self.plan.id, 'billing_cycle': 'yearly',
            }},
        }
        before = timezone.now()
        with patch('orders.chargily.verify_webhook_signature', return_value=True):
            resp = c.post('/api/public/webhooks/chargily/', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(resp.status_code, 200)
        self.store.quota.refresh_from_db()
        self.assertEqual(self.store.quota.billing_cycle, 'yearly')
        delta = self.store.quota.period_end - before
        self.assertTrue(363 <= delta.days <= 366, delta.days)

    def test_forged_webhook_without_valid_signature_does_not_upgrade(self):
        import json
        from django.test import Client as PublicClient
        c = PublicClient()
        payload = {
            'type': 'checkout.paid',
            'data': {'id': 'chk_forged', 'metadata': {
                'subscription': True, 'store_id': self.store.id, 'plan_id': self.plan.id, 'billing_cycle': 'monthly',
            }},
        }
        resp = c.post('/api/public/webhooks/chargily/', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(resp.status_code, 403)
        self.store.quota.refresh_from_db()
        self.assertIsNone(self.store.quota.plan)


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
        result = compute_store_audit(self.store)
        self.assertIsNotNone(result['global_score'])
        self.assertIsNone(result['dimensions']['logistics']['score'])


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
        with patch('stores.views.ollama_client.generate', return_value='Synthèse test.'):
            resp = self.client_.post('/api/stores/me/audit/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['global_score'])
        self.assertEqual(resp.data['synthesis'], 'Synthèse test.')

    def test_post_saves_scores_even_if_ai_fails(self):
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
        with patch('stores.views.ollama_client.generate', return_value='Synthèse test.'):
            self.client_.post('/api/stores/me/audit/')
        resp = self.client_.get('/api/stores/me/audit/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['synthesis'], 'Synthèse test.')
