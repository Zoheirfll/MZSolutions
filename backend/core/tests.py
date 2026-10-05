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
        self.assertFalse(has_permission(_req(self.conf_user), 'costs_view'))
        self.assertFalse(has_permission(_req(self.conf_user), 'products_view'))
        self.assertTrue(has_permission(_req(self.conf_user), 'orders_view'))

    def test_dropshipper_default_permissions(self):
        self.assertTrue(has_permission(_req(self.drop_user), 'products_view'))
        self.assertFalse(has_permission(_req(self.drop_user), 'costs_view'))

    def test_role_permission_override_changes_effective_value(self):
        from team.models import RolePermission
        RolePermission.objects.create(store=self.store, role='confirmateur', permission='costs_view', enabled=True)
        self.assertTrue(has_permission(_req(self.conf_user), 'costs_view'))


class ApiLanguageMiddlewareTests(TestCase):
    """Les messages d'API sont traduits en arabe sur Accept-Language: ar, sinon inchangés."""

    def test_exact_message_translated(self):
        from core.i18n_middleware import translate
        self.assertEqual(translate('Panier vide.'), 'السلة فارغة.')

    def test_prefix_message_keeps_dynamic_value(self):
        from core.i18n_middleware import translate
        self.assertEqual(translate('Rôle invalide. Valeurs : admin, confirmateur'), 'دور غير صالح. القيم المسموحة: admin, confirmateur')

    def test_unknown_message_untouched(self):
        from core.i18n_middleware import translate
        self.assertEqual(translate('Message inconnu.'), 'Message inconnu.')

    def test_login_error_arabic_only_when_requested(self):
        from rest_framework.test import APIClient
        c = APIClient()
        body = {'email': 'nobody@example.com', 'password': 'x'}
        fr = c.post('/api/auth/login/', body, format='json')
        ar = c.post('/api/auth/login/', body, format='json', HTTP_ACCEPT_LANGUAGE='ar')
        self.assertNotEqual(fr.content, ar.content)
        self.assertIn('غير صحيحة', ar.content.decode('utf-8'))
