from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import RequestFactory, TestCase, override_settings
from django.utils import timezone

from accounts.models import User
from audit.models import AuditLog
from core.test_utils import make_owner, auth_client, clear_throttle_cache
from .middleware import AdminLoginThrottleMiddleware, ErrorLogMiddleware, normalize_route
from .system_models import ErrorEvent, PlatformSettings
from .tests import make_user

BASE = '/api/platform-admin'


class SystemBase(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.admin_c = auth_client(make_user('sys-admin@test.com', is_platform_admin=True))
        self.super_c = auth_client(make_user('sys-super@test.com', is_platform_superadmin=True))


class HealthTests(SystemBase):
    def test_non_admin_forbidden(self):
        self.assertEqual(auth_client(self.owner).get(f'{BASE}/health/').status_code, 403)

    def test_health_lists_checks_without_external_calls(self):
        with patch('requests.get') as get, patch('requests.post') as post:
            resp = self.admin_c.get(f'{BASE}/health/')
        self.assertEqual(resp.status_code, 200)
        keys = {c['key'] for c in resp.data['checks']}
        self.assertTrue({'database', 'cache', 'email', 'sofizpay', 'ai', 'disk'} <= keys)
        get.assert_not_called()
        post.assert_not_called()
        db = next(c for c in resp.data['checks'] if c['key'] == 'database')
        self.assertEqual(db['status'], 'ok')

    @override_settings(SOFIZPAY_ACCOUNT='')
    def test_missing_sofizpay_account_is_an_error(self):
        resp = self.admin_c.get(f'{BASE}/health/')
        sofiz = next(c for c in resp.data['checks'] if c['key'] == 'sofizpay')
        self.assertEqual(sofiz['status'], 'error')
        self.assertEqual(resp.data['status'], 'error')

    @override_settings(SOFIZPAY_ACCOUNT='GABC', SOFIZPAY_SANDBOX=True, DEBUG=False)
    def test_sandbox_in_production_is_flagged(self):
        resp = self.admin_c.get(f'{BASE}/health/')
        sofiz = next(c for c in resp.data['checks'] if c['key'] == 'sofizpay')
        self.assertEqual(sofiz['status'], 'warning')

    def test_no_secret_in_health_payload(self):
        body = str(self.admin_c.get(f'{BASE}/health/').data)
        for secret in ('SECRET_KEY', 'GROQ_API_KEY=', 'EMAIL_HOST_PASSWORD'):
            self.assertNotIn(secret, body)


class ErrorLogTests(SystemBase):
    def _raise(self, path='/api/orders/123/', exc=None):
        request = RequestFactory().get(path)
        try:
            raise (exc or ValueError('mot de passe: hunter2 / client@secret.dz'))
        except Exception as e:  # noqa: BLE001
            ErrorLogMiddleware(lambda r: None).process_exception(request, e)

    def test_normalize_route_hides_ids(self):
        self.assertEqual(normalize_route('/api/orders/123/status/'), '/api/orders/<id>/status/')
        self.assertEqual(normalize_route('/api/x/3f2b8c1e-aaaa-bbbb-cccc-1234567890ab/'), '/api/x/<id>/')

    def test_records_grouped_event_without_message_or_request_data(self):
        self._raise('/api/orders/1/')
        self._raise('/api/orders/2/')  # même route normalisée, même ligne → un seul groupe
        self.assertEqual(ErrorEvent.objects.count(), 1)
        event = ErrorEvent.objects.get()
        self.assertEqual(event.count, 2)
        self.assertEqual(event.route, '/api/orders/<id>/')
        self.assertEqual(event.exception_type, 'ValueError')
        dump = ' '.join(str(v) for v in event.__dict__.values())
        self.assertNotIn('hunter2', dump)
        self.assertNotIn('client@secret.dz', dump)

    def test_ignored_exceptions_are_not_recorded(self):
        from django.http import Http404
        self._raise(exc=Http404())
        self.assertEqual(ErrorEvent.objects.count(), 0)

    def test_recurring_resolved_error_reopens(self):
        self._raise()
        event = ErrorEvent.objects.get()
        self.admin_c.post(f'{BASE}/errors/{event.id}/resolve/')
        event.refresh_from_db()
        self.assertEqual(event.status, 'resolved')
        self._raise()
        event.refresh_from_db()
        self.assertEqual(event.status, 'open')
        self.assertEqual(event.count, 2)

    def test_middleware_never_masks_the_original_exception(self):
        request = RequestFactory().get('/x/')
        with patch('platform_admin.system_models.ErrorEvent.objects.get_or_create', side_effect=RuntimeError('db down')):
            try:
                raise ValueError('boom')
            except ValueError as e:
                result = ErrorLogMiddleware(lambda r: None).process_exception(request, e)
        self.assertIsNone(result)

    def test_real_unhandled_error_is_logged_end_to_end(self):
        self.admin_c.raise_request_exception = False  # laisse la réponse 500 sortir au lieu de relever l'exception
        with patch('platform_admin.views_overview.compute_overview', side_effect=RuntimeError('kaboom')):
            resp = self.admin_c.get(f'{BASE}/overview/')
        self.assertEqual(resp.status_code, 500)
        self.assertTrue(ErrorEvent.objects.filter(exception_type='RuntimeError', route='/api/platform-admin/overview/').exists())

    def test_list_filters_and_open_count(self):
        self._raise()
        self._raise('/api/products/5/', RuntimeError('x'))
        first = ErrorEvent.objects.order_by('id').first()
        self.admin_c.post(f'{BASE}/errors/{first.id}/resolve/')
        data = self.admin_c.get(f'{BASE}/errors/?status=open').data
        self.assertEqual(data['count'], 1)
        self.assertEqual(data['open_count'], 1)

    def test_non_admin_forbidden_and_resolve_audited(self):
        self.assertEqual(auth_client(self.owner).get(f'{BASE}/errors/').status_code, 403)
        self._raise()
        event = ErrorEvent.objects.get()
        self.assertEqual(auth_client(self.owner).post(f'{BASE}/errors/{event.id}/resolve/').status_code, 403)
        self.admin_c.post(f'{BASE}/errors/{event.id}/resolve/')
        self.assertTrue(AuditLog.objects.filter(action='platform.error_resolved').exists())


class SettingsTests(SystemBase):
    def test_admin_reads_but_cannot_write(self):
        self.assertEqual(self.admin_c.get(f'{BASE}/settings/').status_code, 200)
        self.assertEqual(self.admin_c.put(f'{BASE}/settings/', {'trial_days': 10}, format='json').status_code, 403)

    def test_defaults(self):
        data = self.super_c.get(f'{BASE}/settings/').data
        self.assertEqual(data['trial_days'], 30)
        self.assertTrue(data['allow_registration'])

    def test_update_validates_and_audits(self):
        self.assertEqual(self.super_c.put(f'{BASE}/settings/', {'trial_days': 400}, format='json').status_code, 400)
        self.assertEqual(self.super_c.put(f'{BASE}/settings/', {'trial_days': 'x'}, format='json').status_code, 400)
        resp = self.super_c.put(f'{BASE}/settings/', {'trial_days': 14}, format='json')
        self.assertEqual(resp.status_code, 200)
        entry = AuditLog.objects.get(action='platform.settings_updated')
        self.assertEqual(entry.metadata['changes']['trial_days'], {'before': '30', 'after': '14'})

    def test_trial_days_apply_to_new_stores_only(self):
        old_end = self.store.quota.trial_ends_at
        self.super_c.put(f'{BASE}/settings/', {'trial_days': 7}, format='json')
        _, fresh = make_owner()
        delta = fresh.quota.trial_ends_at - timezone.now()
        self.assertTrue(6 <= delta.days <= 7)
        self.store.quota.refresh_from_db()
        self.assertEqual(self.store.quota.trial_ends_at, old_end)

    def test_closing_registration_blocks_signup(self):
        self.super_c.put(f'{BASE}/settings/', {'allow_registration': False}, format='json')
        resp = self.client.post('/api/auth/register/', {'email': 'new@test.com', 'password': 'TestPass123', 'first_name': 'A', 'last_name': 'B',
                                                         'store_name': 'S', 'store_slug': 'new-slug'}, content_type='application/json')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()['code'], 'registration_closed')
        self.assertFalse(User.objects.filter(email='new@test.com').exists())
        self.super_c.put(f'{BASE}/settings/', {'allow_registration': True}, format='json')
        self.assertNotEqual(self.client.post('/api/auth/register/', {}, content_type='application/json').status_code, 403)

    def test_no_secrets_in_settings_payload(self):
        body = str(self.super_c.get(f'{BASE}/settings/').data)
        self.assertNotIn('KEY', body.upper().replace('ALLOW', ''))


class AdminLoginThrottleTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_blocks_after_too_many_attempts(self):
        request = RequestFactory().post('/admin/login/')
        mw = AdminLoginThrottleMiddleware(lambda r: type('R', (), {'status_code': 200})())
        statuses = [mw(request).status_code for _ in range(AdminLoginThrottleMiddleware.MAX_ATTEMPTS + 2)]
        self.assertEqual(statuses[:AdminLoginThrottleMiddleware.MAX_ATTEMPTS], [200] * AdminLoginThrottleMiddleware.MAX_ATTEMPTS)
        self.assertEqual(statuses[-1], 429)

    def test_does_not_affect_other_paths_or_get(self):
        mw = AdminLoginThrottleMiddleware(lambda r: type('R', (), {'status_code': 200})())
        for _ in range(30):
            self.assertEqual(mw(RequestFactory().post('/api/auth/login/')).status_code, 200)
            self.assertEqual(mw(RequestFactory().get('/admin/login/')).status_code, 200)
