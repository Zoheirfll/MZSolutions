import json

from django.test import TestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import FailedLoginAttempt, LoginHistory, User
from audit.models import AuditLog
from core.test_utils import make_owner, make_team_member, auth_client, clear_throttle_cache
from orders.models import Order
from .communication_models import ContactMessage
from .tests import make_user

BASE = '/api/platform-admin'


class StoreAdminBase(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.super_c = auth_client(make_user('sa-super@test.com', is_platform_superadmin=True))
        self.admin_c = auth_client(make_user('sa-admin@test.com', is_platform_admin=True))
        self.url = f'{BASE}/accounts/{self.store.id}'


class EditTests(StoreAdminBase):
    def test_only_superadmin(self):
        self.assertEqual(self.admin_c.put(f'{self.url}/edit/', {'name': 'X'}, format='json').status_code, 403)

    def test_edit_fields_and_audit_without_description_content(self):
        resp = self.super_c.put(f'{self.url}/edit/', {'name': 'Nouveau nom', 'phone': '0555', 'description': 'Texte secret'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.store.refresh_from_db()
        self.assertEqual((self.store.name, self.store.phone), ('Nouveau nom', '0555'))
        entry = AuditLog.objects.get(action='platform.store_edited')
        self.assertNotIn('Texte secret', str(entry.metadata))

    def test_slug_is_normalised_and_must_be_unique(self):
        _, other = make_owner()
        self.assertEqual(self.super_c.put(f'{self.url}/edit/', {'slug': other.slug}, format='json').status_code, 409)
        self.super_c.put(f'{self.url}/edit/', {'slug': 'Ma Boutique Été!'}, format='json')
        self.store.refresh_from_db()
        self.assertEqual(self.store.slug, 'ma-boutique-ete')

    def test_validation(self):
        for body in ({'name': ' '}, {'email': 'pas-un-email'}, {'slug': '!!!'}, {'phone': 'x' * 21}):
            self.assertEqual(self.super_c.put(f'{self.url}/edit/', body, format='json').status_code, 400, body)


class TransferTests(StoreAdminBase):
    def _transfer(self, email, reason='Rachat de la boutique'):
        return self.super_c.post(f'{self.url}/transfer/', {'new_owner_email': email, 'reason': reason}, format='json')

    def test_transfer_to_a_free_account(self):
        RefreshToken.for_user(self.owner)
        new = make_user('buyer@test.com')
        resp = self._transfer(new.email)
        self.assertEqual(resp.status_code, 200)
        self.store.refresh_from_db()
        self.assertEqual(self.store.owner_id, new.id)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.is_active)
        self.assertTrue(AuditLog.objects.filter(action='platform.store_transferred', store=self.store).exists())

    def test_rejected_targets(self):
        _, other_store = make_owner()
        member_user, _ = make_team_member(self.store, 'confirmateur')
        cases = [other_store.owner.email, member_user.email, make_user('adm@test.com', is_platform_admin=True).email, self.owner.email]
        for email in cases:
            self.assertEqual(self._transfer(email).status_code, 400, email)
        self.assertEqual(self._transfer('inconnu@test.com').status_code, 404)

    def test_reason_required_and_superadmin_only(self):
        new = make_user('buyer2@test.com')
        self.assertEqual(self._transfer(new.email, reason=' ').status_code, 400)
        resp = self.admin_c.post(f'{self.url}/transfer/', {'new_owner_email': new.email, 'reason': 'Rachat de la boutique'}, format='json')
        self.assertEqual(resp.status_code, 403)


class ExportTests(StoreAdminBase):
    def test_export_contains_vendor_data_but_no_end_customer_orders(self):
        Order.objects.create(store=self.store, first_name='ClientFinal', phone='0777000111', wilaya='Alger')
        member_user, _ = make_team_member(self.store, 'confirmateur')
        LoginHistory.objects.create(user=self.owner, ip_address='10.0.0.1', status='login')
        resp = self.super_c.get(f'{self.url}/export/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('attachment', resp['Content-Disposition'])
        data = json.loads(resp.content)
        self.assertEqual(data['owner']['email'], self.owner.email)
        self.assertEqual(data['store']['slug'], self.store.slug)
        self.assertEqual(len(data['team_members']), 1)
        self.assertEqual(data['login_history'][0]['ip_address'], '10.0.0.1')
        self.assertNotIn('ClientFinal', resp.content.decode())
        self.assertNotIn('password', resp.content.decode().lower())

    def test_superadmin_only_and_audited(self):
        self.assertEqual(self.admin_c.get(f'{self.url}/export/').status_code, 403)
        self.super_c.get(f'{self.url}/export/')
        self.assertTrue(AuditLog.objects.filter(action='platform.data_exported', store=self.store).exists())


class AnonymizeTests(StoreAdminBase):
    def _anon(self, **over):
        body = {'confirm': 'ANONYMISER', 'reason': 'Demande du vendeur (Loi 18-07)', **over}
        return self.super_c.post(f'{self.url}/anonymize/', body, format='json')

    def _suspend(self):
        self.store.is_active = False
        self.store.save()

    def test_requires_keyword_reason_and_prior_suspension(self):
        self._suspend()
        self.assertEqual(self._anon(confirm='oui').status_code, 400)
        self.assertEqual(self._anon(reason=' ').status_code, 400)
        self.store.is_active = True
        self.store.save()
        resp = self._anon()
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Suspendez', resp.data['detail'])
        self.owner.refresh_from_db()
        self.assertNotIn('anonymise', self.owner.email)

    def test_superadmin_only(self):
        self._suspend()
        resp = self.admin_c.post(f'{self.url}/anonymize/', {'confirm': 'ANONYMISER', 'reason': 'Demande du vendeur'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_erases_personal_data_but_keeps_sales_history(self):
        member_user, member = make_team_member(self.store, 'confirmateur')
        order = Order.objects.create(store=self.store, first_name='ClientFinal', phone='0777000111', wilaya='Alger')
        LoginHistory.objects.create(user=self.owner, ip_address='10.0.0.1', status='login')
        FailedLoginAttempt.objects.create(email=self.owner.email.lower(), ip_address='10.0.0.2')
        ContactMessage.objects.create(store=self.store, user=self.owner, subject='S', body='B')
        AuditLog.objects.create(store=self.store, actor=self.owner, actor_name='Nom Reel', action='order.created')
        RefreshToken.for_user(self.owner)
        old_email = self.owner.email
        self._suspend()

        resp = self._anon()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['users_anonymized'], 2)

        self.owner.refresh_from_db()
        self.store.refresh_from_db()
        member.refresh_from_db()
        self.assertTrue(self.owner.email.endswith('@anonymise.invalid'))
        self.assertEqual((self.owner.first_name, self.owner.phone), ('Anonyme', ''))
        self.assertFalse(self.owner.is_active)
        self.assertFalse(self.owner.has_usable_password())
        self.assertTrue(member.email.endswith('@anonymise.invalid'))
        self.assertEqual(self.store.slug, f'anonymise-{self.store.id}')
        self.assertEqual(self.store.name, f'Boutique anonymisée {self.store.id}')
        self.assertEqual(LoginHistory.objects.filter(user=self.owner).count(), 0)
        self.assertFalse(FailedLoginAttempt.objects.filter(email=old_email.lower()).exists())
        self.assertFalse(ContactMessage.objects.filter(store=self.store).exists())
        self.assertFalse(AuditLog.objects.filter(actor_name='Nom Reel').exists())
        self.assertTrue(Order.objects.filter(pk=order.pk).exists())  # l'historique de ventes est conservé

    def test_is_not_repeatable_and_final_audit_has_no_pii(self):
        self._suspend()
        self._anon()
        self.assertEqual(self._anon().status_code, 400)
        entry = AuditLog.objects.get(action='platform.store_anonymized')
        self.assertNotIn(self.owner.email, str(entry.metadata) + entry.description)

    def test_refuses_an_administration_account_owner(self):
        self.owner.is_service_admin = True
        self.owner.save()
        self._suspend()
        self.assertEqual(self._anon().status_code, 400)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.first_name, User.objects.get(pk=self.owner.pk).first_name)
        self.assertNotIn('anonymise', self.owner.email)

    def test_edit_and_transfer_are_refused_once_anonymized(self):
        self._suspend()
        self._anon()
        self.assertEqual(self.super_c.put(f'{self.url}/edit/', {'name': 'X'}, format='json').status_code, 400)
        new = make_user('late@test.com')
        resp = self.super_c.post(f'{self.url}/transfer/', {'new_owner_email': new.email, 'reason': 'Trop tard'}, format='json')
        self.assertEqual(resp.status_code, 400)
