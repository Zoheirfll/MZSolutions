from django.test import TestCase
from core.test_utils import make_owner, make_team_member, auth_client
from .models import AuditLog
from .utils import log_audit


class LogAuditUtilTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conf_user, self.conf = make_team_member(self.store, 'confirmateur')

    def _fake_request(self, user):
        class Req:
            pass
        r = Req()
        r.user = user
        return r

    def test_log_audit_resolves_owner(self):
        log_audit(self._fake_request(self.owner), 'order.created', description='test')
        entry = AuditLog.objects.get()
        self.assertEqual(entry.store, self.store)
        self.assertEqual(entry.actor_role, 'owner')

    def test_log_audit_resolves_confirmateur(self):
        log_audit(self._fake_request(self.conf_user), 'order.status_changed', description='test')
        entry = AuditLog.objects.get()
        self.assertEqual(entry.store, self.store)
        self.assertEqual(entry.actor_role, 'confirmateur')

    def test_log_audit_never_raises_on_bad_input(self):
        # user sans store ni team_membership (ex: instance mal formée) — ne
        # doit jamais remonter d'exception à l'appelant.
        class Ghost:
            first_name = 'X'
            last_name = 'Y'
            email = 'x@y.z'
        result = log_audit(self._fake_request(Ghost()), 'order.created')
        self.assertIsNone(result)
        self.assertEqual(AuditLog.objects.count(), 0)


class AuditLogEndpointTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conf_user, self.conf = make_team_member(self.store, 'confirmateur')
        AuditLog.objects.create(store=self.store, actor=self.owner, actor_name='Owner', actor_role='owner', action='order.created', description='d1')
        AuditLog.objects.create(store=self.store, actor=self.conf_user, actor_name='Conf', actor_role='confirmateur', action='order.status_changed', description='d2')

    def test_confirmateur_cannot_access_audit_log(self):
        client = auth_client(self.conf_user)
        resp = client.get('/api/audit/logs/')
        self.assertEqual(resp.status_code, 403)

    def test_owner_can_list_audit_log(self):
        client = auth_client(self.owner)
        resp = client.get('/api/audit/logs/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 2)

    def test_filter_by_action(self):
        client = auth_client(self.owner)
        resp = client.get('/api/audit/logs/?action=order.created')
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['action'], 'order.created')

    def test_filter_by_actor(self):
        client = auth_client(self.owner)
        resp = client.get(f'/api/audit/logs/?actor={self.conf_user.id}')
        self.assertEqual(resp.data['count'], 1)

    def test_search(self):
        client = auth_client(self.owner)
        resp = client.get('/api/audit/logs/?search=d1')
        self.assertEqual(resp.data['count'], 1)

    def test_meta_endpoint_lists_used_actions_and_actors(self):
        client = auth_client(self.owner)
        resp = client.get('/api/audit/meta/')
        self.assertEqual(resp.status_code, 200)
        action_keys = {a['key'] for a in resp.data['actions']}
        self.assertEqual(action_keys, {'order.created', 'order.status_changed'})
        actor_ids = {a['id'] for a in resp.data['actors']}
        self.assertIn(self.owner.id, actor_ids)
        self.assertIn(self.conf_user.id, actor_ids)

    def test_isolated_between_stores(self):
        owner2, store2 = make_owner()
        AuditLog.objects.create(store=store2, actor=owner2, actor_name='Other', actor_role='owner', action='order.created', description='other store')
        client = auth_client(self.owner)
        resp = client.get('/api/audit/logs/')
        self.assertEqual(resp.data['count'], 2)  # toujours 2, pas 3


class OrderActionAuditIntegrationTests(TestCase):
    """Vérifie que les actions métier réelles (pas juste log_audit() isolé)
    créent bien une entrée — couvre la demande explicite "chaque agissement
    des confirmateurs et admin, sans exception" pour les surfaces les plus
    sensibles (statut commande, toggle en ligne)."""

    def setUp(self):
        self.owner, self.store = make_owner()
        self.conf_user, self.conf = make_team_member(self.store, 'confirmateur')

    def test_order_status_change_is_audited(self):
        from orders.models import Order
        order = Order.objects.create(store=self.store, status='pending', first_name='A', last_name='B', phone='0555000000', wilaya='Alger')
        client = auth_client(self.owner)
        resp = client.post(f'/api/orders/{order.id}/status/', {'status': 'confirmed', 'note': 'ok client'}, format='json')
        self.assertEqual(resp.status_code, 200)
        entry = AuditLog.objects.filter(action='order.status_changed', target_id=order.id).first()
        self.assertIsNotNone(entry)
        self.assertIn('confirmed', entry.metadata.get('to', ''))

    def test_online_toggle_is_audited_only_on_change(self):
        # make_team_member met les confirmateurs de test en ligne par défaut
        # (voir core/test_utils.py) — repartir de "hors ligne" pour tester
        # le vrai basculement.
        self.conf.is_online = False
        self.conf.save(update_fields=['is_online'])
        client = auth_client(self.conf_user)
        client.post('/api/team/online-status/', {'online': True}, format='json')
        client.post('/api/team/online-status/', {}, format='json')  # heartbeat, pas de changement
        client.post('/api/team/online-status/', {'online': True}, format='json')  # pas de changement
        self.assertEqual(AuditLog.objects.filter(action='confirmateur.online').count(), 1)
        client.post('/api/team/online-status/', {'online': False}, format='json')
        self.assertEqual(AuditLog.objects.filter(action='confirmateur.offline').count(), 1)
