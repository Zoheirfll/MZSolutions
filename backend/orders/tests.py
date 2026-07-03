import json
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, Client as PublicClient
from accounts.models import User
from stores.models import Store, SubscriptionQuota
from products.models import Product, Category, Promotion
from orders.models import (
    CarrierAccount, Order, OrderItem, OrderStatusHistory, FailureReason, CallAttempt,
    BlacklistedPhone, Complaint, ExchangeRequest,
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
