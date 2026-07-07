import json
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, Client as PublicClient
from accounts.models import User
from stores.models import Store, SubscriptionQuota
from products.models import Product, Category, Promotion, ProductVariant, VariantOption
from team.models import RolePermission
from orders.models import (
    CarrierAccount, Order, OrderItem, OrderStatusHistory, FailureReason, CallAttempt,
    BlacklistedPhone, Complaint, ExchangeRequest, OrderAssignment,
)
from core.test_utils import make_owner, make_team_member, auth_client


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


class PublicOrderCreationTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.product = Product.objects.create(store=self.store, name='Real Product', price=Decimal('5000'), stock=10)
        self.client = PublicClient()

    def _post(self, **overrides):
        payload = {
            'store_slug': self.store.slug, 'first_name': 'Cust', 'phone': '0555000000', 'wilaya': 'Alger',
            'items': [{'product': self.product.id, 'price': 1, 'quantity': 1, 'product_name': 'x'}],
        }
        payload.update(overrides)
        return self.client.post('/api/public/orders/', payload, content_type='application/json')

    def test_price_from_client_is_ignored_and_recomputed(self):
        resp = self._post()
        self.assertEqual(resp.status_code, 201)
        order = Order.objects.get(id=resp.json()['id'])
        self.assertEqual(order.total, Decimal('5000.00'))

    def test_unknown_product_rejected(self):
        resp = self._post(items=[{'product': 999999, 'price': 1, 'quantity': 1}])
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    def test_stock_deducted_on_creation(self):
        self._post(items=[{'product': self.product.id, 'price': 1, 'quantity': 3}])
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 7)

    def test_blacklisted_phone_blocked(self):
        BlacklistedPhone.objects.create(store=self.store, phone='0555000000', message='Non merci')
        resp = self._post()
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(Order.objects.count(), 0)
        bl = BlacklistedPhone.objects.get(store=self.store, phone='0555000000')
        self.assertEqual(bl.blocked_attempts, 1)

    def test_quota_exceeded_blocked(self):
        self.store.quota.orders_limit = 0
        self.store.quota.orders_used = 0
        self.store.quota.save()
        resp = self._post()
        self.assertEqual(resp.status_code, 403)

    def test_promo_code_applies_discount_on_resolved_price(self):
        Promotion.objects.create(store=self.store, name='10%', kind='code', code='TEN',
                                  discount_type='percentage', discount_value=Decimal('10'))
        resp = self._post(promo_code='ten', items=[{'product': self.product.id, 'price': 1, 'quantity': 2}])
        self.assertEqual(resp.status_code, 201)
        order = Order.objects.get(id=resp.json()['id'])
        # 2 x 5000 = 10000, -10% = 9000
        self.assertEqual(order.total, Decimal('9000.00'))
        promo = Promotion.objects.get(code='TEN')
        self.assertEqual(promo.uses_count, 1)

    def test_invalid_promo_code_rejected(self):
        resp = self._post(promo_code='NOPE')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)


class AuthenticatedOrderCreationTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.product = Product.objects.create(store=self.store, name='P', price=Decimal('1000'), stock=20)

    def test_owner_creates_order_with_server_side_price(self):
        client = auth_client(self.owner)
        resp = client.post('/api/orders/', {
            'first_name': 'C', 'phone': '0600', 'wilaya': 'Oran',
            'items': [{'product': self.product.id, 'price': 1, 'quantity': 2}],
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        order = Order.objects.get(id=resp.data['id'])
        self.assertEqual(order.total, Decimal('2000.00'))

    def test_confirmateur_cannot_create_order(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.post('/api/orders/', {
            'first_name': 'C', 'phone': '0600', 'wilaya': 'Oran',
            'items': [{'product': self.product.id, 'price': 1, 'quantity': 1}],
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_dropshipper_restricted_to_selected_products(self):
        from dropshipping.models import DropshipperProduct
        drop_user, drop_member = make_team_member(self.store, 'dropshipper')
        other_product = Product.objects.create(store=self.store, name='NotSelected', price=Decimal('500'))
        DropshipperProduct.objects.create(store=self.store, dropshipper=drop_member, product=self.product)

        client = auth_client(drop_user)
        resp = client.post('/api/orders/', {
            'first_name': 'C', 'phone': '0600', 'wilaya': 'Oran',
            'items': [{'product': other_product.id, 'price': 1, 'quantity': 1}],
        }, format='json')
        self.assertEqual(resp.status_code, 403)

        resp2 = client.post('/api/orders/', {
            'first_name': 'C', 'phone': '0600', 'wilaya': 'Oran',
            'items': [{'product': self.product.id, 'price': 1, 'quantity': 1}],
        }, format='json')
        self.assertEqual(resp2.status_code, 201)
        self.assertEqual(Order.objects.get(id=resp2.data['id']).dropshipper_id, drop_member.id)

    def test_isolated_per_store(self):
        other_owner, other_store = make_owner()
        Order.objects.create(store=other_store, first_name='X', phone='0700', wilaya='Blida')
        client = auth_client(self.owner)
        resp = client.get('/api/orders/')
        self.assertEqual(resp.data['count'], 0)


class ScheduledOrderTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.product = Product.objects.create(store=self.store, name='P', price=Decimal('1000'), stock=20)
        self.client = auth_client(self.owner)

    def _future(self, **kwargs):
        from django.utils import timezone
        return (timezone.now() + timedelta(**kwargs)).isoformat()

    def test_creates_scheduled_order_without_side_effects(self):
        resp = self.client.post('/api/orders/', {
            'first_name': 'C', 'phone': '0600', 'wilaya': 'Oran',
            'items': [{'product': self.product.id, 'price': 1, 'quantity': 2}],
            'scheduled_at': self._future(days=1),
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        order = Order.objects.get(id=resp.data['id'])
        self.assertEqual(order.status, 'scheduled')
        self.assertIsNotNone(order.scheduled_at)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 20)  # pas décrémenté
        self.store.quota.refresh_from_db()
        self.assertEqual(self.store.quota.orders_used, 0)  # quota non consommé
        self.assertFalse(hasattr(order, 'assignment'))

    def test_past_scheduled_at_rejected(self):
        resp = self.client.post('/api/orders/', {
            'first_name': 'C', 'phone': '0600', 'wilaya': 'Oran',
            'items': [{'product': self.product.id, 'price': 1, 'quantity': 1}],
            'scheduled_at': self._future(days=-1),
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    def test_scheduling_bypasses_quota_gate(self):
        self.store.quota.orders_limit = 0
        self.store.quota.save()
        resp = self.client.post('/api/orders/', {
            'first_name': 'C', 'phone': '0600', 'wilaya': 'Oran',
            'items': [{'product': self.product.id, 'price': 1, 'quantity': 1}],
            'scheduled_at': self._future(days=1),
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_send_now_activates_order(self):
        make_team_member(self.store, 'confirmateur')
        resp = self.client.post('/api/orders/', {
            'first_name': 'C', 'phone': '0600', 'wilaya': 'Oran',
            'items': [{'product': self.product.id, 'price': 1, 'quantity': 3}],
            'scheduled_at': self._future(days=1),
        }, format='json')
        order_id = resp.data['id']

        activate_resp = self.client.post(f'/api/orders/{order_id}/status/', {'status': 'pending'}, format='json')
        self.assertEqual(activate_resp.status_code, 200)

        order = Order.objects.get(id=order_id)
        self.assertEqual(order.status, 'pending')
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 17)  # décrémenté à l'activation
        self.store.quota.refresh_from_db()
        self.assertEqual(self.store.quota.orders_used, 1)
        self.assertTrue(hasattr(order, 'assignment'))

    def test_management_command_activates_due_orders(self):
        from django.core.management import call_command
        from django.utils import timezone
        order = Order.objects.create(
            store=self.store, status='scheduled', scheduled_at=timezone.now() - timedelta(minutes=1),
            first_name='C', phone='0600', wilaya='Oran',
        )
        OrderItem.objects.create(order=order, product=self.product, product_name='P', price=Decimal('1000'), quantity=1)
        order.recalculate()

        call_command('activate_scheduled_orders')

        order.refresh_from_db()
        self.assertEqual(order.status, 'pending')
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 19)

    def test_edit_scheduled_at_before_activation(self):
        resp = self.client.post('/api/orders/', {
            'first_name': 'C', 'phone': '0600', 'wilaya': 'Oran',
            'items': [{'product': self.product.id, 'price': 1, 'quantity': 1}],
            'scheduled_at': self._future(days=1),
        }, format='json')
        order_id = resp.data['id']

        new_date = self._future(days=3)
        put_resp = self.client.put(f'/api/orders/{order_id}/', {'scheduled_at': new_date}, format='json')
        self.assertEqual(put_resp.status_code, 200)
        order = Order.objects.get(id=order_id)
        self.assertEqual(order.scheduled_at.isoformat(), new_date)


class OrderStatusTransitionTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.product = Product.objects.create(store=self.store, name='P', price=Decimal('1000'))
        self.order = Order.objects.create(store=self.store, first_name='C', phone='0600', wilaya='Alger', status='pending')
        OrderItem.objects.create(order=self.order, product=self.product, product_name='P', price=Decimal('1000'), quantity=1)

    def test_status_change_recorded_in_history(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/orders/{self.order.id}/status/', {'status': 'confirmed', 'note': 'ok'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(OrderStatusHistory.objects.filter(order=self.order, status='confirmed').exists())

    def test_invalid_status_rejected(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/orders/{self.order.id}/status/', {'status': 'bogus'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_confirmed_creates_shipment_with_default_carrier(self):
        CarrierAccount.objects.create(store=self.store, carrier='yalidine', is_active=True, is_default=True)
        client = auth_client(self.owner)
        resp = client.post(f'/api/orders/{self.order.id}/status/', {'status': 'confirmed'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.order.refresh_from_db()
        self.assertTrue(self.order.carrier_tracking_number.startswith('MOCK-'))

    def test_confirmed_without_carrier_gives_warning_not_error(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/orders/{self.order.id}/status/', {'status': 'confirmed'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('carrier_warning', resp.data)


class CallAttemptPermissionTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_dropshipper_cannot_access_unrelated_order(self):
        drop_user, _ = make_team_member(self.store, 'dropshipper')
        order = Order.objects.create(store=self.store, first_name='C', phone='0600', wilaya='Alger')
        client = auth_client(drop_user)
        resp = client.get(f'/api/orders/{order.id}/call-attempts/')
        self.assertEqual(resp.status_code, 403)

    def test_dropshipper_can_access_own_order(self):
        drop_user, drop_member = make_team_member(self.store, 'dropshipper')
        order = Order.objects.create(store=self.store, first_name='C', phone='0600', wilaya='Alger', dropshipper=drop_member)
        client = auth_client(drop_user)
        resp = client.get(f'/api/orders/{order.id}/call-attempts/')
        self.assertEqual(resp.status_code, 200)

    def test_confirmateur_can_access_assigned_order(self):
        from orders.models import OrderAssignment
        conf_user, conf_member = make_team_member(self.store, 'confirmateur')
        order = Order.objects.create(store=self.store, first_name='C', phone='0600', wilaya='Alger')
        OrderAssignment.objects.create(order=order, confirmateur=conf_member)
        client = auth_client(conf_user)
        resp = client.post(f'/api/orders/{order.id}/call-attempts/', {'status': 'no_answer'}, format='json')
        self.assertEqual(resp.status_code, 201)


class ChargilyWebhookOrderTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.order = Order.objects.create(store=self.store, first_name='C', phone='0600', wilaya='Alger',
                                           status='pending', chargily_checkout_id='chk_1', payment_method='chargily')

    def test_valid_signature_confirms_order_and_increments_quota(self):
        payload = {'type': 'checkout.paid', 'data': {'id': 'chk_1', 'metadata': {'order_id': self.order.id}}}
        with patch('orders.chargily.verify_webhook_signature', return_value=True):
            resp = self.client.post('/api/public/webhooks/chargily/', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(resp.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'confirmed')
        self.store.quota.refresh_from_db()
        self.assertEqual(self.store.quota.orders_used, 1)

    def test_invalid_signature_rejected_and_order_untouched(self):
        payload = {'type': 'checkout.paid', 'data': {'id': 'chk_1', 'metadata': {'order_id': self.order.id}}}
        resp = self.client.post('/api/public/webhooks/chargily/', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(resp.status_code, 403)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'pending')


class BlacklistTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_block_and_list(self):
        client = auth_client(self.owner)
        resp = client.post('/api/orders/blacklist/', {'phone': '0555111111', 'message': 'Non'}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(BlacklistedPhone.objects.filter(store=self.store, phone='0555111111').exists())

    def test_isolated_per_store(self):
        BlacklistedPhone.objects.create(store=self.store, phone='0555111111')
        other_owner, _ = make_owner()
        client = auth_client(other_owner)
        resp = client.get('/api/orders/blacklist/')
        self.assertEqual(len(resp.data), 0)


class ComplaintPublicFlowTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.order = Order.objects.create(store=self.store, first_name='C', phone='0555222222', wilaya='Alger')

    def test_wrong_phone_returns_generic_404(self):
        resp = self.client.post('/api/public/complaints/', {
            'store_slug': self.store.slug, 'order_id': self.order.id, 'phone': '0000000000',
            'subject': 'Pb', 'description': 'Description',
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 404)

    def test_correct_phone_creates_complaint_with_initial_message(self):
        resp = self.client.post('/api/public/complaints/', {
            'store_slug': self.store.slug, 'order_id': self.order.id, 'phone': '0555222222',
            'subject': 'Pb', 'description': 'Description',
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 201)
        complaint = Complaint.objects.get(order=self.order)
        self.assertEqual(complaint.messages.count(), 1)

    def test_owner_can_change_status(self):
        complaint = Complaint.objects.create(store=self.store, order=self.order, subject='S', description='D')
        client = auth_client(self.owner)
        resp = client.post(f'/api/orders/complaints/{complaint.id}/status/', {'status': 'resolved', 'note': 'done'}, format='json')
        self.assertEqual(resp.status_code, 200)
        complaint.refresh_from_db()
        self.assertEqual(complaint.status, 'resolved')


class ExchangePublicFlowTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.product = Product.objects.create(store=self.store, name='Shoe', price=Decimal('3000'))
        self.order = Order.objects.create(store=self.store, first_name='C', phone='0555333333', wilaya='Alger')
        self.item = OrderItem.objects.create(order=self.order, product=self.product, product_name='Shoe', price=Decimal('3000'), quantity=1)

    def test_approval_moves_stock_between_options(self):
        from products.models import ProductVariant, VariantOption
        variant = ProductVariant.objects.create(product=self.product, name='Taille')
        returned_opt = VariantOption.objects.create(variant=variant, value='40', stock=0)
        replacement_opt = VariantOption.objects.create(variant=variant, value='42', stock=5)
        self.item.variant_option = returned_opt
        self.item.save()

        exchange = ExchangeRequest.objects.create(
            store=self.store, order_item=self.item, replacement_option=replacement_opt, reason='Trop petit',
        )
        client = auth_client(self.owner)
        resp = client.post(f'/api/orders/exchanges/{exchange.id}/status/', {'status': 'approved'}, format='json')
        self.assertEqual(resp.status_code, 200)

        returned_opt.refresh_from_db()
        replacement_opt.refresh_from_db()
        self.assertEqual(returned_opt.stock, 1)
        self.assertEqual(replacement_opt.stock, 4)

    def test_double_approval_blocked(self):
        from products.models import ProductVariant, VariantOption
        variant = ProductVariant.objects.create(product=self.product, name='Taille')
        opt1 = VariantOption.objects.create(variant=variant, value='40', stock=1)
        opt2 = VariantOption.objects.create(variant=variant, value='42', stock=1)
        exchange = ExchangeRequest.objects.create(
            store=self.store, order_item=self.item, replacement_option=opt2, reason='x', status='approved',
        )
        client = auth_client(self.owner)
        resp = client.post(f'/api/orders/exchanges/{exchange.id}/status/', {'status': 'rejected'}, format='json')
        self.assertEqual(resp.status_code, 400)


class StatsViewsPermissionTests(TestCase):
    """Un seul test représentatif de la permission par endpoint stats,
    plus GlobalStatsView en détail (partage StatsPermissionMixin)."""
    def setUp(self):
        self.owner, self.store = make_owner()

    def _urls(self):
        return [
            '/api/orders/stats/orders/', '/api/orders/stats/returns/', '/api/orders/stats/failures/',
            '/api/orders/stats/stock-sales/', '/api/orders/stats/products/', '/api/orders/stats/wilayas/',
            '/api/orders/stats/sources/', '/api/orders/stats/global/', '/api/orders/stats/confirmation/',
        ]

    def test_confirmateur_without_permission_forbidden_on_all_stats_endpoints(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        for url in self._urls():
            resp = client.get(url)
            self.assertEqual(resp.status_code, 403, url)

    def test_owner_allowed_on_all_stats_endpoints(self):
        client = auth_client(self.owner)
        for url in self._urls():
            resp = client.get(url)
            self.assertEqual(resp.status_code, 200, url)

    def test_confirmateur_granted_stats_view_permission_allowed(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        RolePermission.objects.create(store=self.store, role='confirmateur', permission='stats_view', enabled=True)
        client = auth_client(conf_user)
        resp = client.get('/api/orders/stats/global/')
        self.assertEqual(resp.status_code, 200)


class GlobalStatsDataTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_computes_confirmation_rate_and_revenue(self):
        today = date.today()
        Order.objects.create(store=self.store, first_name='A', phone='1', wilaya='Alger', status='delivered', total=Decimal('1000'))
        Order.objects.create(store=self.store, first_name='B', phone='2', wilaya='Alger', status='delivered', total=Decimal('2000'))
        Order.objects.create(store=self.store, first_name='C', phone='3', wilaya='Alger', status='cancelled')
        Order.objects.create(store=self.store, first_name='D', phone='4', wilaya='Alger', status='pending')  # non "processed"

        client = auth_client(self.owner)
        resp = client.get('/api/orders/stats/global/?period=day')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['total_orders'], 4)
        self.assertEqual(resp.data['delivered_count'], 2)
        self.assertEqual(resp.data['cancelled_count'], 1)
        # processed = delivered(2) + cancelled(1) = 3 ; confirmed = 2 -> 66.7%
        self.assertEqual(resp.data['confirmation_rate'], 66.7)
        self.assertEqual(resp.data['revenue'], Decimal('3000'))
        self.assertEqual(resp.data['avg_basket'], Decimal('1500.00'))

    def test_period_day_excludes_older_orders(self):
        old_order = Order.objects.create(store=self.store, first_name='Old', phone='9', wilaya='Alger', status='delivered', total=Decimal('500'))
        Order.objects.filter(pk=old_order.pk).update(created_at=date.today() - timedelta(days=10))

        client = auth_client(self.owner)
        resp = client.get('/api/orders/stats/global/?period=day')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['total_orders'], 0)

    def test_custom_period_invalid_dates_rejected(self):
        client = auth_client(self.owner)
        resp = client.get('/api/orders/stats/global/?period=custom&date_from=notadate&date_to=2026-01-01')
        self.assertEqual(resp.status_code, 400)


class SourceAndWilayaStatsTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_source_stats_distinguishes_manual_vs_online_channel(self):
        # "Vente manuelle" : créée par un membre authentifié (owner) via l'API
        product = Product.objects.create(store=self.store, name='P', price=Decimal('1000'), stock=10)
        client = auth_client(self.owner)
        client.post('/api/orders/', {
            'first_name': 'Manual', 'phone': '0600', 'wilaya': 'Oran',
            'items': [{'product': product.id, 'price': 1, 'quantity': 1}],
        }, format='json')
        # "Boutique en ligne" : créée via le checkout public (system, changed_by=None)
        PublicClient().post('/api/public/orders/', {
            'store_slug': self.store.slug, 'first_name': 'Online', 'phone': '0611', 'wilaya': 'Alger',
            'items': [{'product': product.id, 'price': 1, 'quantity': 1}],
        }, content_type='application/json')

        resp = client.get('/api/orders/stats/sources/?period=day')
        self.assertEqual(resp.status_code, 200)
        sources = {r['source'] for r in resp.data['results']}
        self.assertIn('Vente manuelle', sources)
        self.assertIn('Boutique en ligne', sources)

    def test_wilaya_stats_groups_and_sums_revenue(self):
        Order.objects.create(store=self.store, first_name='A', phone='1', wilaya='Alger', status='delivered', total=Decimal('1000'))
        Order.objects.create(store=self.store, first_name='B', phone='2', wilaya='Alger', status='delivered', total=Decimal('500'))
        Order.objects.create(store=self.store, first_name='C', phone='3', wilaya='Oran', status='pending')

        client = auth_client(self.owner)
        resp = client.get('/api/orders/stats/wilayas/?period=day')
        self.assertEqual(resp.status_code, 200)
        by_wilaya = {r['wilaya']: r for r in resp.data['results']}
        self.assertEqual(by_wilaya['Alger']['orders_count'], 2)
        self.assertEqual(by_wilaya['Alger']['revenue'], Decimal('1500'))
        self.assertEqual(by_wilaya['Oran']['confirmed_count'], 0)


class StockSalesStatsTests(TestCase):
    def test_units_sold_reflects_stock_movements(self):
        owner, store = make_owner()
        product = Product.objects.create(store=store, name='P', price=Decimal('1000'), stock=10)
        client = auth_client(owner)
        client.post('/api/orders/', {
            'first_name': 'C', 'phone': '0600', 'wilaya': 'Oran',
            'items': [{'product': product.id, 'price': 1, 'quantity': 3}],
        }, format='json')

        resp = client.get('/api/orders/stats/stock-sales/?period=day')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 1)
        self.assertEqual(resp.data['results'][0]['units_sold'], 3)


class ConfirmationRateViewTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_rate_by_confirmateur(self):
        conf_user, conf_member = make_team_member(self.store, 'confirmateur')
        order1 = Order.objects.create(store=self.store, first_name='A', phone='1', wilaya='Alger', status='confirmed')
        order2 = Order.objects.create(store=self.store, first_name='B', phone='2', wilaya='Alger', status='cancelled')
        OrderAssignment.objects.create(order=order1, confirmateur=conf_member)
        OrderAssignment.objects.create(order=order2, confirmateur=conf_member)

        client = auth_client(self.owner)
        resp = client.get('/api/orders/stats/confirmation/?period=day')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['total_confirmed'], 1)
        self.assertEqual(resp.data['total_processed'], 2)
        self.assertEqual(len(resp.data['by_confirmateur']), 1)
        self.assertEqual(resp.data['by_confirmateur'][0]['confirmed'], 1)
        self.assertEqual(resp.data['by_confirmateur'][0]['cancelled'], 1)
        self.assertEqual(resp.data['cancelled_total'], 1)
        self.assertEqual(len(resp.data['daily']), 1)
        self.assertEqual(resp.data['daily'][0]['processed'], 2)
        status_counts = {s['status']: s['count'] for s in resp.data['by_status']}
        self.assertEqual(status_counts['confirmed'], 1)
        self.assertEqual(status_counts['cancelled'], 1)

    def test_previous_period_comparison(self):
        from datetime import timedelta
        from django.utils import timezone
        old = Order.objects.create(store=self.store, first_name='Old', phone='9', wilaya='Alger', status='cancelled')
        old.created_at = timezone.now() - timedelta(days=8)
        old.save(update_fields=['created_at'])
        Order.objects.create(store=self.store, first_name='New', phone='8', wilaya='Alger', status='confirmed')

        client = auth_client(self.owner)
        resp = client.get('/api/orders/stats/confirmation/?period=week')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['previous_rate'], 0.0)


class CancellationTransitionTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.order = Order.objects.create(store=self.store, first_name='C', phone='0600', wilaya='Alger', status='confirmed')

    def test_cancel_requested_then_cancelled(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/orders/{self.order.id}/status/', {'status': 'cancel_requested'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'cancel_requested')

        resp2 = client.post(f'/api/orders/{self.order.id}/status/', {'status': 'cancelled', 'note': 'confirmé annulation'}, format='json')
        self.assertEqual(resp2.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'cancelled')
        self.assertTrue(OrderStatusHistory.objects.filter(order=self.order, status='cancelled').exists())

    def test_cancelled_order_visible_in_returns_stats_as_cancel_requested(self):
        # cancel_requested compté séparément de returned dans ReturnsStatsView
        client = auth_client(self.owner)
        client.post(f'/api/orders/{self.order.id}/status/', {'status': 'cancel_requested'}, format='json')
        resp = client.get('/api/orders/stats/returns/?period=day')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['cancel_requested_count'], 1)
        self.assertEqual(resp.data['returned_count'], 0)


class FailureReasonCRUDTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_create_list_update_delete(self):
        client = auth_client(self.owner)
        resp = client.post('/api/orders/failure-reasons/', {'label': 'Ne répond pas'}, format='json')
        self.assertEqual(resp.status_code, 201)
        reason_id = resp.data['id']

        resp2 = client.get('/api/orders/failure-reasons/')
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(len(resp2.data), 1)

        resp3 = client.put(f'/api/orders/failure-reasons/{reason_id}/', {'label': 'Injoignable'}, format='json')
        self.assertEqual(resp3.status_code, 200)
        self.assertEqual(resp3.data['label'], 'Injoignable')

        resp4 = client.delete(f'/api/orders/failure-reasons/{reason_id}/')
        self.assertEqual(resp4.status_code, 204)
        self.assertFalse(FailureReason.objects.filter(id=reason_id).exists())

    def test_confirmateur_cannot_create_or_modify(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.post('/api/orders/failure-reasons/', {'label': 'X'}, format='json')
        self.assertEqual(resp.status_code, 403)

        reason = FailureReason.objects.create(store=self.store, label='Existing')
        resp2 = client.put(f'/api/orders/failure-reasons/{reason.id}/', {'label': 'Hacked'}, format='json')
        self.assertEqual(resp2.status_code, 403)
        resp3 = client.delete(f'/api/orders/failure-reasons/{reason.id}/')
        self.assertEqual(resp3.status_code, 403)

    def test_confirmateur_can_read(self):
        FailureReason.objects.create(store=self.store, label='Existing')
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.get('/api/orders/failure-reasons/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)


class PublicOrderItemsViewTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.product = Product.objects.create(store=self.store, name='Shoe', price=Decimal('3000'))
        self.variant = ProductVariant.objects.create(product=self.product, name='Taille')
        self.opt40 = VariantOption.objects.create(variant=self.variant, value='40', is_active=True)
        self.opt42 = VariantOption.objects.create(variant=self.variant, value='42', is_active=True)

    def _order(self, phone, days_ago=0):
        order = Order.objects.create(store=self.store, first_name='C', phone=phone, wilaya='Alger')
        if days_ago:
            Order.objects.filter(pk=order.pk).update(created_at=date.today() - timedelta(days=days_ago))
            order.refresh_from_db()
        return order

    def test_wrong_phone_generic_404(self):
        order = self._order('0555000000')
        OrderItem.objects.create(order=order, product=self.product, variant_option=self.opt40,
                                  product_name='Shoe', price=Decimal('3000'), quantity=1)
        resp = self.client.get(f'/api/public/store/{self.store.slug}/order-items/', {'order_id': order.id, 'phone': '0000000000'})
        self.assertEqual(resp.status_code, 404)

    def test_missing_phone_rejected(self):
        resp = self.client.get(f'/api/public/store/{self.store.slug}/order-items/', {})
        self.assertEqual(resp.status_code, 400)

    def test_order_id_omitted_falls_back_to_most_recent_order(self):
        old_order = self._order('0555111111', days_ago=5)
        OrderItem.objects.create(order=old_order, product=self.product, variant_option=self.opt40,
                                  product_name='Shoe', price=Decimal('3000'), quantity=1)
        recent_order = self._order('0555111111', days_ago=0)
        OrderItem.objects.create(order=recent_order, product=self.product, variant_option=self.opt42,
                                  product_name='Shoe', price=Decimal('3000'), quantity=1)

        resp = self.client.get(f'/api/public/store/{self.store.slug}/order-items/', {'phone': '0555111111'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['order_id'], recent_order.id)

    def test_no_available_replacement_when_only_option_already_owned(self):
        # Un seul produit avec une seule variante active : celle déjà commandée -> aucune alternative
        solo_product = Product.objects.create(store=self.store, name='Solo', price=Decimal('1000'))
        variant = ProductVariant.objects.create(product=solo_product, name='Couleur')
        only_opt = VariantOption.objects.create(variant=variant, value='Rouge', is_active=True)
        order = self._order('0555222222')
        OrderItem.objects.create(order=order, product=solo_product, variant_option=only_opt,
                                  product_name='Solo', price=Decimal('1000'), quantity=1)

        resp = self.client.get(f'/api/public/store/{self.store.slug}/order-items/', {'order_id': order.id, 'phone': '0555222222'})
        self.assertEqual(resp.status_code, 200)
        items = resp.json()['items']
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['replacement_options'], [])


class PublicExchangeCreateViewTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.product = Product.objects.create(store=self.store, name='Shoe', price=Decimal('3000'))
        self.variant = ProductVariant.objects.create(product=self.product, name='Taille')
        self.opt40 = VariantOption.objects.create(variant=self.variant, value='40', stock=1)
        self.opt42 = VariantOption.objects.create(variant=self.variant, value='42', stock=1)
        self.order = Order.objects.create(store=self.store, first_name='C', phone='0555333333', wilaya='Alger')
        self.item = OrderItem.objects.create(order=self.order, product=self.product, variant_option=self.opt40,
                                              product_name='Shoe', price=Decimal('3000'), quantity=1)

    def test_missing_fields_rejected(self):
        resp = self.client.post('/api/public/exchanges/', {
            'store_slug': self.store.slug, 'phone': '0555333333',
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 400)

    def test_wrong_phone_generic_404(self):
        resp = self.client.post('/api/public/exchanges/', {
            'store_slug': self.store.slug, 'order_id': self.order.id, 'phone': '0000000000',
            'order_item_id': self.item.id, 'replacement_option_id': self.opt42.id, 'reason': 'x',
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 404)

    def test_replacement_from_other_product_rejected(self):
        other_product = Product.objects.create(store=self.store, name='Other', price=Decimal('100'))
        other_variant = ProductVariant.objects.create(product=other_product, name='Couleur')
        other_opt = VariantOption.objects.create(variant=other_variant, value='Bleu', stock=1)
        resp = self.client.post('/api/public/exchanges/', {
            'store_slug': self.store.slug, 'order_id': self.order.id, 'phone': '0555333333',
            'order_item_id': self.item.id, 'replacement_option_id': other_opt.id, 'reason': 'x',
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(ExchangeRequest.objects.exists())

    def test_valid_request_creates_open_exchange(self):
        resp = self.client.post('/api/public/exchanges/', {
            'store_slug': self.store.slug, 'order_id': self.order.id, 'phone': '0555333333',
            'order_item_id': self.item.id, 'replacement_option_id': self.opt42.id, 'reason': 'Trop petit',
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 201)
        exchange = ExchangeRequest.objects.get()
        self.assertEqual(exchange.status, 'open')

    def test_order_id_omitted_falls_back_to_most_recent(self):
        resp = self.client.post('/api/public/exchanges/', {
            'store_slug': self.store.slug, 'phone': '0555333333',
            'order_item_id': self.item.id, 'replacement_option_id': self.opt42.id, 'reason': 'x',
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 201)
