from django.test import TestCase

from accounts.models import User
from core.test_utils import make_owner, auth_client, clear_throttle_cache
from orders.models import Order
from .models import PlatformConfirmationAccount, PlatformConfirmateur, PlatformConfirmateurAssignment, PlatformOrderAssignment
from .routing import route_order


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


def make_active_confirmateur(store, account):
    """Confirmateur du superadmin, compte activé, assigné et actif sur `account`."""
    user = User.objects.create_user(email=f"pc{PlatformConfirmateur.objects.count()}@confirm.test",
                                     password='TestPass123', is_active=True, is_email_verified=True)
    confirmateur = PlatformConfirmateur.objects.create(
        user=user, first_name='Sara', last_name='Benali', email=user.email, is_active=True,
    )
    PlatformConfirmateurAssignment.objects.create(confirmateur=confirmateur, account=account, is_active=True)
    return confirmateur


class RoutingTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()

    def _make_order(self):
        return Order.objects.create(store=self.store, first_name='Client', phone='0555000000', wilaya='Alger')

    def test_no_account_does_not_skip_internal(self):
        order = self._make_order()
        self.assertFalse(route_order(order))
        self.assertFalse(PlatformOrderAssignment.objects.filter(order=order).exists())

    def test_inactive_account_does_not_skip_internal(self):
        PlatformConfirmationAccount.objects.create(store=self.store, is_active=False)
        order = self._make_order()
        self.assertFalse(route_order(order))

    def test_active_replace_mode_skips_internal_and_assigns(self):
        account = PlatformConfirmationAccount.objects.create(store=self.store, is_active=True, mode='replace')
        confirmateur = make_active_confirmateur(self.store, account)
        order = self._make_order()
        self.assertTrue(route_order(order))
        assignment = PlatformOrderAssignment.objects.get(order=order)
        self.assertEqual(assignment.confirmateur, confirmateur)

    def test_active_augment_mode_does_not_skip_internal_but_still_assigns(self):
        account = PlatformConfirmationAccount.objects.create(store=self.store, is_active=True, mode='augment')
        confirmateur = make_active_confirmateur(self.store, account)
        order = self._make_order()
        self.assertFalse(route_order(order))
        self.assertTrue(PlatformOrderAssignment.objects.filter(order=order, confirmateur=confirmateur).exists())

    def test_round_robin_alternates_between_two_confirmateurs(self):
        account = PlatformConfirmationAccount.objects.create(store=self.store, is_active=True, mode='replace')
        c1 = make_active_confirmateur(self.store, account)
        c2 = make_active_confirmateur(self.store, account)
        o1, o2, o3 = self._make_order(), self._make_order(), self._make_order()
        route_order(o1)
        route_order(o2)
        route_order(o3)
        chosen = [PlatformOrderAssignment.objects.get(order=o).confirmateur_id for o in (o1, o2, o3)]
        self.assertEqual(chosen[0], chosen[2])
        self.assertNotEqual(chosen[0], chosen[1])

    def test_no_active_candidate_leaves_order_unassigned(self):
        account = PlatformConfirmationAccount.objects.create(store=self.store, is_active=True, mode='replace')
        confirmateur = make_active_confirmateur(self.store, account)
        PlatformConfirmateurAssignment.objects.filter(confirmateur=confirmateur, account=account).update(is_active=False)
        order = self._make_order()
        self.assertTrue(route_order(order))
        self.assertFalse(PlatformOrderAssignment.objects.filter(order=order).exists())

    def test_full_order_creation_flow_skips_internal_assignment(self):
        """Bout en bout via l'endpoint réel de création de commande dashboard —
        vérifie le branchement dans orders/views.py, pas seulement route_order()
        en isolation."""
        from team.models import TeamMember
        internal_confirmateur_user = User.objects.create_user(
            email='internal@confirm.test', password='TestPass123', is_active=True, is_email_verified=True,
        )
        from django.utils import timezone
        TeamMember.objects.create(
            store=self.store, user=internal_confirmateur_user, role='confirmateur',
            first_name='Interne', last_name='Test', email='internal@confirm.test', is_active=True,
            is_online=True, last_seen_at=timezone.now(),
        )
        account = PlatformConfirmationAccount.objects.create(store=self.store, is_active=True, mode='replace')
        platform_confirmateur = make_active_confirmateur(self.store, account)

        from products.models import Product
        product = Product.objects.create(store=self.store, name='Test Produit', price=1000, stock=10)

        client = auth_client(self.owner)
        resp = client.post('/api/orders/', {
            'first_name': 'Client', 'last_name': 'Test', 'phone': '0555111111', 'wilaya': 'Alger',
            'items': [{'product': product.id, 'quantity': 1}],
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        order = Order.objects.get(pk=resp.data['id'])
        self.assertFalse(hasattr(order, 'assignment'))
        self.assertEqual(order.platform_assignment.confirmateur, platform_confirmateur)


class MyQueueTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.account = PlatformConfirmationAccount.objects.create(store=self.store, is_active=True, mode='replace')
        self.confirmateur = make_active_confirmateur(self.store, self.account)
        self.order = Order.objects.create(store=self.store, first_name='Client', phone='0555222222', wilaya='Alger')
        PlatformOrderAssignment.objects.create(order=self.order, confirmateur=self.confirmateur)

    def test_confirmateur_sees_only_own_orders(self):
        other_order = Order.objects.create(store=self.store, first_name='Other', phone='0555333333', wilaya='Blida')
        client = auth_client(self.confirmateur.user)
        resp = client.get('/api/platform-admin/my-queue/')
        self.assertEqual(resp.status_code, 200)
        ids = [o['id'] for o in resp.data['results']]
        self.assertIn(self.order.id, ids)
        self.assertNotIn(other_order.id, ids)

    def test_non_confirmateur_forbidden(self):
        client = auth_client(self.owner)
        resp = client.get('/api/platform-admin/my-queue/')
        self.assertEqual(resp.status_code, 403)

    def test_deactivated_confirmateur_loses_access(self):
        self.confirmateur.is_active = False
        self.confirmateur.save(update_fields=['is_active'])
        client = auth_client(self.confirmateur.user)
        resp = client.get('/api/platform-admin/my-queue/')
        self.assertEqual(resp.status_code, 403)

    def test_can_change_status_of_own_order(self):
        client = auth_client(self.confirmateur.user)
        resp = client.post(f'/api/platform-admin/my-queue/{self.order.id}/status/', {'status': 'confirmed'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'confirmed')

    def test_cannot_change_status_of_unassigned_order(self):
        other_order = Order.objects.create(store=self.store, first_name='Other', phone='0555444444', wilaya='Blida')
        client = auth_client(self.confirmateur.user)
        resp = client.post(f'/api/platform-admin/my-queue/{other_order.id}/status/', {'status': 'confirmed'}, format='json')
        self.assertEqual(resp.status_code, 404)
        other_order.refresh_from_db()
        self.assertEqual(other_order.status, 'pending')
