from datetime import timedelta
from unittest.mock import patch

from django.core import mail
from django.test import TestCase
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from audit.models import AuditLog
from core.test_utils import make_owner, make_team_member, auth_client, clear_throttle_cache
from stores.models import SubscriptionPlan
from .tests import make_user

BASE = '/api/platform-admin'


class AccountsBase(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.admin = make_user('acc-admin@test.com', is_platform_admin=True)
        self.superadmin = make_user('acc-super@test.com', is_platform_superadmin=True)
        self.admin_c = auth_client(self.admin)
        self.super_c = auth_client(self.superadmin)


class AccountListTests(AccountsBase):
    def test_non_admin_forbidden(self):
        self.assertEqual(auth_client(self.owner).get(f'{BASE}/accounts/').status_code, 403)

    def test_admin_lists_all_stores_with_state(self):
        resp = self.admin_c.get(f'{BASE}/accounts/')
        self.assertEqual(resp.status_code, 200)
        row = resp.data['results'][0]
        self.assertEqual(row['id'], self.store.id)
        self.assertEqual(row['state'], 'trial')
        self.assertEqual(row['owner_email'], self.owner.email)

    def test_filter_by_state_and_search(self):
        _, other = make_owner()
        other.is_active = False
        other.save()
        suspended = self.admin_c.get(f'{BASE}/accounts/?state=suspended').data
        self.assertEqual([r['id'] for r in suspended['results']], [other.id])
        found = self.admin_c.get(f'{BASE}/accounts/?search={self.store.name[:4]}').data
        self.assertIn(self.store.id, [r['id'] for r in found['results']])

    def test_expired_and_subscribed_states(self):
        plan = SubscriptionPlan.objects.create(name='Pro', orders_limit=100, price_monthly=1, price_yearly=1)
        _, paid = make_owner()
        paid.quota.plan = plan
        paid.quota.period_end = timezone.now() + timedelta(days=10)
        paid.quota.save()
        self.store.quota.trial_ends_at = timezone.now() - timedelta(days=1)
        self.store.quota.save()
        states = {r['id']: r['state'] for r in self.admin_c.get(f'{BASE}/accounts/').data['results']}
        self.assertEqual(states[paid.id], 'subscribed')
        self.assertEqual(states[self.store.id], 'expired')


class AccountDetailTests(AccountsBase):
    def test_detail_has_owner_quota_and_counts(self):
        make_team_member(self.store, 'confirmateur')
        resp = self.admin_c.get(f'{BASE}/accounts/{self.store.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['owner']['email'], self.owner.email)
        self.assertEqual(resp.data['counts']['team_members'], 1)
        self.assertIn('quota', resp.data)

    def test_detail_404(self):
        self.assertEqual(self.admin_c.get(f'{BASE}/accounts/999999/').status_code, 404)


class SuspensionTests(AccountsBase):
    def test_reason_is_required(self):
        resp = self.admin_c.post(f'{BASE}/accounts/{self.store.id}/suspend/', {'reason': ' '}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.store.refresh_from_db()
        self.assertTrue(self.store.is_active)

    def test_suspend_blocks_owner_and_team(self):
        member_user, _ = make_team_member(self.store, 'confirmateur')
        self.admin_c.post(f'{BASE}/accounts/{self.store.id}/suspend/', {'reason': 'Impayé répété'}, format='json')
        self.store.refresh_from_db()
        self.assertFalse(self.store.is_active)
        self.assertEqual(self.store.suspension_reason, 'Impayé répété')
        self.assertIsNotNone(self.store.suspended_at)
        self.assertEqual(auth_client(self.owner).get('/api/auth/me/').status_code, 403)
        self.assertEqual(auth_client(self.owner).get('/api/products/').status_code, 403)
        self.assertEqual(auth_client(member_user).get('/api/auth/me/').status_code, 403)

    def test_login_refused_with_code(self):
        self.owner.set_password('TestPass123')
        self.owner.is_email_verified = True
        self.owner.save()
        self.admin_c.post(f'{BASE}/accounts/{self.store.id}/suspend/', {'reason': 'Fraude suspectée'}, format='json')
        resp = self.client.post('/api/auth/login/', {'email': self.owner.email, 'password': 'TestPass123'}, content_type='application/json')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()['code'], 'store_suspended')

    def test_reactivate_restores_access(self):
        self.admin_c.post(f'{BASE}/accounts/{self.store.id}/suspend/', {'reason': 'Test suspension'}, format='json')
        resp = self.admin_c.post(f'{BASE}/accounts/{self.store.id}/reactivate/')
        self.assertEqual(resp.status_code, 200)
        self.store.refresh_from_db()
        self.assertTrue(self.store.is_active)
        self.assertIsNone(self.store.suspended_at)
        self.assertEqual(auth_client(self.owner).get('/api/auth/me/').status_code, 200)

    def test_suspended_storefront_is_unavailable(self):
        self.admin_c.post(f'{BASE}/accounts/{self.store.id}/suspend/', {'reason': 'Test suspension'}, format='json')
        self.assertEqual(self.client.get(f'/api/public/store/{self.store.slug}/').status_code, 404)

    def test_platform_admin_not_blocked_even_if_owning_a_suspended_store(self):
        self.admin_c.post(f'{BASE}/accounts/{self.store.id}/suspend/', {'reason': 'Test suspension'}, format='json')
        self.owner.is_platform_admin = True
        self.owner.save()
        self.assertEqual(auth_client(self.owner).get('/api/auth/me/').status_code, 200)

    def test_suspend_and_reactivate_are_audited(self):
        self.admin_c.post(f'{BASE}/accounts/{self.store.id}/suspend/', {'reason': 'Test suspension'}, format='json')
        self.admin_c.post(f'{BASE}/accounts/{self.store.id}/reactivate/')
        actions = list(AuditLog.objects.filter(store=self.store).values_list('action', flat=True))
        self.assertIn('platform.store_suspended', actions)
        self.assertIn('platform.store_reactivated', actions)

    def test_cannot_suspend_twice(self):
        self.admin_c.post(f'{BASE}/accounts/{self.store.id}/suspend/', {'reason': 'Test suspension'}, format='json')
        resp = self.admin_c.post(f'{BASE}/accounts/{self.store.id}/suspend/', {'reason': 'Encore une fois'}, format='json')
        self.assertEqual(resp.status_code, 400)


class ForceLogoutAndResetTests(AccountsBase):
    def test_force_logout_blacklists_refresh_tokens(self):
        RefreshToken.for_user(self.owner)
        RefreshToken.for_user(self.owner)
        resp = self.admin_c.post(f'{BASE}/accounts/{self.store.id}/force-logout/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['revoked'], 2)
        self.assertEqual(BlacklistedToken.objects.filter(token__user=self.owner).count(), 2)

    def test_force_logout_is_idempotent(self):
        RefreshToken.for_user(self.owner)
        self.admin_c.post(f'{BASE}/accounts/{self.store.id}/force-logout/')
        resp = self.admin_c.post(f'{BASE}/accounts/{self.store.id}/force-logout/')
        self.assertEqual(resp.data['revoked'], 0)

    def test_reset_password_sends_link_without_exposing_it(self):
        resp = self.admin_c.post(f'{BASE}/accounts/{self.store.id}/reset-password/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.owner.email])
        self.assertNotIn('reset-password', str(resp.data))

    def test_non_admin_cannot_use_actions(self):
        c = auth_client(self.owner)
        for path in ('suspend', 'reactivate', 'force-logout', 'reset-password'):
            self.assertEqual(c.post(f'{BASE}/accounts/{self.store.id}/{path}/', {'reason': 'xxxxx'}, format='json').status_code, 403)


class AdminManagementTests(AccountsBase):
    def test_admin_cannot_manage_admins(self):
        self.assertEqual(self.admin_c.get(f'{BASE}/admins/').status_code, 403)
        resp = self.admin_c.post(f'{BASE}/admins/', {'email': 'n@test.com', 'first_name': 'N', 'last_name': 'X', 'level': 'admin'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_superadmin_lists_admins(self):
        resp = self.super_c.get(f'{BASE}/admins/')
        self.assertEqual(resp.status_code, 200)
        emails = [r['email'] for r in resp.data['results']]
        self.assertIn(self.admin.email, emails)
        self.assertIn(self.superadmin.email, emails)

    def test_create_admin_sends_set_password_link(self):
        resp = self.super_c.post(f'{BASE}/admins/', {'email': 'new-admin@test.com', 'first_name': 'N', 'last_name': 'A', 'level': 'admin'}, format='json')
        self.assertEqual(resp.status_code, 201)
        user = User.objects.get(email='new-admin@test.com')
        self.assertTrue(user.is_platform_admin)
        self.assertFalse(user.is_platform_superadmin)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(len(mail.outbox), 1)
        # Le lien est aussi renvoyé au superadmin (au cas où l'adresse ne reçoit pas de courrier)
        self.assertIn('/reset-password?uid=', resp.data['activation_link'])
        self.assertIn(resp.data['activation_link'].split('&token=')[1], mail.outbox[0].body)

    def test_activation_link_lets_the_new_admin_set_a_password(self):
        resp = self.super_c.post(f'{BASE}/admins/', {'email': 'link@test.com', 'first_name': 'L', 'last_name': 'K', 'level': 'admin'}, format='json')
        link = resp.data['activation_link']
        uid = link.split('uid=')[1].split('&')[0]
        token = link.split('token=')[1]
        done = self.client.post('/api/auth/password-reset/confirm/', {'uid': uid, 'token': token, 'new_password': 'Nouveau-Mdp-123!'}, content_type='application/json')
        self.assertEqual(done.status_code, 200)
        self.assertTrue(User.objects.get(email='link@test.com').check_password('Nouveau-Mdp-123!'))

    def test_create_with_existing_email_conflicts(self):
        resp = self.super_c.post(f'{BASE}/admins/', {'email': self.owner.email, 'first_name': 'N', 'last_name': 'A', 'level': 'admin'}, format='json')
        self.assertEqual(resp.status_code, 409)

    def test_invalid_level_rejected(self):
        resp = self.super_c.post(f'{BASE}/admins/', {'email': 'x@test.com', 'first_name': 'N', 'last_name': 'A', 'level': 'root'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_change_level_and_revoke(self):
        resp = self.super_c.put(f'{BASE}/admins/{self.admin.id}/', {'level': 'superadmin'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_platform_superadmin)
        resp = self.super_c.delete(f'{BASE}/admins/{self.admin.id}/')
        self.assertEqual(resp.status_code, 200)
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.is_platform_admin or self.admin.is_platform_superadmin)

    def test_cannot_modify_self(self):
        self.assertEqual(self.super_c.put(f'{BASE}/admins/{self.superadmin.id}/', {'level': 'admin'}, format='json').status_code, 400)
        self.assertEqual(self.super_c.delete(f'{BASE}/admins/{self.superadmin.id}/').status_code, 400)

    def test_cannot_revoke_last_superadmin(self):
        other = make_user('acc-super2@test.com', is_platform_superadmin=True)
        self.super_c.delete(f'{BASE}/admins/{other.id}/')  # il reste self.superadmin seul
        solo = auth_client(other)  # other n'est plus admin
        self.assertEqual(solo.get(f'{BASE}/admins/').status_code, 403)
        self.assertTrue(User.objects.filter(is_platform_superadmin=True).count() >= 1)

    def test_admin_actions_are_audited_without_store(self):
        self.super_c.post(f'{BASE}/admins/', {'email': 'aud@test.com', 'first_name': 'A', 'last_name': 'B', 'level': 'admin'}, format='json')
        self.assertTrue(AuditLog.objects.filter(action='platform.admin_created', store__isnull=True).exists())


class DjangoAdminFlagTests(TestCase):
    def test_me_exposes_is_django_admin_only_for_staff(self):
        staff = make_user('staff@test.com', is_staff=True)
        regular = make_user('regular@test.com')
        self.assertTrue(auth_client(staff).get('/api/auth/me/').data['is_django_admin'])
        self.assertFalse(auth_client(regular).get('/api/auth/me/').data['is_django_admin'])
