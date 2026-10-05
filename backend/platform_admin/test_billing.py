from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from audit.models import AuditLog
from core.test_utils import make_owner, auth_client, clear_throttle_cache
from stores.models import SubscriptionPayment, SubscriptionPlan
from .tests import make_user

BASE = '/api/platform-admin'


class BillingBase(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.admin_c = auth_client(make_user('bill-admin@test.com', is_platform_admin=True))
        self.super_c = auth_client(make_user('bill-super@test.com', is_platform_superadmin=True))
        self.plan = SubscriptionPlan.objects.create(name='Pro', orders_limit=1000, price_monthly=4500, price_yearly=45000)

    def _payment(self, status='success', amount=4500, store=None):
        return SubscriptionPayment.objects.create(store=store or self.store, plan=self.plan, amount=amount,
                                                  status=status, transaction_id=f'tx-{SubscriptionPayment.objects.count()}')


class PlanTests(BillingBase):
    def test_admin_can_read_but_not_write(self):
        self.assertEqual(self.admin_c.get(f'{BASE}/plans/').status_code, 200)
        resp = self.admin_c.post(f'{BASE}/plans/', {'name': 'X', 'price_monthly': 1, 'price_yearly': 1}, format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(self.admin_c.put(f'{BASE}/plans/{self.plan.id}/', {'price_monthly': 1}, format='json').status_code, 403)

    def test_list_includes_inactive_with_subscriber_count(self):
        inactive = SubscriptionPlan.objects.create(name='Old', orders_limit=10, price_monthly=1, price_yearly=1, is_active=False)
        self.store.quota.plan = self.plan
        self.store.quota.save()
        rows = {r['id']: r for r in self.super_c.get(f'{BASE}/plans/').data['results']}
        self.assertIn(inactive.id, rows)
        self.assertEqual(rows[self.plan.id]['subscribers'], 1)

    def test_create_plan_and_unlimited_orders(self):
        resp = self.super_c.post(f'{BASE}/plans/', {'name': 'Business', 'orders_limit': '', 'price_monthly': 9000, 'price_yearly': 90000,
                                                    'features': ['Support 24/7']}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertIsNone(resp.data['orders_limit'])

    def test_update_changes_future_price_not_existing_payments(self):
        payment = self._payment()
        resp = self.super_c.put(f'{BASE}/plans/{self.plan.id}/', {'price_monthly': 5000}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.plan.refresh_from_db()
        self.assertEqual(float(self.plan.price_monthly), 5000.0)
        payment.refresh_from_db()
        self.assertEqual(float(payment.amount), 4500.0)

    def test_validation_errors(self):
        for body in ({'price_monthly': -5}, {'price_monthly': 'abc'}, {'orders_limit': 0}, {'name': ' '}, {'features': 'nope'}):
            resp = self.super_c.put(f'{BASE}/plans/{self.plan.id}/', body, format='json')
            self.assertEqual(resp.status_code, 400, body)

    def test_deactivate_instead_of_delete(self):
        self.super_c.put(f'{BASE}/plans/{self.plan.id}/', {'is_active': False}, format='json')
        self.plan.refresh_from_db()
        self.assertFalse(self.plan.is_active)
        self.assertEqual(self.super_c.delete(f'{BASE}/plans/{self.plan.id}/').status_code, 405)

    def test_update_is_audited_with_changes(self):
        self.super_c.put(f'{BASE}/plans/{self.plan.id}/', {'price_monthly': 5000}, format='json')
        entry = AuditLog.objects.get(action='platform.plan_updated')
        self.assertIsNone(entry.store)
        self.assertIn('price_monthly', entry.metadata['changes'])


class PaymentListTests(BillingBase):
    def test_non_admin_forbidden(self):
        self.assertEqual(auth_client(self.owner).get(f'{BASE}/payments/').status_code, 403)

    def test_list_summary_and_filters(self):
        self._payment('success', 4500)
        self._payment('success', 1500)
        self._payment('failed', 9000)
        self._payment('refunded', 3000)
        data = self.admin_c.get(f'{BASE}/payments/').data
        self.assertEqual(data['count'], 4)
        self.assertEqual(float(data['summary']['collected']), 6000.0)
        self.assertEqual(float(data['summary']['refunded']), 3000.0)
        only_failed = self.admin_c.get(f'{BASE}/payments/?status=failed').data
        self.assertEqual(only_failed['count'], 1)

    def test_search_by_store_and_date(self):
        _, other = make_owner()
        self._payment('success', store=other)
        self._payment('success')
        self.assertEqual(self.admin_c.get(f'{BASE}/payments/?store={other.id}').data['count'], 1)
        future = (timezone.now() + timedelta(days=2)).strftime('%Y-%m-%d')
        self.assertEqual(self.admin_c.get(f'{BASE}/payments/?date_from={future}').data['count'], 0)


class RefundTests(BillingBase):
    def test_admin_cannot_refund(self):
        p = self._payment()
        self.assertEqual(self.admin_c.post(f'{BASE}/payments/{p.id}/refund/', {'reason': 'Demande client'}, format='json').status_code, 403)

    def test_reason_required_and_only_confirmed_payments(self):
        ok, failed = self._payment(), self._payment('failed')
        self.assertEqual(self.super_c.post(f'{BASE}/payments/{ok.id}/refund/', {'reason': ' '}, format='json').status_code, 400)
        self.assertEqual(self.super_c.post(f'{BASE}/payments/{failed.id}/refund/', {'reason': 'Demande client'}, format='json').status_code, 400)

    def test_refund_records_and_is_not_repeatable(self):
        p = self._payment()
        resp = self.super_c.post(f'{BASE}/payments/{p.id}/refund/', {'reason': 'Demande client'}, format='json')
        self.assertEqual(resp.status_code, 200)
        p.refresh_from_db()
        self.assertEqual(p.status, 'refunded')
        self.assertEqual(p.refund_reason, 'Demande client')
        self.assertEqual(self.super_c.post(f'{BASE}/payments/{p.id}/refund/', {'reason': 'Encore une fois'}, format='json').status_code, 400)

    def test_revoke_access_removes_only_the_matching_plan(self):
        p = self._payment()
        quota = self.store.quota
        quota.plan, quota.period_end, quota.billing_cycle = self.plan, timezone.now() + timedelta(days=20), 'monthly'
        quota.save()
        resp = self.super_c.post(f'{BASE}/payments/{p.id}/refund/', {'reason': 'Demande client', 'revoke_access': True}, format='json')
        self.assertTrue(resp.data['revoked_access'])
        quota.refresh_from_db()
        self.assertIsNone(quota.plan_id)
        self.assertIsNone(quota.period_end)

    def test_revoke_access_keeps_a_different_current_plan(self):
        other_plan = SubscriptionPlan.objects.create(name='Business', orders_limit=None, price_monthly=9000, price_yearly=90000)
        p = self._payment()
        quota = self.store.quota
        quota.plan, quota.period_end = other_plan, timezone.now() + timedelta(days=20)
        quota.save()
        resp = self.super_c.post(f'{BASE}/payments/{p.id}/refund/', {'reason': 'Demande client', 'revoke_access': True}, format='json')
        self.assertFalse(resp.data['revoked_access'])
        quota.refresh_from_db()
        self.assertEqual(quota.plan_id, other_plan.id)

    def test_refunded_payment_leaves_revenue_kpi(self):
        from .overview import compute_overview
        p = self._payment()
        self.assertEqual(float(compute_overview()['revenue']['this_month']), 4500.0)
        self.super_c.post(f'{BASE}/payments/{p.id}/refund/', {'reason': 'Demande client'}, format='json')
        self.assertEqual(float(compute_overview()['revenue']['this_month']), 0.0)

    def test_refund_is_audited_on_the_store(self):
        p = self._payment()
        self.super_c.post(f'{BASE}/payments/{p.id}/refund/', {'reason': 'Demande client'}, format='json')
        self.assertTrue(AuditLog.objects.filter(action='platform.payment_refunded', store=self.store).exists())


class ExportTests(BillingBase):
    def test_admin_cannot_export_superadmin_can(self):
        self.assertEqual(self.admin_c.get(f'{BASE}/payments/export/').status_code, 403)
        self._payment()
        resp = self.super_c.get(f'{BASE}/payments/export/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('text/csv', resp['Content-Type'])
        body = resp.content.decode('utf-8')
        self.assertTrue(body.startswith('﻿'))
        self.assertIn(';', body)
        self.assertEqual(len(body.strip().splitlines()), 2)

    def test_formula_injection_is_neutralised(self):
        self.store.name = '=HYPERLINK("http://evil")'
        self.store.save()
        self._payment()
        body = self.super_c.get(f'{BASE}/payments/export/').content.decode('utf-8')
        self.assertIn("'=HYPERLINK", body)
        self.assertNotIn(';=HYPERLINK', body)

    def test_export_is_audited(self):
        self.super_c.get(f'{BASE}/payments/export/')
        self.assertTrue(AuditLog.objects.filter(action='platform.payments_exported').exists())


class GrantTests(BillingBase):
    url = lambda self: f'{BASE}/accounts/{self.store.id}/grant/'

    def test_admin_cannot_grant(self):
        resp = self.admin_c.post(self.url(), {'action': 'add_orders', 'value': 10, 'reason': 'Geste commercial'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_reason_required(self):
        resp = self.super_c.post(self.url(), {'action': 'add_orders', 'value': 10, 'reason': ''}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_add_orders(self):
        before = self.store.quota.orders_limit
        resp = self.super_c.post(self.url(), {'action': 'add_orders', 'value': 100, 'reason': 'Geste commercial'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.store.quota.refresh_from_db()
        self.assertEqual(self.store.quota.orders_limit, before + 100)

    def test_extend_trial_from_now_when_expired(self):
        self.store.quota.trial_ends_at = timezone.now() - timedelta(days=10)
        self.store.quota.save()
        self.super_c.post(self.url(), {'action': 'extend_trial', 'value': 7, 'reason': 'Geste commercial'}, format='json')
        self.store.quota.refresh_from_db()
        delta = self.store.quota.trial_ends_at - timezone.now()
        self.assertTrue(6 <= delta.days <= 7)

    def test_grant_plan(self):
        resp = self.super_c.post(self.url(), {'action': 'grant_plan', 'plan_id': self.plan.id, 'value': 3, 'reason': 'Geste commercial'}, format='json')
        self.assertEqual(resp.status_code, 200)
        quota = self.store.quota
        quota.refresh_from_db()
        self.assertEqual(quota.plan_id, self.plan.id)
        self.assertEqual(quota.orders_limit, 1000)
        self.assertTrue(88 <= (quota.period_end - timezone.now()).days <= 90)

    def test_grant_plan_stacks_on_remaining_period(self):
        quota = self.store.quota
        quota.plan, quota.period_end = self.plan, timezone.now() + timedelta(days=30)
        quota.save()
        self.super_c.post(self.url(), {'action': 'grant_plan', 'plan_id': self.plan.id, 'value': 1, 'reason': 'Geste commercial'}, format='json')
        quota.refresh_from_db()
        self.assertTrue(58 <= (quota.period_end - timezone.now()).days <= 60)

    def test_invalid_values_rejected(self):
        for body in ({'action': 'add_orders', 'value': 0}, {'action': 'add_orders', 'value': 'x'},
                     {'action': 'extend_trial', 'value': 400}, {'action': 'grant_plan', 'plan_id': 999999, 'value': 1},
                     {'action': 'grant_plan', 'plan_id': self.plan.id, 'value': 99}, {'action': 'nope', 'value': 1}):
            resp = self.super_c.post(self.url(), {**body, 'reason': 'Geste commercial'}, format='json')
            self.assertIn(resp.status_code, (400, 404), body)

    def test_grant_is_audited_with_before_after(self):
        self.super_c.post(self.url(), {'action': 'add_orders', 'value': 5, 'reason': 'Geste commercial'}, format='json')
        entry = AuditLog.objects.get(action='platform.quota_granted')
        self.assertEqual(entry.store, self.store)
        self.assertIn('before', entry.metadata)
        self.assertIn('after', entry.metadata)
