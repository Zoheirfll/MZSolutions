from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import FailedLoginAttempt, LoginHistory, User
from audit.models import AuditLog
from core.test_utils import make_owner, make_team_member, auth_client, clear_throttle_cache
from .tests import make_user

BASE = '/api/platform-admin'


class UsersBase(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.admin = make_user('usr-admin@test.com', is_platform_admin=True)
        self.admin_c = auth_client(self.admin)


class UserListTests(UsersBase):
    def test_non_admin_forbidden(self):
        self.assertEqual(auth_client(self.owner).get(f'{BASE}/users/').status_code, 403)

    def test_lists_roles_and_store(self):
        member_user, member = make_team_member(self.store, 'confirmateur')
        rows = {r['email']: r for r in self.admin_c.get(f'{BASE}/users/').data['results']}
        self.assertEqual(rows[self.owner.email]['role'], 'owner')
        self.assertEqual(rows[self.owner.email]['store_name'], self.store.name)
        self.assertEqual(rows[member_user.email]['role'], 'team')
        self.assertEqual(rows[member_user.email]['team_role'], 'confirmateur')
        self.assertEqual(rows[self.admin.email]['role'], 'admin_platform')

    def test_filters(self):
        make_team_member(self.store, 'confirmateur')
        svc = make_user('svc-u@test.com', is_service_admin=True)
        self.owner.is_active = False
        self.owner.save()
        ids = lambda q: {r['id'] for r in self.admin_c.get(f'{BASE}/users/?{q}').data['results']}
        self.assertEqual(ids('role=owner'), {self.owner.id})
        self.assertEqual(ids('role=service'), {svc.id})
        self.assertEqual(ids('role=platform'), {self.admin.id})
        self.assertIn(self.owner.id, ids('active=0'))
        self.assertNotIn(self.owner.id, ids('active=1'))
        self.assertEqual(ids(f'search={self.owner.email}'), {self.owner.id})


class UserDetailTests(UsersBase):
    def test_detail_with_history_attempts_and_sessions(self):
        LoginHistory.objects.create(user=self.owner, ip_address='10.0.0.1', status='login', user_agent='UA')
        FailedLoginAttempt.objects.create(email=self.owner.email.lower(), ip_address='10.0.0.9')
        RefreshToken.for_user(self.owner)
        data = self.admin_c.get(f'{BASE}/users/{self.owner.id}/').data
        self.assertEqual(data['login_history'][0]['ip_address'], '10.0.0.1')
        self.assertEqual(data['failed_attempts_24h'], 1)
        self.assertEqual(data['active_sessions'], 1)
        self.assertNotIn('password', str(data))

    def test_404(self):
        self.assertEqual(self.admin_c.get(f'{BASE}/users/999999/').status_code, 404)


class DeactivateTests(UsersBase):
    def test_deactivate_requires_reason_and_revokes_sessions(self):
        RefreshToken.for_user(self.owner)
        self.assertEqual(self.admin_c.post(f'{BASE}/users/{self.owner.id}/deactivate/', {'reason': ' '}, format='json').status_code, 400)
        resp = self.admin_c.post(f'{BASE}/users/{self.owner.id}/deactivate/', {'reason': 'Compte compromis'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['revoked'], 1)
        self.owner.refresh_from_db()
        self.assertFalse(self.owner.is_active)
        self.assertTrue(AuditLog.objects.filter(action='platform.user_deactivated', store=self.store).exists())

    def test_reactivate(self):
        self.admin_c.post(f'{BASE}/users/{self.owner.id}/deactivate/', {'reason': 'Compte compromis'}, format='json')
        self.assertEqual(self.admin_c.post(f'{BASE}/users/{self.owner.id}/reactivate/').status_code, 200)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.is_active)
        self.assertEqual(self.admin_c.post(f'{BASE}/users/{self.owner.id}/reactivate/').status_code, 400)

    def test_guards_self_and_admin_accounts(self):
        other_admin = make_user('usr-admin2@test.com', is_platform_admin=True)
        svc = make_user('svc-u2@test.com', is_service_admin=True)
        for target in (self.admin, other_admin, svc):
            resp = self.admin_c.post(f'{BASE}/users/{target.id}/deactivate/', {'reason': 'Test de garde'}, format='json')
            self.assertEqual(resp.status_code, 400, target.email)
            target.refresh_from_db()
            self.assertTrue(target.is_active)

    def test_non_admin_cannot_deactivate(self):
        _, other = make_owner()
        resp = auth_client(self.owner).post(f'{BASE}/users/{other.owner_id}/deactivate/', {'reason': 'Test de droits'}, format='json')
        self.assertEqual(resp.status_code, 403)


class FailedLoginTests(UsersBase):
    def test_failed_login_is_recorded_without_the_password(self):
        resp = self.client.post('/api/auth/login/', {'email': 'Nobody@Test.com', 'password': 'Secret-pass-123'}, content_type='application/json',
                                REMOTE_ADDR='203.0.113.7')
        self.assertEqual(resp.status_code, 400)
        attempt = FailedLoginAttempt.objects.get()
        self.assertEqual(attempt.email, 'nobody@test.com')
        self.assertEqual(attempt.ip_address, '203.0.113.7')
        self.assertEqual(attempt.reason, 'bad_credentials')
        self.assertNotIn('Secret-pass-123', str(attempt.__dict__))

    def test_successful_login_records_nothing(self):
        self.owner.set_password('TestPass123')
        self.owner.is_email_verified = True
        self.owner.save()
        self.client.post('/api/auth/login/', {'email': self.owner.email, 'password': 'TestPass123'}, content_type='application/json')
        self.assertEqual(FailedLoginAttempt.objects.count(), 0)

    def test_suspended_store_attempt_has_its_own_reason(self):
        self.owner.set_password('TestPass123')
        self.owner.is_email_verified = True
        self.owner.save()
        self.store.is_active = False
        self.store.save()
        self.client.post('/api/auth/login/', {'email': self.owner.email, 'password': 'TestPass123'}, content_type='application/json')
        self.assertEqual(FailedLoginAttempt.objects.get().reason, 'suspended')

    def test_admin_lists_attempts_with_summary_and_filters(self):
        for ip in ('10.0.0.1', '10.0.0.1', '10.0.0.2'):
            FailedLoginAttempt.objects.create(email='x@test.com', ip_address=ip)
        FailedLoginAttempt.objects.create(email='y@test.com', ip_address='10.0.0.3', reason='suspended')
        old = FailedLoginAttempt.objects.create(email='old@test.com', ip_address='10.0.0.4')
        FailedLoginAttempt.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=3))
        data = self.admin_c.get(f'{BASE}/login-attempts/').data
        self.assertEqual(data['summary']['failed_24h'], 4)
        self.assertEqual(data['summary']['distinct_ips_24h'], 3)
        self.assertEqual(data['summary']['top_ips'][0], {'ip_address': '10.0.0.1', 'count': 2})
        self.assertEqual(self.admin_c.get(f'{BASE}/login-attempts/?reason=suspended').data['count'], 1)
        self.assertEqual(self.admin_c.get(f'{BASE}/login-attempts/?email=old@').data['count'], 1)
        self.assertEqual(self.admin_c.get(f'{BASE}/login-attempts/?ip=not-an-ip').data['count'], 0)

    def test_non_admin_forbidden(self):
        self.assertEqual(auth_client(self.owner).get(f'{BASE}/login-attempts/').status_code, 403)

    def test_purge_command_removes_old_data_only(self):
        from django.core.management import call_command
        recent = FailedLoginAttempt.objects.create(email='r@test.com')
        old = FailedLoginAttempt.objects.create(email='o@test.com')
        FailedLoginAttempt.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=120))
        call_command('purge_old_login_data')
        self.assertTrue(FailedLoginAttempt.objects.filter(pk=recent.pk).exists())
        self.assertFalse(FailedLoginAttempt.objects.filter(pk=old.pk).exists())
