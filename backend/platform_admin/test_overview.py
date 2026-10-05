from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from core.test_utils import make_owner, auth_client, clear_throttle_cache
from orders.models import Order
from stores.models import SubscriptionPlan, SubscriptionPayment
from .overview import compute_overview
from .tests import make_user


class OverviewTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.now = timezone.now()
        self.plan = SubscriptionPlan.objects.create(name='Pro', orders_limit=1000, price_monthly=4500, price_yearly=45000)

    def _store(self, **q):
        owner, store = make_owner()
        for k, v in q.items():
            setattr(store.quota, k, v)
        store.quota.save()
        return store

    def test_store_counts_by_state(self):
        self._store(trial_ends_at=self.now + timedelta(days=10))
        self._store(plan=self.plan, period_end=self.now + timedelta(days=20))
        self._store(trial_ends_at=self.now - timedelta(days=1))
        susp = self._store(trial_ends_at=self.now + timedelta(days=10))
        susp.is_active = False
        susp.save()
        stores = compute_overview(self.now)['stores']
        self.assertEqual(
            (stores['total'], stores['trial'], stores['subscribed'], stores['expired'], stores['suspended']),
            (4, 1, 1, 1, 1),
        )

    def test_revenue_counts_only_successful_payments(self):
        s = self._store(trial_ends_at=self.now + timedelta(days=10))
        SubscriptionPayment.objects.create(store=s, plan=self.plan, amount=4500, status='success', transaction_id='a')
        SubscriptionPayment.objects.create(store=s, plan=self.plan, amount=1500, status='failed', transaction_id='b')
        data = compute_overview(self.now)['revenue']
        self.assertEqual(float(data['this_month']), 4500.0)
        self.assertEqual(data['failed'], 1)
        self.assertEqual(len(data['series']), 12)
        self.assertEqual(float(data['series'][-1]['value']), 4500.0)

    def test_alerts(self):
        soon = self._store(trial_ends_at=self.now + timedelta(days=2))
        high = self._store(trial_ends_at=self.now + timedelta(days=20), orders_limit=100, orders_used=85)
        self._store(trial_ends_at=self.now + timedelta(days=20))
        stuck = SubscriptionPayment.objects.create(store=high, plan=self.plan, amount=1500, status='pending', transaction_id='c')
        SubscriptionPayment.objects.filter(pk=stuck.pk).update(created_at=self.now - timedelta(hours=3))
        alerts = compute_overview(self.now)['alerts']
        self.assertEqual(alerts['trials_expiring']['store_ids'], [soon.id])
        self.assertEqual(alerts['quota_high']['store_ids'], [high.id])
        self.assertEqual(alerts['payments_stuck']['count'], 1)

    def test_orders_last_30_days(self):
        s = self._store(trial_ends_at=self.now + timedelta(days=10))
        Order.objects.create(store=s, first_name='C', phone='0600', wilaya='Alger')
        self.assertEqual(compute_overview(self.now)['activity']['orders_30d'], 1)

    def test_endpoint_levels(self):
        admin = make_user('ov-a@test.com', is_platform_admin=True)
        self.assertEqual(auth_client(admin).get('/api/platform-admin/overview/').status_code, 200)
        owner, _ = make_owner()
        self.assertEqual(auth_client(owner).get('/api/platform-admin/overview/').status_code, 403)
