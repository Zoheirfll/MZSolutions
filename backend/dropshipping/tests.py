from decimal import Decimal

from django.test import TestCase

from .models import DropshipperProduct, Commission, CommissionEntry, CommissionPayment
from products.models import Product
from orders.models import Order, OrderItem
from orders.views import _sync_commission_for_order
from core.test_utils import make_owner, make_team_member, auth_client


class DropshipperProductSelectionTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.drop_user, self.drop = make_team_member(self.store, 'dropshipper')
        self.product = Product.objects.create(store=self.store, name='P', price=Decimal('1000'))

    def test_dropshipper_can_select_own_product(self):
        client = auth_client(self.drop_user)
        resp = client.post('/api/dropshipping/products/', {'product': self.product.id}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(DropshipperProduct.objects.filter(dropshipper=self.drop, product=self.product).exists())

    def test_owner_views_dropshipper_selection_via_query_param(self):
        DropshipperProduct.objects.create(store=self.store, dropshipper=self.drop, product=self.product)
        client = auth_client(self.owner)
        resp = client.get(f'/api/dropshipping/products/?dropshipper={self.drop.id}')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_confirmateur_cannot_view_others_selection(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.get(f'/api/dropshipping/products/?dropshipper={self.drop.id}')
        self.assertEqual(resp.status_code, 403)

    def test_delete_selection(self):
        selection = DropshipperProduct.objects.create(store=self.store, dropshipper=self.drop, product=self.product)
        client = auth_client(self.drop_user)
        resp = client.delete(f'/api/dropshipping/products/{selection.id}/')
        self.assertEqual(resp.status_code, 204)


class CommissionConfigTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.drop_user, self.drop = make_team_member(self.store, 'dropshipper')
        self.product = Product.objects.create(store=self.store, name='P', price=Decimal('1000'))

    def test_owner_configures_commission_upsert(self):
        client = auth_client(self.owner)
        resp = client.post('/api/dropshipping/commissions/', {
            'dropshipper': self.drop.id, 'product': self.product.id,
            'commission_type': 'percentage', 'value': '10',
        }, format='json')
        self.assertEqual(resp.status_code, 201)

        # upsert : un second POST sur le même couple met à jour, ne duplique pas
        resp2 = client.post('/api/dropshipping/commissions/', {
            'dropshipper': self.drop.id, 'product': self.product.id,
            'commission_type': 'fixed', 'value': '50',
        }, format='json')
        self.assertEqual(resp2.status_code, 201)
        self.assertEqual(Commission.objects.filter(dropshipper=self.drop, product=self.product).count(), 1)
        self.assertEqual(Commission.objects.get(dropshipper=self.drop, product=self.product).commission_type, 'fixed')

    def test_dropshipper_cannot_configure_commission(self):
        client = auth_client(self.drop_user)
        resp = client.post('/api/dropshipping/commissions/', {
            'dropshipper': self.drop.id, 'product': self.product.id,
            'commission_type': 'percentage', 'value': '10',
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_compute_amount_percentage_and_fixed(self):
        pct = Commission.objects.create(store=self.store, dropshipper=self.drop, product=self.product,
                                         commission_type='percentage', value=Decimal('10'))
        self.assertEqual(pct.compute_amount(Decimal('1000'), 2), Decimal('200.00'))

        fixed = Commission.objects.create(store=self.store, dropshipper=self.drop,
                                           product=Product.objects.create(store=self.store, name='P2', price=Decimal('500')),
                                           commission_type='fixed', value=Decimal('50'))
        self.assertEqual(fixed.compute_amount(Decimal('500'), 3), Decimal('150.00'))


class CommissionCalculationOnDeliveryTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.drop_user, self.drop = make_team_member(self.store, 'dropshipper')
        self.product = Product.objects.create(store=self.store, name='P', price=Decimal('1000'))
        Commission.objects.create(store=self.store, dropshipper=self.drop, product=self.product,
                                   commission_type='percentage', value=Decimal('10'))
        self.order = Order.objects.create(store=self.store, first_name='C', phone='0600', wilaya='Alger', dropshipper=self.drop)
        self.item = OrderItem.objects.create(order=self.order, product=self.product, product_name='P', price=Decimal('1000'), quantity=2)

    def test_delivered_creates_commission_entry(self):
        _sync_commission_for_order(self.store, self.order, 'delivered')
        entry = CommissionEntry.objects.get(order_item=self.item)
        self.assertEqual(entry.amount, Decimal('200.00'))  # 10% de 2000

    def test_idempotent_on_repeated_delivered(self):
        _sync_commission_for_order(self.store, self.order, 'delivered')
        _sync_commission_for_order(self.store, self.order, 'delivered')
        self.assertEqual(CommissionEntry.objects.filter(order_item=self.item).count(), 1)

    def test_returned_removes_commission_entry(self):
        _sync_commission_for_order(self.store, self.order, 'delivered')
        _sync_commission_for_order(self.store, self.order, 'returned')
        self.assertFalse(CommissionEntry.objects.filter(order_item=self.item).exists())

    def test_no_commission_without_dropshipper(self):
        order2 = Order.objects.create(store=self.store, first_name='C2', phone='0601', wilaya='Alger')
        item2 = OrderItem.objects.create(order=order2, product=self.product, product_name='P', price=Decimal('1000'), quantity=1)
        _sync_commission_for_order(self.store, order2, 'delivered')
        self.assertFalse(CommissionEntry.objects.filter(order_item=item2).exists())


class DropshipperPaymentTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.drop_user, self.drop = make_team_member(self.store, 'dropshipper')

    def test_pay_settles_balance_to_zero(self):
        CommissionEntry.objects.create(store=self.store, dropshipper=self.drop, order_item=self._make_item(),
                                        product=None, amount=Decimal('300'))
        client = auth_client(self.owner)
        resp = client.post(f'/api/dropshipping/dropshippers/{self.drop.id}/pay/', {'note': 'Paid'}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(CommissionPayment.objects.get(dropshipper=self.drop).amount, Decimal('300'))

        detail = client.get(f'/api/dropshipping/dropshippers/{self.drop.id}/')
        self.assertEqual(Decimal(str(detail.data['balance'])), Decimal('0'))

    def test_pay_with_zero_balance_rejected(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/dropshipping/dropshippers/{self.drop.id}/pay/', {}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_dropshipper_can_view_own_balance_not_others(self):
        other_drop_user, other_drop = make_team_member(self.store, 'dropshipper')
        client = auth_client(self.drop_user)
        resp = client.get(f'/api/dropshipping/dropshippers/{other_drop.id}/')
        self.assertEqual(resp.status_code, 403)

    def _make_item(self):
        product = Product.objects.create(store=self.store, name='X', price=Decimal('100'))
        order = Order.objects.create(store=self.store, first_name='C', phone='0600', wilaya='Alger')
        return OrderItem.objects.create(order=order, product=product, product_name='X', price=Decimal('100'), quantity=1)
