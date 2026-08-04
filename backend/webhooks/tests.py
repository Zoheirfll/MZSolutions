from unittest.mock import patch, MagicMock

from django.test import TestCase, Client as PublicClient

from .models import WebhookEndpoint, WebhookLog, IncomingWebhookKey, MAX_CONSECUTIVE_FAILURES
from .dispatch import fire_event
from core.test_utils import make_owner, make_team_member, auth_client, clear_throttle_cache


class WebhookEndpointCrudTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_create_endpoint_generates_secret(self):
        client = auth_client(self.owner)
        resp = client.post('/api/webhooks/endpoints/', {
            'name': 'Zapier', 'url': 'https://hooks.zapier.com/x', 'events': ['order.created'],
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        endpoint = WebhookEndpoint.objects.get(id=resp.data['id'])
        self.assertTrue(endpoint.secret)

    def test_confirmateur_without_permission_forbidden(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.get('/api/webhooks/endpoints/')
        self.assertEqual(resp.status_code, 403)

    def test_isolated_per_store(self):
        WebhookEndpoint.objects.create(store=self.store, url='https://x.test/hook')
        other_owner, _ = make_owner()
        client = auth_client(other_owner)
        resp = client.get('/api/webhooks/endpoints/')
        self.assertEqual(len(resp.data), 0)


class DispatchTests(TestCase):
    """`x.test` (RFC 2606) ne résout jamais en DNS réel — is_public_http_url()
    (Sécurité, point 13 SSRF) le rejetterait avant même d'atteindre le
    requests.post mocké. Ces tests portent sur la logique de dispatch, pas sur
    la vérification SSRF elle-même (couverte séparément), donc on la mocke."""
    def setUp(self):
        self.owner, self.store = make_owner()
        self.endpoint = WebhookEndpoint.objects.create(store=self.store, url='https://x.test/hook', events=['order.created'])

    @patch('webhooks.dispatch.is_public_http_url', return_value=True)
    @patch('webhooks.dispatch.requests.post')
    def test_fire_event_success_logs_and_resets_failures(self, mock_post, mock_safe_url):
        mock_post.return_value = MagicMock(status_code=200, ok=True)
        self.endpoint.consecutive_failures = 3
        self.endpoint.save()
        fire_event(self.store, 'order.created', {'order_id': 1})
        self.endpoint.refresh_from_db()
        self.assertEqual(self.endpoint.consecutive_failures, 0)
        self.assertEqual(WebhookLog.objects.filter(endpoint=self.endpoint, status='success').count(), 1)

    @patch('webhooks.dispatch.requests.post')
    def test_fire_event_skips_unsubscribed_event(self, mock_post):
        fire_event(self.store, 'order.confirmed', {'order_id': 1})
        mock_post.assert_not_called()

    @patch('webhooks.dispatch.is_public_http_url', return_value=True)
    @patch('webhooks.dispatch.requests.post')
    def test_endpoint_auto_disabled_after_max_failures(self, mock_post, mock_safe_url):
        import requests
        mock_post.side_effect = requests.exceptions.ConnectionError('connection refused')
        for _ in range(MAX_CONSECUTIVE_FAILURES):
            fire_event(self.store, 'order.created', {'order_id': 1})
        self.endpoint.refresh_from_db()
        self.assertFalse(self.endpoint.is_active)
        self.assertEqual(self.endpoint.consecutive_failures, MAX_CONSECUTIVE_FAILURES)

    @patch('webhooks.dispatch.requests.post')
    def test_inactive_endpoint_not_notified(self, mock_post):
        self.endpoint.is_active = False
        self.endpoint.save()
        fire_event(self.store, 'order.created', {'order_id': 1})
        mock_post.assert_not_called()

    @patch('webhooks.dispatch.requests.post')
    def test_ssrf_target_never_sent_and_logged_as_error(self, mock_post):
        # is_public_http_url() résout réellement 'localhost' -> 127.0.0.1,
        # rejeté comme adresse loopback (Sécurité, point 13).
        self.endpoint.url = 'http://localhost:8000/internal'
        self.endpoint.save()
        fire_event(self.store, 'order.created', {'order_id': 1})
        mock_post.assert_not_called()
        log = WebhookLog.objects.filter(endpoint=self.endpoint).latest('created_at')
        self.assertEqual(log.status, 'error')


class IncomingWebhookTests(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()

    def test_get_or_create_key(self):
        client = auth_client(self.owner)
        resp = client.get('/api/webhooks/incoming-key/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['key'])

    def test_valid_key_logs_inbound_event(self):
        key = IncomingWebhookKey.objects.create(store=self.store)
        resp = PublicClient().post(f'/api/public/webhooks/incoming/{key.key}/', {'event': 'test'}, content_type='application/json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(WebhookLog.objects.filter(store=self.store, direction='inbound').count(), 1)

    def test_invalid_key_rejected(self):
        resp = PublicClient().post('/api/public/webhooks/incoming/not-a-real-key/', {}, content_type='application/json')
        self.assertEqual(resp.status_code, 403)

    def test_rotate_key_invalidates_old_one(self):
        client = auth_client(self.owner)
        old = client.get('/api/webhooks/incoming-key/').data['key']
        new = client.post('/api/webhooks/incoming-key/').data['key']
        self.assertNotEqual(old, new)
        resp_old = PublicClient().post(f'/api/public/webhooks/incoming/{old}/', {}, content_type='application/json')
        self.assertEqual(resp_old.status_code, 403)
