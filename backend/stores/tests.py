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
