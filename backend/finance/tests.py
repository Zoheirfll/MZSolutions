from datetime import date
from decimal import Decimal

from django.test import TestCase

from .models import Cost
from products.models import Product
from orders.models import Order, OrderItem, OrderStatusHistory
from core.test_utils import make_owner, make_team_member, auth_client


class CostTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_create_and_list_cost(self):
        client = auth_client(self.owner)
        resp = client.post('/api/finance/costs/', {
            'category': 'marketing', 'label': 'FB Ads', 'amount': '1500',
            'period_start': '2026-01-01', 'period_end': '2026-01-31',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        resp2 = client.get('/api/finance/costs/?category=marketing')
        self.assertEqual(len(resp2.data), 1)

    def test_confirmateur_without_permission_forbidden(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.get('/api/finance/costs/')
        self.assertEqual(resp.status_code, 403)

    def test_confirmateur_with_granted_permission_can_view(self):
        from team.models import RolePermission
        RolePermission.objects.create(store=self.store, role='confirmateur', permission='finances_view', enabled=True)
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.get('/api/finance/costs/')
        self.assertEqual(resp.status_code, 200)

    def test_confirmateur_cannot_write_even_with_view_permission(self):
        from team.models import RolePermission
        RolePermission.objects.create(store=self.store, role='confirmateur', permission='finances_view', enabled=True)
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.post('/api/finance/costs/', {
            'category': 'operational', 'label': 'X', 'amount': '10',
            'period_start': '2026-01-01', 'period_end': '2026-01-31',
        }, format='json')
        self.assertEqual(resp.status_code, 403)


class ProfitabilityTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.product = Product.objects.create(store=self.store, name='P', price=Decimal('1000'), cost_price=Decimal('600'))
        self.order = Order.objects.create(store=self.store, first_name='C', phone='0600', wilaya='Alger', status='delivered')
        OrderItem.objects.create(order=self.order, product=self.product, product_name='P', price=Decimal('1000'), quantity=1)
        OrderStatusHistory.objects.create(order=self.order, status='delivered')
        Cost.objects.create(store=self.store, category='operational', label='Loyer', amount=Decimal('100'),
                             period_start=date(2020, 1, 1), period_end=date(2030, 1, 1))

    def test_summary_includes_operational_costs(self):
        client = auth_client(self.owner)
        resp = client.get('/api/finance/profitability/summary/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Decimal(str(resp.data['revenue'])), Decimal('1000'))
        self.assertEqual(Decimal(str(resp.data['product_cost'])), Decimal('600'))
        self.assertEqual(Decimal(str(resp.data['operational_cost'])), Decimal('100'))
        self.assertEqual(Decimal(str(resp.data['net_profit'])), Decimal('300'))

    def test_detail_by_product_excludes_operational_cost(self):
        client = auth_client(self.owner)
        resp = client.get('/api/finance/profitability/?group_by=product')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(Decimal(str(resp.data[0]['profit'])), Decimal('400'))  # 1000 - 600, pas de loyer

    def test_returned_order_excluded_from_profitability(self):
        self.order.status = 'returned'
        self.order.save()
        client = auth_client(self.owner)
        resp = client.get('/api/finance/profitability/summary/')
        self.assertEqual(Decimal(str(resp.data['revenue'])), Decimal('0'))
