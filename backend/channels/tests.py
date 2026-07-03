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


class ChannelConnectionDetailErrorTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.connection = ChannelConnection.objects.create(store=self.store, channel='shopify')

    def test_get_nonexistent_connection_404(self):
        client = auth_client(self.owner)
        resp = client.put('/api/channels/connections/999999/', {'shop_url': 'x'}, format='json')
        self.assertEqual(resp.status_code, 404)

    def test_confirmateur_cannot_update_or_delete(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.put(f'/api/channels/connections/{self.connection.id}/', {'shop_url': 'x'}, format='json')
        self.assertEqual(resp.status_code, 403)
        resp2 = client.delete(f'/api/channels/connections/{self.connection.id}/')
        self.assertEqual(resp2.status_code, 403)

    def test_update_and_delete_connection(self):
        client = auth_client(self.owner)
        resp = client.put(f'/api/channels/connections/{self.connection.id}/', {'shop_url': 'updated.myshopify.com'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['shop_url'], 'updated.myshopify.com')

        resp2 = client.delete(f'/api/channels/connections/{self.connection.id}/')
        self.assertEqual(resp2.status_code, 204)
        self.assertFalse(ChannelConnection.objects.filter(id=self.connection.id).exists())

    def test_cannot_access_connection_of_another_store(self):
        other_owner, other_store = make_owner()
        other_conn = ChannelConnection.objects.create(store=other_store, channel='google_sheets')
        client = auth_client(self.owner)
        resp = client.put(f'/api/channels/connections/{other_conn.id}/', {'shop_url': 'x'}, format='json')
        self.assertEqual(resp.status_code, 404)


class ChannelSyncErrorAndLogTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.connection = ChannelConnection.objects.create(store=self.store, channel='shopify', is_active=True)

    def test_sync_on_inactive_connection_404(self):
        self.connection.is_active = False
        self.connection.save()
        client = auth_client(self.owner)
        resp = client.post(f'/api/channels/connections/{self.connection.id}/sync/', {'direction': 'push'}, format='json')
        self.assertEqual(resp.status_code, 404)

    def test_sync_on_nonexistent_connection_404(self):
        client = auth_client(self.owner)
        resp = client.post('/api/channels/connections/999999/sync/', {'direction': 'push'}, format='json')
        self.assertEqual(resp.status_code, 404)

    def test_confirmateur_cannot_trigger_sync(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.post(f'/api/channels/connections/{self.connection.id}/sync/', {'direction': 'push'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_logs_filtered_by_channel(self):
        other_connection = ChannelConnection.objects.create(store=self.store, channel='google_sheets', is_active=True)
        ChannelSyncLog.objects.create(store=self.store, connection=self.connection, channel='shopify', direction='push', status='success')
        ChannelSyncLog.objects.create(store=self.store, connection=other_connection, channel='google_sheets', direction='pull', status='success')

        client = auth_client(self.owner)
        resp = client.get('/api/channels/logs/?channel=shopify')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['channel'], 'shopify')

    def test_logs_isolated_per_store(self):
        ChannelSyncLog.objects.create(store=self.store, connection=self.connection, channel='shopify', direction='push', status='success')
        other_owner, _ = make_owner()
        client = auth_client(other_owner)
        resp = client.get('/api/channels/logs/')
        self.assertEqual(len(resp.data), 0)

    def test_confirmateur_granted_channels_view_can_list_but_not_sync(self):
        from team.models import RolePermission
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        RolePermission.objects.create(store=self.store, role='confirmateur', permission='channels_view', enabled=True)
        client = auth_client(conf_user)
        resp = client.get('/api/channels/connections/')
        self.assertEqual(resp.status_code, 200)
        resp2 = client.post(f'/api/channels/connections/{self.connection.id}/sync/', {'direction': 'push'}, format='json')
        self.assertEqual(resp2.status_code, 403)
