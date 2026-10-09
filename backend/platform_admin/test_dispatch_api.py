from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from core.test_utils import auth_client, clear_throttle_cache, make_owner
from orders.models import Order

from . import dispatch
from .dispatch_models import PlatformDispatchConfig, PlatformOrderFlow
from .models import PlatformConfirmationAccount
from .routing import route_order
from .tests import make_active_confirmateur

BASE = '/api/platform-admin/dispatch'


def make_service_admin():
    return User.objects.create_user(email=f'svc{User.objects.count()}@admin.test', password='TestPass123',
                                    is_active=True, is_email_verified=True, is_service_admin=True)


class DispatchApiBase(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.account = PlatformConfirmationAccount.objects.create(store=self.store, is_active=True, mode='replace')
        self.confirmateur = make_active_confirmateur(self.store, self.account)
        self.admin = auth_client(make_service_admin())
        self.conf_client = auth_client(self.confirmateur.user)

    def order(self, phone='0555000000'):
        order = Order.objects.create(store=self.store, first_name='Sami', last_name='K', phone=phone, wilaya='Alger')
        route_order(order)
        return order

    def fail(self, order, times, outcome='no_answer'):
        """Fait échouer `times` appels de suite, en avançant le temps à chaque étape."""
        when = timezone.now()
        for _ in range(times):
            flow = dispatch.record_attempt(order, self.confirmateur, outcome, now=when)
            if flow.state == 'failed':
                return flow
            when = flow.available_at + timedelta(seconds=1)
            dispatch.fill_slots(when)
        return PlatformOrderFlow.objects.get(order=order)


class AccessTests(DispatchApiBase):
    URLS = ['/meta/', '/counts/', '/waiting/', '/review/', '/failed/', '/config/']

    def test_service_admin_can_read_every_page(self):
        for path in self.URLS:
            self.assertEqual(self.admin.get(BASE + path).status_code, 200, path)

    def test_platform_admins_and_vendors_are_refused_everywhere(self):
        platform_admin = User.objects.create_user(email='pa@admin.test', password='TestPass123', is_active=True,
                                                  is_email_verified=True, is_platform_admin=True, is_platform_superadmin=True)
        for client in (auth_client(platform_admin), auth_client(self.owner), self.conf_client):
            for path in self.URLS:
                self.assertEqual(client.get(BASE + path).status_code, 403, path)
            self.assertEqual(client.post(BASE + '/run/').status_code, 403)
            self.assertEqual(client.post(BASE + '/config/', {'algorithm': 'fifo'}, format='json').status_code, 403)


class PagesTests(DispatchApiBase):
    def test_waiting_page_lists_unassigned_orders_ranked_with_score(self):
        self.confirmateur.is_active = False
        self.confirmateur.save()
        old, new = self.order('0555000001'), self.order('0555000002')
        Order.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(hours=8))
        data = self.admin.get(BASE + '/waiting/').data
        self.assertEqual(data['count'], 2)
        self.assertEqual([r['order_id'] for r in data['results']], [old.id, new.id])
        self.assertEqual(data['results'][0]['rank'], 1)
        self.assertEqual(data['results'][0]['algorithm'], 'fifo')
        self.assertTrue(data['results'][0]['ready'])

    def test_waiting_page_shows_minutes_left_after_a_failed_call(self):
        order = self.order()
        PlatformDispatchConfig.objects.create(store=None, max_open=1)
        dispatch.record_attempt(order, self.confirmateur, 'no_answer')
        row = self.admin.get(BASE + '/waiting/').data['results'][0]
        self.assertEqual(row['attempts'], 1)
        self.assertEqual(row['last_outcome'], 'no_answer')
        self.assertIn(row['minutes_left'], (29, 30))
        self.assertFalse(row['ready'])

    def test_review_page_appears_after_four_failed_calls_not_before(self):
        order = self.order()
        self.fail(order, 3)
        self.assertEqual(self.admin.get(BASE + '/review/').data['count'], 0)
        self.fail(order, 1)
        data = self.admin.get(BASE + '/review/').data
        self.assertEqual(data['count'], 1)
        self.assertEqual(data['results'][0]['order_id'], order.id)

    def test_failed_page_after_eight_calls_and_counts(self):
        order = self.order()
        self.fail(order, 8)
        failed = self.admin.get(BASE + '/failed/').data
        self.assertEqual(failed['count'], 1)
        self.assertEqual(failed['results'][0]['attempts'], 8)
        counts = self.admin.get(BASE + '/counts/').data
        self.assertEqual((counts['failed'], counts['review']), (1, 0))

    def test_filters_by_store_and_search(self):
        self.confirmateur.is_active = False
        self.confirmateur.save()
        self.order('0555123456')
        self.assertEqual(self.admin.get(BASE + '/waiting/?search=123456').data['count'], 1)
        self.assertEqual(self.admin.get(BASE + '/waiting/?search=999').data['count'], 0)
        self.assertEqual(self.admin.get(f'{BASE}/waiting/?store={self.store.id}').data['count'], 1)
        self.assertEqual(self.admin.get(f'{BASE}/waiting/?store={self.store.id + 999}').data['count'], 0)


class DetailTests(DispatchApiBase):
    def test_flow_detail_explains_the_whole_process(self):
        order = self.order()
        self.fail(order, 8)
        data = self.admin.get(f'{BASE}/flows/{order.id}/').data
        self.assertEqual(data['state'], 'failed')
        kinds = [e['kind'] for e in data['events']]
        self.assertEqual(kinds.count('attempt'), 8)
        self.assertIn('escalated', kinds)
        self.assertEqual(kinds[-1], 'failed')
        texts = ' | '.join(e['explanation'] for e in data['events'])
        self.assertIn('a appelé : Ne répond pas', texts)
        self.assertIn('prochaine tentative dans 30 min', texts)
        self.assertIn('prochaine tentative dans 40 min', texts)
        self.assertIn("Signalée à l'admin après 4 appels", texts)
        self.assertIn('Échec définitif après 8 appels', texts)
        self.assertTrue(all(e['at'] for e in data['events']))

    def test_unknown_order_is_404(self):
        self.assertEqual(self.admin.get(f'{BASE}/flows/999999/').status_code, 404)


class ConfigTests(DispatchApiBase):
    def test_meta_lists_the_ten_algorithms(self):
        data = self.admin.get(BASE + '/meta/').data
        self.assertEqual(len(data['algorithms']), 10)
        self.assertEqual(data['defaults']['wait_minutes'], [30, 40, 50, 60])

    def test_create_site_store_and_day_configs(self):
        site = self.admin.post(BASE + '/config/', {'algorithm': 'newest'}, format='json')
        self.assertEqual(site.status_code, 201, site.data)
        mine = self.admin.post(BASE + '/config/', {'algorithm': 'persistence', 'store': self.store.id, 'weekday': 2}, format='json')
        self.assertEqual(mine.status_code, 201, mine.data)
        listing = self.admin.get(BASE + '/config/').data
        self.assertEqual(len(listing), 2)
        self.assertEqual({r['algorithm_label'] for r in listing}, {"Nouvelles d'abord", 'Acharnement'})

    def test_duplicate_scope_is_a_conflict_and_both_date_and_weekday_is_refused(self):
        self.admin.post(BASE + '/config/', {'algorithm': 'newest'}, format='json')
        self.assertEqual(self.admin.post(BASE + '/config/', {'algorithm': 'fifo'}, format='json').status_code, 409)
        both = self.admin.post(BASE + '/config/', {'algorithm': 'fifo', 'date': '2026-10-10', 'weekday': 3}, format='json')
        self.assertEqual(both.status_code, 400)

    def test_validation_rejects_bad_values(self):
        bad = [
            {'algorithm': 'nope'}, {'algorithm': 'fifo', 'wait_minutes': []}, {'algorithm': 'fifo', 'wait_minutes': [0]},
            {'algorithm': 'fifo', 'wait_minutes': 'x'}, {'algorithm': 'fifo', 'review_after': 0},
            {'algorithm': 'fifo', 'fail_after_review': 99}, {'algorithm': 'fifo', 'max_open': 'abc'},
            {'algorithm': 'fifo', 'weekday': 9}, {'algorithm': 'fifo', 'date': 'pas-une-date'},
            {'algorithm': 'fifo', 'store': 999999}, {'algorithm': 'balanced', 'weights': {'inconnu': 1}},
        ]
        for body in bad:
            self.assertEqual(self.admin.post(BASE + '/config/', body, format='json').status_code, 400, body)
        self.assertEqual(PlatformDispatchConfig.objects.count(), 0)

    def test_update_and_delete(self):
        created = self.admin.post(BASE + '/config/', {'algorithm': 'fifo'}, format='json').data
        updated = self.admin.put(f"{BASE}/config/{created['id']}/", {'algorithm': 'high_value', 'wait_minutes': [10, 20]}, format='json')
        self.assertEqual(updated.status_code, 200)
        self.assertEqual((updated.data['algorithm'], updated.data['wait_minutes']), ('high_value', [10, 20]))
        self.assertEqual(self.admin.put(f"{BASE}/config/{created['id']}/", {'algorithm': 'zzz'}, format='json').status_code, 400)
        self.assertEqual(self.admin.delete(f"{BASE}/config/{created['id']}/").status_code, 204)
        self.assertEqual(self.admin.delete(f"{BASE}/config/{created['id']}/").status_code, 404)

    def test_new_wait_grid_is_applied_by_the_engine(self):
        self.admin.post(BASE + '/config/', {'algorithm': 'fifo', 'wait_minutes': [5, 7]}, format='json')
        order = self.order()
        flow = dispatch.record_attempt(order, self.confirmateur, 'no_answer')
        self.assertEqual(round((flow.available_at - timezone.now()).total_seconds() / 60), 5)


class ConfirmateurCallTests(DispatchApiBase):
    def test_call_result_sends_the_order_back_to_waiting(self):
        order = self.order()
        resp = self.conf_client.post(f'/api/platform-admin/my-queue/{order.id}/call/', {'outcome': 'no_answer', 'note': 'sonne dans le vide'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual((resp.data['state'], resp.data['attempts']), ('waiting', 1))
        self.assertEqual(PlatformOrderFlow.objects.get(order=order).events.get(kind='attempt').note, 'sonne dans le vide')
        queue = self.conf_client.get('/api/platform-admin/my-queue/').data['results']
        self.assertNotIn(order.id, [r['id'] for r in queue])

    def test_callback_with_time_and_invalid_input(self):
        order = self.order()
        url = f'/api/platform-admin/my-queue/{order.id}/call/'
        self.assertEqual(self.conf_client.post(url, {'outcome': 'nope'}, format='json').status_code, 400)
        self.assertEqual(self.conf_client.post(url, {'outcome': 'callback', 'callback_at': 'bad'}, format='json').status_code, 400)
        target = (timezone.now() + timedelta(hours=2)).isoformat()
        resp = self.conf_client.post(url, {'outcome': 'callback', 'callback_at': target}, format='json')
        self.assertEqual((resp.status_code, resp.data['attempts']), (200, 0))

    def test_other_confirmateur_and_non_confirmateur_cannot_report_calls(self):
        order = self.order()
        url = f'/api/platform-admin/my-queue/{order.id}/call/'
        other = make_active_confirmateur(self.store, self.account)
        self.assertEqual(auth_client(other.user).post(url, {'outcome': 'no_answer'}, format='json').status_code, 404)
        self.assertEqual(auth_client(self.owner).post(url, {'outcome': 'no_answer'}, format='json').status_code, 403)

    def test_confirming_closes_the_flow_and_frees_the_slot(self):
        PlatformDispatchConfig.objects.create(store=None, max_open=1)
        first, second = self.order('0555000001'), self.order('0555000002')
        self.assertEqual(PlatformOrderFlow.objects.get(order=second).state, 'waiting')
        resp = self.conf_client.post(f'/api/platform-admin/my-queue/{first.id}/status/', {'status': 'confirmed'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(PlatformOrderFlow.objects.get(order=first).state, 'done')
        self.assertEqual(PlatformOrderFlow.objects.get(order=second).state, 'assigned')

    def test_queue_rows_expose_the_flow_state(self):
        order = self.order()
        row = next(r for r in self.conf_client.get('/api/platform-admin/my-queue/').data['results'] if r['id'] == order.id)
        self.assertEqual((row['flow_state'], row['flow_attempts']), ('assigned', 0))


class RunAndCommandTests(DispatchApiBase):
    def test_manual_run_and_management_command_assign_waiting_orders(self):
        self.confirmateur.is_active = False
        self.confirmateur.save()
        order = self.order()
        self.confirmateur.is_active = True
        self.confirmateur.save()
        resp = self.admin.post(BASE + '/run/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(PlatformOrderFlow.objects.get(order=order).state, 'assigned')

        self.confirmateur.is_active = False
        self.confirmateur.save()
        second = self.order('0555000009')
        self.confirmateur.is_active = True
        self.confirmateur.save()
        call_command('dispatch_waiting_orders')
        self.assertEqual(PlatformOrderFlow.objects.get(order=second).state, 'assigned')

    def test_command_is_tracked_in_the_task_registry(self):
        from .tasks import REGISTRY
        self.assertIn('dispatch_waiting_orders', REGISTRY)
        self.assertEqual(REGISTRY['dispatch_waiting_orders'][1], 1)
