from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from core.test_utils import make_owner, auth_client, clear_throttle_cache
from orders.payments import verify_subscription_payment
from platform_admin.tests import make_user
from .invoicing import issue_invoice, render_pdf
from .models import Invoice, SubscriptionPayment, SubscriptionPlan


class InvoiceTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.plan = SubscriptionPlan.objects.create(name='Pro', orders_limit=100, price_monthly=Decimal('1190'), price_yearly=Decimal('11900'))
        self.pay = SubscriptionPayment.objects.create(store=self.store, plan=self.plan, amount=Decimal('1190'), status='success', transaction_id='T1')

    def test_issue_is_idempotent_and_numbered(self):
        a = issue_invoice(self.pay)
        self.assertEqual(issue_invoice(self.pay).id, a.id)
        self.assertRegex(a.number, r'^\d{4}-0001$')
        p2 = SubscriptionPayment.objects.create(store=self.store, plan=self.plan, amount=Decimal('100'), status='success')
        self.assertTrue(issue_invoice(p2).number.endswith('-0002'))

    def test_vat_split_and_snapshot_frozen(self):
        inv = issue_invoice(self.pay)
        self.assertEqual(inv.snapshot['total_ht'], '1000.00')
        self.assertEqual(inv.snapshot['vat'], '190.00')
        self.plan.name = 'Renamed'
        self.plan.save()
        inv.refresh_from_db()
        self.assertIn('Pro', inv.snapshot['description'])

    def test_no_invoice_for_pending_or_failed(self):
        for st in ('pending', 'failed'):
            self.pay.status = st
            self.assertIsNone(issue_invoice(self.pay))

    def test_pdf_is_valid(self):
        self.assertTrue(render_pdf(issue_invoice(self.pay)).startswith(b'%PDF-'))

    def test_confirmation_issues_invoice(self):
        self.pay.status = 'pending'
        self.pay.save()
        with patch('orders.payments.sofizpay.check_status', return_value='success'):
            verify_subscription_payment(self.pay.id)
        self.assertTrue(Invoice.objects.filter(payment=self.pay).exists())

    def test_vendor_endpoints_scoped(self):
        inv = issue_invoice(self.pay)
        c = auth_client(self.owner)
        self.assertEqual(len(c.get('/api/support/invoices/').data), 1)
        r = c.get(f'/api/support/invoices/{inv.id}/pdf/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Content-Type'], 'application/pdf')
        other, _ = make_owner()
        self.assertEqual(auth_client(other).get(f'/api/support/invoices/{inv.id}/pdf/').status_code, 404)

    def test_admin_download(self):
        admin = auth_client(make_user('inv-admin@test.com', is_platform_admin=True))
        r = admin.get(f'/api/platform-admin/payments/{self.pay.id}/invoice/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(auth_client(self.owner).get(f'/api/platform-admin/payments/{self.pay.id}/invoice/').status_code, 403)
        self.pay.status = 'pending'
        self.pay.save()
        Invoice.objects.all().delete()
        self.assertEqual(admin.get(f'/api/platform-admin/payments/{self.pay.id}/invoice/').status_code, 409)
