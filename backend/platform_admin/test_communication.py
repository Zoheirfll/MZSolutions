from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.utils import timezone

from audit.models import AuditLog
from channels.models import ChannelConnection
from core.test_utils import make_owner, make_team_member, auth_client, clear_throttle_cache
from orders.models import CarrierAccount
from stores.models import SubscriptionPlan
from webhooks.models import WebhookEndpoint
from .communication_models import ContactMessage, PlatformAnnouncement
from .tests import make_user

BASE = '/api/platform-admin'


class CommBase(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.admin_c = auth_client(make_user('com-admin@test.com', is_platform_admin=True))
        self.super_c = auth_client(make_user('com-super@test.com', is_platform_superadmin=True))
        self.owner_c = auth_client(self.owner)


def _announce(client, **over):
    body = {'title': 'Maintenance', 'body': 'Une maintenance aura lieu samedi.', 'audience': 'all', 'level': 'info', **over}
    return client.post(f'{BASE}/announcements/', body, format='json')


class AnnouncementTests(CommBase):
    def test_only_superadmin_creates(self):
        self.assertEqual(_announce(self.admin_c).status_code, 403)
        self.assertEqual(_announce(self.super_c).status_code, 201)
        self.assertEqual(self.admin_c.get(f'{BASE}/announcements/').status_code, 200)

    def test_validation(self):
        for over in ({'title': ''}, {'body': ' '}, {'title': 'x' * 121}, {'body': 'x' * 1001}, {'audience': 'nope'}, {'level': 'danger'}):
            self.assertEqual(_announce(self.super_c, **over).status_code, 400, over)

    def test_vendor_sees_active_announcement_for_all(self):
        _announce(self.super_c)
        titles = [a['title'] for a in self.owner_c.get('/api/support/announcements/').data['results']]
        self.assertEqual(titles, ['Maintenance'])

    def test_audience_is_evaluated_at_read_time(self):
        _announce(self.super_c, title='Pour les abonnés', audience='subscribed')
        _announce(self.super_c, title='Pour les essais', audience='trial')
        titles = [a['title'] for a in self.owner_c.get('/api/support/announcements/').data['results']]
        self.assertEqual(titles, ['Pour les essais'])  # la boutique est en essai
        plan = SubscriptionPlan.objects.create(name='Pro', orders_limit=10, price_monthly=1, price_yearly=1)
        self.store.quota.plan, self.store.quota.period_end = plan, timezone.now() + timedelta(days=10)
        self.store.quota.save()
        titles = [a['title'] for a in self.owner_c.get('/api/support/announcements/').data['results']]
        self.assertEqual(titles, ['Pour les abonnés'])

    def test_deactivated_and_expired_are_hidden(self):
        first = _announce(self.super_c).data['id']
        self.super_c.put(f'{BASE}/announcements/{first}/', {'is_active': False}, format='json')
        expired = _announce(self.super_c, title='Ancienne').data['id']
        PlatformAnnouncement.objects.filter(pk=expired).update(ends_at=timezone.now() - timedelta(hours=1))
        self.assertEqual(self.owner_c.get('/api/support/announcements/').data['results'], [])

    def test_body_is_stored_as_plain_text(self):
        _announce(self.super_c, body='<script>alert(1)</script>')
        row = self.owner_c.get('/api/support/announcements/').data['results'][0]
        self.assertEqual(row['body'], '<script>alert(1)</script>')  # renvoyé tel quel : le front l'affiche en texte brut

    def test_email_requires_confirmed_count(self):
        _, other = make_owner()
        preview = self.super_c.post(f'{BASE}/announcements/preview/', {'audience': 'all'}, format='json').data
        self.assertEqual(preview['emails'], 2)
        resp = _announce(self.super_c, send_email=True, confirm_count=1)
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.data['count'], 2)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(PlatformAnnouncement.objects.count(), 0)
        ok = _announce(self.super_c, send_email=True, confirm_count=2)
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(ok.data['emailed_count'], 2)
        self.assertEqual(len(mail.outbox), 2)

    def test_suspended_stores_never_receive_email(self):
        _, other = make_owner()
        other.is_active = False
        other.save()
        preview = self.super_c.post(f'{BASE}/announcements/preview/', {'audience': 'all'}, format='json').data
        self.assertEqual(preview['emails'], 1)

    def test_creation_is_audited(self):
        _announce(self.super_c)
        self.assertTrue(AuditLog.objects.filter(action='platform.announcement_created', store__isnull=True).exists())

    def test_non_admin_cannot_manage(self):
        self.assertEqual(self.owner_c.get(f'{BASE}/announcements/').status_code, 403)
        self.assertEqual(self.owner_c.post(f'{BASE}/announcements/preview/', {'audience': 'all'}, format='json').status_code, 403)


class ContactTests(CommBase):
    def test_vendor_sends_message_attached_to_store(self):
        resp = self.owner_c.post('/api/support/contact/', {'subject': 'Problème', 'body': 'Mon paiement échoue.'}, format='json')
        self.assertEqual(resp.status_code, 201)
        msg = ContactMessage.objects.get()
        self.assertEqual(msg.store, self.store)
        self.assertEqual(msg.user, self.owner)

    def test_validation_and_roles(self):
        self.assertEqual(self.owner_c.post('/api/support/contact/', {'subject': '', 'body': 'x'}, format='json').status_code, 400)
        self.assertEqual(self.owner_c.post('/api/support/contact/', {'subject': 'x', 'body': 'y' * 2001}, format='json').status_code, 400)
        conf, _ = make_team_member(self.store, 'confirmateur')
        self.assertEqual(auth_client(conf).post('/api/support/contact/', {'subject': 'x', 'body': 'y'}, format='json').status_code, 403)

    def test_rate_limited(self):
        for _ in range(5):
            self.owner_c.post('/api/support/contact/', {'subject': 's', 'body': 'b'}, format='json')
        self.assertEqual(self.owner_c.post('/api/support/contact/', {'subject': 's', 'body': 'b'}, format='json').status_code, 429)

    def test_admin_inbox_hides_body_in_list_and_marks_read_on_open(self):
        self.owner_c.post('/api/support/contact/', {'subject': 'Problème', 'body': 'Texte privé.'}, format='json')
        data = self.admin_c.get(f'{BASE}/contact/').data
        self.assertEqual(data['new_count'], 1)
        self.assertNotIn('body', data['results'][0])
        msg_id = data['results'][0]['id']
        detail = self.admin_c.get(f'{BASE}/contact/{msg_id}/').data
        self.assertEqual(detail['body'], 'Texte privé.')
        self.assertEqual(self.admin_c.get(f'{BASE}/contact/').data['new_count'], 0)

    def test_status_update_and_filters(self):
        self.owner_c.post('/api/support/contact/', {'subject': 'A', 'body': 'b'}, format='json')
        msg_id = ContactMessage.objects.get().id
        self.assertEqual(self.admin_c.put(f'{BASE}/contact/{msg_id}/', {'status': 'bad'}, format='json').status_code, 400)
        self.admin_c.put(f'{BASE}/contact/{msg_id}/', {'status': 'handled'}, format='json')
        self.assertEqual(self.admin_c.get(f'{BASE}/contact/?status=new').data['count'], 0)
        self.assertEqual(self.admin_c.get(f'{BASE}/contact/?status=handled').data['count'], 1)

    def test_vendor_cannot_read_admin_inbox(self):
        self.assertEqual(self.owner_c.get(f'{BASE}/contact/').status_code, 403)

    def test_unread_messages_feed_the_overview_alerts(self):
        from .overview import compute_overview
        self.owner_c.post('/api/support/contact/', {'subject': 'A', 'body': 'b'}, format='json')
        self.assertEqual(compute_overview()['alerts']['unread_messages']['count'], 1)


class IntegrationsTests(CommBase):
    def test_account_integrations_never_expose_secrets(self):
        CarrierAccount.objects.create(store=self.store, carrier='yalidine', api_id='ID-PUBLIC', api_token='SUPER-SECRET-TOKEN', is_default=True)
        ChannelConnection.objects.create(store=self.store, channel='shopify', access_token='shpat_SECRET')
        WebhookEndpoint.objects.create(store=self.store, url='https://example.com/hook', consecutive_failures=3)
        resp = self.admin_c.get(f'{BASE}/accounts/{self.store.id}/integrations/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['carriers'][0]['carrier'], 'yalidine')
        self.assertTrue(resp.data['carriers'][0]['configured'])
        self.assertEqual(resp.data['webhooks'], {'total': 1, 'active': 1, 'failing': 1})
        body = str(resp.data)
        for secret in ('SUPER-SECRET-TOKEN', 'shpat_SECRET', 'ID-PUBLIC'):
            self.assertNotIn(secret, body)

    def test_overview_counts_stores_per_carrier(self):
        _, other = make_owner()
        CarrierAccount.objects.create(store=self.store, carrier='yalidine', api_token='a')
        CarrierAccount.objects.create(store=other, carrier='yalidine', api_token='b', is_active=False)
        CarrierAccount.objects.create(store=other, carrier='noest', api_token='c')
        rows = {r['carrier']: r for r in self.admin_c.get(f'{BASE}/integrations/').data['carriers']}
        self.assertEqual(rows['yalidine']['stores'], 2)
        self.assertEqual(rows['yalidine']['active'], 1)
        self.assertEqual(rows['noest']['stores'], 1)

    def test_rights_and_unknown_store(self):
        self.assertEqual(self.owner_c.get(f'{BASE}/integrations/').status_code, 403)
        self.assertEqual(self.owner_c.get(f'{BASE}/accounts/{self.store.id}/integrations/').status_code, 403)
        self.assertEqual(self.admin_c.get(f'{BASE}/accounts/999999/integrations/').status_code, 404)
