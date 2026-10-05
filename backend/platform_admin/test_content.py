from django.test import TestCase

from audit.models import AuditLog
from core.test_utils import make_owner, auth_client, clear_throttle_cache
from .content_models import FaqItem, LegalPage
from .tests import make_user

BASE = '/api/platform-admin'


class ContentTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, _ = make_owner()
        self.owner_c = auth_client(self.owner)
        self.admin_c = auth_client(make_user('ct-admin@test.com', is_platform_admin=True))
        self.super_c = auth_client(make_user('ct-super@test.com', is_platform_superadmin=True))

    def test_faq_rights_validation_and_audit(self):
        self.assertEqual(self.admin_c.post(f'{BASE}/faq/', {'question': 'Comment ?', 'answer': 'Ainsi.'}, format='json').status_code, 403)
        self.assertEqual(self.super_c.post(f'{BASE}/faq/', {'question': 'x', 'answer': 'Ainsi.'}, format='json').status_code, 400)
        r = self.super_c.post(f'{BASE}/faq/', {'question': 'Comment ?', 'answer': 'Ainsi.', 'order': 2}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertTrue(AuditLog.objects.filter(action='platform.faq_created').exists())
        self.assertEqual(len(self.admin_c.get(f'{BASE}/faq/').data), 1)
        self.assertEqual(self.owner_c.get(f'{BASE}/faq/').status_code, 403)

    def test_vendor_sees_only_active_in_order(self):
        FaqItem.objects.create(question='B ?', answer='bbb', order=2)
        FaqItem.objects.create(question='A ?', answer='aaa', order=1)
        FaqItem.objects.create(question='Caché ?', answer='ccc', order=0, is_active=False)
        data = self.owner_c.get('/api/support/faq/').data
        self.assertEqual([f['question'] for f in data], ['A ?', 'B ?'])

    def test_faq_update_and_delete(self):
        item = FaqItem.objects.create(question='Q ?', answer='aaa')
        self.assertEqual(self.super_c.put(f'{BASE}/faq/{item.id}/', {'is_active': False}, format='json').status_code, 200)
        item.refresh_from_db()
        self.assertFalse(item.is_active)
        self.assertEqual(self.admin_c.delete(f'{BASE}/faq/{item.id}/').status_code, 403)
        self.assertEqual(self.super_c.delete(f'{BASE}/faq/{item.id}/').status_code, 204)

    def test_legal_page_edit_and_public_rendering_is_escaped(self):
        body = 'Premier paragraphe assez long.\n\n<script>alert(1)</script> second'
        self.assertEqual(self.admin_c.put(f'{BASE}/legal-pages/terms/', {'title': 'CGU', 'body': body}, format='json').status_code, 403)
        self.assertEqual(self.super_c.put(f'{BASE}/legal-pages/nope/', {'title': 'CGU', 'body': body}, format='json').status_code, 404)
        self.assertEqual(self.super_c.put(f'{BASE}/legal-pages/terms/', {'title': 'CGU', 'body': 'court'}, format='json').status_code, 400)
        self.assertEqual(self.super_c.put(f'{BASE}/legal-pages/terms/', {'title': 'CGU', 'body': body}, format='json').status_code, 200)
        html = self.client.get('/legal/terms/').content.decode()
        self.assertNotIn('<script>', html)
        self.assertIn('&lt;script&gt;', html)
        self.assertEqual(len(self.admin_c.get(f'{BASE}/legal-pages/').data), 2)

    def test_privacy_falls_back_then_uses_edited_version(self):
        self.assertIn('Shopify', self.client.get('/legal/privacy-policy/').content.decode())
        LegalPage.objects.create(slug='privacy-policy', title='Ma politique', body='Texte personnalisé de la politique.')
        self.assertIn('Ma politique', self.client.get('/legal/privacy-policy/').content.decode())
        self.assertEqual(self.client.get('/legal/terms/').status_code, 404)
