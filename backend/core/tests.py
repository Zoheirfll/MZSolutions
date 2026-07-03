from types import SimpleNamespace

from django.test import TestCase

from core.permissions import (
    get_store, get_team_role, is_owner_or_admin, get_effective_permissions, has_permission,
)
from core.test_utils import make_owner, make_team_member


def _req(user):
    return SimpleNamespace(user=user)


class PermissionHelpersTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.admin_user, self.admin = make_team_member(self.store, 'admin')
        self.conf_user, self.conf = make_team_member(self.store, 'confirmateur')
        self.drop_user, self.drop = make_team_member(self.store, 'dropshipper')

    def test_get_store_resolves_for_owner_and_team_member(self):
        self.assertEqual(get_store(_req(self.owner)), self.store)
        self.assertEqual(get_store(_req(self.admin_user)), self.store)

    def test_get_team_role_none_for_owner(self):
        self.assertIsNone(get_team_role(_req(self.owner)))
        self.assertEqual(get_team_role(_req(self.admin_user)), 'admin')
        self.assertEqual(get_team_role(_req(self.conf_user)), 'confirmateur')

    def test_is_owner_or_admin(self):
        self.assertTrue(is_owner_or_admin(_req(self.owner)))
        self.assertTrue(is_owner_or_admin(_req(self.admin_user)))
        self.assertFalse(is_owner_or_admin(_req(self.conf_user)))
        self.assertFalse(is_owner_or_admin(_req(self.drop_user)))

    def test_owner_has_all_permissions_true(self):
        perms = get_effective_permissions(_req(self.owner))
        self.assertTrue(all(perms.values()))

    def test_confirmateur_default_permissions_restricted(self):
        self.assertFalse(has_permission(_req(self.conf_user), 'finances_view'))
        self.assertFalse(has_permission(_req(self.conf_user), 'products_view'))
        self.assertTrue(has_permission(_req(self.conf_user), 'orders_view'))

    def test_dropshipper_default_permissions(self):
        self.assertTrue(has_permission(_req(self.drop_user), 'products_view'))
        self.assertFalse(has_permission(_req(self.drop_user), 'finances_view'))

    def test_role_permission_override_changes_effective_value(self):
        from team.models import RolePermission
        RolePermission.objects.create(store=self.store, role='confirmateur', permission='finances_view', enabled=True)
        self.assertTrue(has_permission(_req(self.conf_user), 'finances_view'))
