from django.test import TestCase

from core.test_utils import make_owner, auth_client, clear_throttle_cache
from .models import PlatformConfirmationAccount, PlatformConfirmateur, PlatformConfirmateurAssignment


def make_platform_admin():
    owner, _ = make_owner()  # réutilise le helper, mais sans se servir du Store créé
    owner.is_platform_admin = True
    owner.save(update_fields=['is_platform_admin'])
    return owner


class AccessControlTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.admin = make_platform_admin()

    def test_regular_owner_cannot_list_stores(self):
        client = auth_client(self.owner)
        resp = client.get('/api/platform-admin/stores/')
        self.assertEqual(resp.status_code, 403)

    def test_platform_admin_can_list_stores(self):
        client = auth_client(self.admin)
        resp = client.get('/api/platform-admin/stores/')
        self.assertEqual(resp.status_code, 200)
        names = [r['name'] for r in resp.data['results']]
        self.assertIn(self.store.name, names)

    def test_unauthenticated_blocked(self):
        from rest_framework.test import APIClient
        resp = APIClient().get('/api/platform-admin/stores/')
        self.assertEqual(resp.status_code, 401)


class ToggleTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.admin = make_platform_admin()
        self.client_admin = auth_client(self.admin)

    def test_toggle_creates_account_and_sets_activated_at(self):
        resp = self.client_admin.post(f'/api/platform-admin/stores/{self.store.id}/toggle/', {'is_active': True}, format='json')
        self.assertEqual(resp.status_code, 200)
        account = PlatformConfirmationAccount.objects.get(store=self.store)
        self.assertTrue(account.is_active)
        self.assertIsNotNone(account.activated_at)
        self.assertEqual(account.mode, 'replace')

    def test_mode_switchable_to_augment(self):
        self.client_admin.post(f'/api/platform-admin/stores/{self.store.id}/toggle/', {'is_active': True}, format='json')
        resp = self.client_admin.post(f'/api/platform-admin/stores/{self.store.id}/toggle/', {'mode': 'augment'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['mode'], 'augment')

    def test_invalid_mode_rejected(self):
        resp = self.client_admin.post(f'/api/platform-admin/stores/{self.store.id}/toggle/', {'mode': 'bogus'}, format='json')
        self.assertEqual(resp.status_code, 400)


class OrdersProductsVisibilityTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.admin = make_platform_admin()
        self.client_admin = auth_client(self.admin)

    def test_orders_hidden_when_service_inactive(self):
        resp = self.client_admin.get(f'/api/platform-admin/stores/{self.store.id}/orders/')
        self.assertEqual(resp.status_code, 404)

    def test_products_hidden_when_service_inactive(self):
        resp = self.client_admin.get(f'/api/platform-admin/stores/{self.store.id}/products/')
        self.assertEqual(resp.status_code, 404)

    def test_orders_visible_once_activated(self):
        self.client_admin.post(f'/api/platform-admin/stores/{self.store.id}/toggle/', {'is_active': True}, format='json')
        resp = self.client_admin.get(f'/api/platform-admin/stores/{self.store.id}/orders/')
        self.assertEqual(resp.status_code, 200)

    def test_orders_hidden_again_after_deactivation(self):
        self.client_admin.post(f'/api/platform-admin/stores/{self.store.id}/toggle/', {'is_active': True}, format='json')
        self.client_admin.post(f'/api/platform-admin/stores/{self.store.id}/toggle/', {'is_active': False}, format='json')
        resp = self.client_admin.get(f'/api/platform-admin/stores/{self.store.id}/orders/')
        self.assertEqual(resp.status_code, 404)


class ConfirmateurInviteTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.admin = make_platform_admin()
        self.client_admin = auth_client(self.admin)

    def test_invite_creates_unactivated_confirmateur(self):
        resp = self.client_admin.post('/api/platform-admin/confirmateurs/', {
            'first_name': 'Sara', 'last_name': 'Benali', 'email': 'sara@confirm.test',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        confirmateur = PlatformConfirmateur.objects.get(email='sara@confirm.test')
        self.assertIsNone(confirmateur.user_id)
        self.assertTrue(confirmateur.is_active)

    def test_duplicate_email_rejected(self):
        self.client_admin.post('/api/platform-admin/confirmateurs/', {
            'first_name': 'Sara', 'last_name': 'Benali', 'email': 'sara@confirm.test',
        }, format='json')
        resp = self.client_admin.post('/api/platform-admin/confirmateurs/', {
            'first_name': 'Sara2', 'last_name': 'Benali2', 'email': 'sara@confirm.test',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_accept_invitation_creates_login_account(self):
        confirmateur = PlatformConfirmateur.objects.create(first_name='Sara', last_name='Benali', email='sara2@confirm.test')
        resp = self.client_admin.post('/api/platform-admin/accept-invitation/', {
            'token': confirmateur.invite_token, 'password': 'SecurePass123',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        confirmateur.refresh_from_db()
        self.assertIsNotNone(confirmateur.user_id)
        self.assertIsNotNone(confirmateur.activated_at)

    def test_non_admin_cannot_invite(self):
        client = auth_client(self.owner)
        resp = client.post('/api/platform-admin/confirmateurs/', {
            'first_name': 'X', 'last_name': 'Y', 'email': 'x@confirm.test',
        }, format='json')
        self.assertEqual(resp.status_code, 403)


class AssignmentTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.admin = make_platform_admin()
        self.client_admin = auth_client(self.admin)
        self.account = PlatformConfirmationAccount.objects.create(store=self.store, is_active=True)
        self.confirmateur = PlatformConfirmateur.objects.create(first_name='Sara', last_name='Benali', email='sara3@confirm.test')

    def test_assign_confirmateur_to_store(self):
        resp = self.client_admin.post('/api/platform-admin/assignments/', {
            'confirmateur': self.confirmateur.id, 'account': self.account.id,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        assignment = PlatformConfirmateurAssignment.objects.get(confirmateur=self.confirmateur, account=self.account)
        self.assertTrue(assignment.is_active)

    def test_toggle_assignment_off(self):
        assignment = PlatformConfirmateurAssignment.objects.create(confirmateur=self.confirmateur, account=self.account)
        resp = self.client_admin.put(f'/api/platform-admin/assignments/{assignment.id}/', {'is_active': False}, format='json')
        self.assertEqual(resp.status_code, 200)
        assignment.refresh_from_db()
        self.assertFalse(assignment.is_active)

    def test_upsert_does_not_duplicate(self):
        self.client_admin.post('/api/platform-admin/assignments/', {
            'confirmateur': self.confirmateur.id, 'account': self.account.id,
        }, format='json')
        self.client_admin.post('/api/platform-admin/assignments/', {
            'confirmateur': self.confirmateur.id, 'account': self.account.id, 'is_active': False,
        }, format='json')
        self.assertEqual(
            PlatformConfirmateurAssignment.objects.filter(confirmateur=self.confirmateur, account=self.account).count(),
            1,
        )
