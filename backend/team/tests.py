from django.core import mail
from django.test import TestCase

from .models import TeamMember, RolePermission, PERMISSION_CATALOG
from core.test_utils import make_owner, make_team_member, auth_client


class InviteTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_owner_can_invite_member(self):
        client = auth_client(self.owner)
        resp = client.post('/api/team/invite/', {
            'role': 'confirmateur', 'first_name': 'C', 'last_name': 'F', 'email': 'newconf@test.com',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(TeamMember.objects.filter(email='newconf@test.com', store=self.store).exists())
        self.assertEqual(len(mail.outbox), 1)

    def test_invite_rejects_existing_email(self):
        _, _ = make_owner(email='taken@test.com')
        client = auth_client(self.owner)
        resp = client.post('/api/team/invite/', {
            'role': 'confirmateur', 'first_name': 'C', 'last_name': 'F', 'email': 'taken@test.com',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_confirmateur_cannot_invite(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.post('/api/team/invite/', {
            'role': 'confirmateur', 'first_name': 'X', 'last_name': 'Y', 'email': 'x@test.com',
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_accept_invitation_activates_account(self):
        member = TeamMember.objects.create(
            store=self.store, role='confirmateur', first_name='C', last_name='F', email='accept@test.com',
        )
        resp = self.client.post('/api/team/accept-invitation/', {
            'token': member.invite_token, 'password': 'NewPass1234',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        member.refresh_from_db()
        self.assertTrue(member.is_active)
        self.assertIsNotNone(member.user)
        self.assertTrue(member.user.check_password('NewPass1234'))

    def test_accept_invitation_rejects_reused_token(self):
        member = TeamMember.objects.create(
            store=self.store, role='confirmateur', first_name='C', last_name='F', email='reuse@test.com',
        )
        self.client.post('/api/team/accept-invitation/', {'token': member.invite_token, 'password': 'NewPass1234'}, format='json')
        resp = self.client.post('/api/team/accept-invitation/', {'token': member.invite_token, 'password': 'AnotherPass123'}, format='json')
        self.assertEqual(resp.status_code, 400)


class TeamListTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        _, self.conf = make_team_member(self.store, 'confirmateur')
        _, self.drop = make_team_member(self.store, 'dropshipper')

    def test_owner_sees_all_members(self):
        client = auth_client(self.owner)
        resp = client.get('/api/team/members/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)

    def test_filter_by_role(self):
        client = auth_client(self.owner)
        resp = client.get('/api/team/members/?role=dropshipper')
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['role'], 'dropshipper')

    def test_isolated_per_store(self):
        other_owner, other_store = make_owner()
        make_team_member(other_store, 'confirmateur')
        client = auth_client(other_owner)
        resp = client.get('/api/team/members/')
        self.assertEqual(len(resp.data), 1)  # seulement le sien, pas ceux de `self.store`

    def test_delete_deactivates_not_removes(self):
        client = auth_client(self.owner)
        resp = client.delete(f'/api/team/members/{self.conf.id}/')
        self.assertEqual(resp.status_code, 204)
        self.conf.refresh_from_db()
        self.assertFalse(self.conf.is_active)


class RolePermissionsMatrixTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conf_user, self.conf = make_team_member(self.store, 'confirmateur')

    def test_owner_can_view_matrix(self):
        client = auth_client(self.owner)
        resp = client.get('/api/team/permissions/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(set(resp.data['roles']), {'admin', 'confirmateur', 'dropshipper'})
        self.assertEqual(len(resp.data['catalog']), len(PERMISSION_CATALOG))

    def test_confirmateur_cannot_view_matrix(self):
        client = auth_client(self.conf_user)
        resp = client.get('/api/team/permissions/')
        self.assertEqual(resp.status_code, 403)

    def test_toggle_permission_persists_and_takes_effect(self):
        client = auth_client(self.owner)
        resp = client.post('/api/team/permissions/', {
            'role': 'confirmateur', 'permission': 'finances_view', 'enabled': True,
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(RolePermission.objects.filter(store=self.store, role='confirmateur', permission='finances_view', enabled=True).exists())

        conf_client = auth_client(self.conf_user)
        me = conf_client.get('/api/auth/me/')
        self.assertTrue(me.data['permissions']['finances_view'])

    def test_toggle_rejects_unknown_permission(self):
        client = auth_client(self.owner)
        resp = client.post('/api/team/permissions/', {
            'role': 'confirmateur', 'permission': 'not_a_real_permission', 'enabled': True,
        }, format='json')
        self.assertEqual(resp.status_code, 400)
