from django.test import TestCase

from audit.models import AuditLog
from core.test_utils import make_owner, auth_client, clear_throttle_cache
from orders.models import Order
from products.models import Product
from .tests import make_user

BASE = '/api/platform-admin'


class InspectBase(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.admin = make_user('ins-admin@test.com', is_platform_admin=True)
        self.admin_c = auth_client(self.admin)


class SearchTests(InspectBase):
    def setUp(self):
        super().setUp()
        self.order = Order.objects.create(store=self.store, first_name='Karim', last_name='Benali', phone='0661234567', wilaya='Alger',
                                          carrier_tracking_number='TRK-998877')
        Product.objects.create(store=self.store, name='Chaussure Rouge', sku='CHR-001', price=1000)

    def test_forbidden_for_non_admin_and_short_queries(self):
        self.assertEqual(auth_client(self.owner).get(f'{BASE}/search/?q=Karim').status_code, 403)
        self.assertEqual(self.admin_c.get(f'{BASE}/search/?q=ab').status_code, 400)

    def test_finds_across_stores_users_orders_products(self):
        _, other = make_owner()
        data = self.admin_c.get(f'{BASE}/search/?q={self.store.name[:5]}').data
        self.assertIn(self.store.id, [s['id'] for s in data['stores']])
        self.assertEqual(self.admin_c.get(f'{BASE}/search/?q=0661234').data['orders'][0]['id'], self.order.id)
        self.assertEqual(self.admin_c.get(f'{BASE}/search/?q=TRK-9988').data['orders'][0]['store_name'], self.store.name)
        self.assertEqual(self.admin_c.get(f'{BASE}/search/?q=CHR-00').data['products'][0]['sku'], 'CHR-001')
        self.assertEqual(self.admin_c.get(f'{BASE}/search/?q={self.owner.email}').data['users'][0]['email'], self.owner.email)

    def test_numeric_query_matches_order_id(self):
        big = Order.objects.create(store=self.store, first_name='Z', phone='0500000000', wilaya='Alger')
        ids = [o['id'] for o in self.admin_c.get(f'{BASE}/search/?q={big.id:03d}').data['orders']]
        self.assertIn(big.id, ids)

    def test_search_is_audited_without_the_term(self):
        self.admin_c.get(f'{BASE}/search/?q=0661234567')
        entry = AuditLog.objects.get(action='platform.global_search')
        self.assertNotIn('0661234567', str(entry.metadata) + entry.description)
        self.assertEqual(entry.metadata['query_length'], 10)

    def test_results_are_capped(self):
        for i in range(15):
            Product.objects.create(store=self.store, name=f'Lot {i}', price=1)
        self.assertEqual(len(self.admin_c.get(f'{BASE}/search/?q=Lot').data['products']), 10)


class ReadOnlyViewTests(InspectBase):
    def _enter(self, reason='Dépannage demandé par le vendeur'):
        resp = self.admin_c.post(f'{BASE}/accounts/{self.store.id}/view-as/', {'reason': reason}, format='json')
        return resp

    def test_reason_required_and_audited(self):
        self.assertEqual(self._enter(reason=' ').status_code, 400)
        self.assertEqual(self._enter().status_code, 200)
        self.assertTrue(AuditLog.objects.filter(action='platform.view_as_started', store=self.store).exists())

    def test_non_admin_cannot_view_as(self):
        resp = auth_client(self.owner).post(f'{BASE}/accounts/{self.store.id}/view-as/', {'reason': 'Dépannage demandé'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_reads_work_and_me_reports_read_only(self):
        self._enter()
        me = self.admin_c.get('/api/auth/me/').data
        self.assertTrue(me['impersonating']['read_only'])
        self.assertEqual(me['impersonating']['store_id'], self.store.id)
        self.assertEqual(self.admin_c.get('/api/products/').status_code, 200)

    def test_every_write_on_the_store_dashboard_is_refused_by_the_server(self):
        self._enter()
        Product.objects.create(store=self.store, name='Intact', price=10)
        for method, url, body in (
            ('post', '/api/products/', {'name': 'Pirate', 'price': 5}),
            ('put', '/api/stores/me/', {'name': 'Pirate'}),
            ('post', '/api/orders/', {'first_name': 'X'}),
            ('delete', f'/api/products/{Product.objects.get(name="Intact").id}/', None),
        ):
            resp = getattr(self.admin_c, method)(url, body, format='json') if body is not None else getattr(self.admin_c, method)(url)
            self.assertEqual(resp.status_code, 403, (method, url))
            self.assertEqual(resp.data['detail'], 'Mode lecture seule : modification impossible.')
        self.store.refresh_from_db()
        self.assertNotEqual(self.store.name, 'Pirate')
        self.assertFalse(Product.objects.filter(name='Pirate').exists())
        self.assertTrue(Product.objects.filter(name='Intact').exists())

    def test_admin_actions_and_auth_stay_available_while_viewing(self):
        self._enter()
        self.assertEqual(self.admin_c.get(f'{BASE}/overview/').status_code, 200)
        resp = self.admin_c.post(f'{BASE}/accounts/{self.store.id}/reset-password/')
        self.assertEqual(resp.status_code, 200)

    def test_leave_restores_normal_behaviour(self):
        self._enter()
        self.assertEqual(self.admin_c.post(f'{BASE}/view-as/leave/').status_code, 200)
        me = self.admin_c.get('/api/auth/me/').data
        self.assertIsNone(me['impersonating'])
        self.assertEqual(self.admin_c.get('/api/products/').status_code, 403)  # plus de boutique résolue

    def test_cookie_of_another_user_type_is_ignored(self):
        # un vendeur ne peut pas se servir de ce cookie pour franchir son périmètre
        client = auth_client(self.owner)
        client.cookies['mz_view_store'] = self.admin_c.post(f'{BASE}/accounts/{self.store.id}/view-as/', {'reason': 'Dépannage demandé'}, format='json').cookies['mz_view_store'].value
        me = client.get('/api/auth/me/').data
        self.assertIsNone(me['impersonating'])
        self.assertEqual(client.post('/api/products/', {'name': 'Mon produit', 'price': 5}, format='json').status_code, 201)

    def test_service_operator_mode_is_untouched_by_read_only(self):
        svc = make_user('ins-svc@test.com', is_service_admin=True)
        from platform_admin.models import PlatformConfirmationAccount
        PlatformConfirmationAccount.objects.create(store=self.store, is_active=True)
        c = auth_client(svc)
        self.assertEqual(c.post(f'{BASE}/stores/{self.store.id}/enter/').status_code, 200)
        self.assertEqual(c.post('/api/products/', {'name': 'Via service', 'price': 5}, format='json').status_code, 201)
