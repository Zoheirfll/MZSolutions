import os
import tempfile
import time
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from audit.models import AuditLog
from core.test_utils import make_owner, auth_client, clear_throttle_cache
from . import tasks
from .system_models import TaskRun
from .tests import make_user

BASE = '/api/platform-admin'


class TasksBase(TestCase):
    def setUp(self):
        clear_throttle_cache()
        cache.clear()
        self.owner, self.store = make_owner()
        self.admin_c = auth_client(make_user('tk-admin@test.com', is_platform_admin=True))
        self.super_c = auth_client(make_user('tk-super@test.com', is_platform_superadmin=True))


class TrackTaskTests(TestCase):
    def test_a_real_command_records_its_run(self):
        call_command('activate_scheduled_orders')
        run = TaskRun.objects.get(name='activate_scheduled_orders')
        self.assertEqual(run.last_status, 'ok')
        self.assertEqual(run.runs_count, 1)
        self.assertIsNotNone(run.last_finished_at)
        call_command('activate_scheduled_orders')
        run.refresh_from_db()
        self.assertEqual(run.runs_count, 2)

    def test_an_exception_is_recorded_by_type_only_and_still_raised(self):
        @tasks.track_task('boom_task')
        def handle():
            raise ValueError('donnée sensible: 0661234567')
        with self.assertRaises(ValueError):
            handle()
        run = TaskRun.objects.get(name='boom_task')
        self.assertEqual(run.last_status, 'error')
        self.assertEqual(run.last_message, 'ValueError')
        self.assertNotIn('0661234567', run.last_message)

    def test_status_computation(self):
        now = timezone.now()
        self.assertEqual(tasks.task_status(None, 10, now), 'never')
        ok = TaskRun(name='a', last_started_at=now, last_finished_at=now - timedelta(minutes=5), last_status='ok')
        self.assertEqual(tasks.task_status(ok, 10, now), 'ok')
        late = TaskRun(name='b', last_started_at=now, last_finished_at=now - timedelta(minutes=25), last_status='ok')
        self.assertEqual(tasks.task_status(late, 10, now), 'overdue')
        err = TaskRun(name='c', last_started_at=now, last_finished_at=now, last_status='error')
        self.assertEqual(tasks.task_status(err, 10, now), 'error')
        running = TaskRun(name='d', last_started_at=now - timedelta(minutes=2), last_status='running')
        self.assertEqual(tasks.task_status(running, 10, now), 'running')
        stuck = TaskRun(name='e', last_started_at=now - timedelta(hours=2), last_status='running')
        self.assertEqual(tasks.task_status(stuck, 10, now), 'error')


class TaskEndpointTests(TasksBase):
    def test_list_shows_every_registered_task_including_never_run(self):
        rows = {r['name']: r for r in self.admin_c.get(f'{BASE}/tasks/').data['results']}
        self.assertEqual(set(rows), set(tasks.REGISTRY))
        self.assertEqual(rows['sync_carrier_tracking']['status'], 'never')
        call_command('activate_scheduled_orders')
        rows = {r['name']: r for r in self.admin_c.get(f'{BASE}/tasks/').data['results']}
        self.assertEqual(rows['activate_scheduled_orders']['status'], 'ok')

    def test_list_rights(self):
        self.assertEqual(auth_client(self.owner).get(f'{BASE}/tasks/').status_code, 403)

    def test_run_is_superadmin_only_and_validates_the_name(self):
        self.assertEqual(self.admin_c.post(f'{BASE}/tasks/activate_scheduled_orders/run/').status_code, 403)
        self.assertEqual(self.super_c.post(f'{BASE}/tasks/rm_rf/run/').status_code, 404)

    def test_run_launches_in_background_audits_and_prevents_double_launch(self):
        with patch('platform_admin.tasks.launch') as launch:
            first = self.super_c.post(f'{BASE}/tasks/activate_scheduled_orders/run/')
            second = self.super_c.post(f'{BASE}/tasks/activate_scheduled_orders/run/')
        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 409)
        launch.assert_called_once_with('activate_scheduled_orders')
        self.assertTrue(AuditLog.objects.filter(action='platform.task_launched').exists())

    def test_launch_executes_the_command(self):
        with patch('platform_admin.tasks.call_command') as call:
            tasks._execute('cancel_stale_calls')
        call.assert_called_once_with('cancel_stale_calls')


class BackupTests(TasksBase):
    def _dir_with(self, *files):
        d = tempfile.mkdtemp()
        for name, age_hours in files:
            path = os.path.join(d, name)
            open(path, 'w').write('-- dump')
            ts = time.time() - age_hours * 3600
            os.utime(path, (ts, ts))
        return d

    def test_unconfigured_when_the_directory_is_missing(self):
        with override_settings(BACKUP_DIR='/does/not/exist'):
            data = self.admin_c.get(f'{BASE}/backups/').data
        self.assertEqual((data['configured'], data['state']), (False, 'unconfigured'))

    def test_recent_backup_is_ok_and_only_dump_files_are_listed(self):
        d = self._dir_with(('backup_new.sql', 2), ('backup_old.sql', 30), ('notes.txt', 1))
        with override_settings(BACKUP_DIR=d):
            data = self.admin_c.get(f'{BASE}/backups/').data
        self.assertEqual(data['state'], 'ok')
        self.assertEqual([r['name'] for r in data['results']], ['backup_new.sql', 'backup_old.sql'])

    def test_stale_backup_degrades_the_state(self):
        with override_settings(BACKUP_DIR=self._dir_with(('a.sql', 40))):
            self.assertEqual(self.admin_c.get(f'{BASE}/backups/').data['state'], 'warning')
        with override_settings(BACKUP_DIR=self._dir_with(('a.sql', 100))):
            self.assertEqual(self.admin_c.get(f'{BASE}/backups/').data['state'], 'error')
        with override_settings(BACKUP_DIR=self._dir_with()):
            self.assertEqual(self.admin_c.get(f'{BASE}/backups/').data['state'], 'error')

    def test_health_includes_backups(self):
        with override_settings(BACKUP_DIR=self._dir_with(('a.sql', 1))):
            checks = {c['key']: c for c in self.admin_c.get(f'{BASE}/health/').data['checks']}
        self.assertEqual(checks['backups']['status'], 'ok')

    def test_rights(self):
        self.assertEqual(auth_client(self.owner).get(f'{BASE}/backups/').status_code, 403)
