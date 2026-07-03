from decimal import Decimal

from django.test import TestCase, Client as PublicClient

from .models import ChannelConnection, ChannelSyncLog
from products.models import Product
from core.test_utils import make_owner, make_team_member, auth_client


class ChannelConnectionTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_connect_upserts_by_channel(self):
        client = auth_client(self.owner)
        resp = client.post('/api/channels/connections/', {
            'channel': 'shopify', 'shop_url': 'shop.myshopify.com', 'api_key': 'ABCDEFGH1234', 'api_secret': 'SECRET1',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertNotIn('api_key', resp.data)  # write_only, jamais renvoyé en clair
        self.assertEqual(resp.data['api_key_masked'], '•' * 8 + '1234')

        resp2 = client.post('/api/channels/connections/', {
            'channel': 'shopify', 'shop_url': 'new-shop.myshopify.com',
        }, format='json')
        self.assertEqual(resp2.status_code, 201)
        self.assertEqual(ChannelConnection.objects.filter(store=self.store, channel='shopify').count(), 1)

    def test_confirmateur_without_permission_forbidden(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.get('/api/channels/connections/')
        self.assertEqual(resp.status_code, 403)

    def test_isolated_per_store(self):
        ChannelConnection.objects.create(store=self.store, channel='shopify')
        other_owner, _ = make_owner()
        client = auth_client(other_owner)
        resp = client.get('/api/channels/connections/')
        self.assertEqual(len(resp.data), 0)


class ChannelSyncTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.connection = ChannelConnection.objects.create(store=self.store, channel='shopify')
        Product.objects.create(store=self.store, name='P', price=Decimal('100'), is_active=True)

    def test_push_sync_logs_success_and_updates_last_synced(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/channels/connections/{self.connection.id}/sync/', {'direction': 'push'}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['status'], 'success')
        self.connection.refresh_from_db()
        self.assertIsNotNone(self.connection.last_synced_at)

    def test_pull_sync_logged(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/channels/connections/{self.connection.id}/sync/', {'direction': 'pull'}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(ChannelSyncLog.objects.filter(connection=self.connection, direction='pull').count(), 1)

    def test_invalid_direction_rejected(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/channels/connections/{self.connection.id}/sync/', {'direction': 'sideways'}, format='json')
        self.assertEqual(resp.status_code, 400)


class CatalogFeedTests(TestCase):
    def test_feed_lists_only_active_products_of_that_store(self):
        owner, store = make_owner()
        Product.objects.create(store=store, name='Visible', price=Decimal('100'), is_active=True)
        Product.objects.create(store=store, name='Hidden', price=Decimal('200'), is_active=False)
        other_owner, other_store = make_owner()
        Product.objects.create(store=other_store, name='Other Store Product', price=Decimal('300'), is_active=True)

        resp = PublicClient().get(f'/api/public/store/{store.slug}/catalog.xml')
        self.assertEqual(resp.status_code, 200)
        body = resp.content.decode()
        self.assertIn('Visible', body)
        self.assertNotIn('Hidden', body)
        self.assertNotIn('Other Store Product', body)

    def test_unknown_store_returns_404(self):
        resp = PublicClient().get('/api/public/store/does-not-exist/catalog.xml')
        self.assertEqual(resp.status_code, 404)
