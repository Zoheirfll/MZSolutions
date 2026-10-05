from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from ai_assistant.models import AIUsageDay
from audit.models import AuditLog
from core.features import feature_enabled
from core.test_utils import make_owner, make_team_member, auth_client, clear_throttle_cache
from webhooks.dispatch import fire_event
from webhooks.models import WebhookEndpoint
from .system_models import PlatformSettings
from .tests import make_user

BASE = '/api/platform-admin'


class ModulesBase(TestCase):
    def setUp(self):
        clear_throttle_cache()
        cache.clear()
        self.owner, self.store = make_owner()
        self.owner_c = auth_client(self.owner)
        self.admin_c = auth_client(make_user('mod-admin@test.com', is_platform_admin=True))
        self.super_c = auth_client(make_user('mod-super@test.com', is_platform_superadmin=True))

    def _ai_chat(self, client=None):
        """Appel IA réel simulé : on remplace le fournisseur pour ne jamais sortir sur le réseau."""
        with patch('ai_assistant.ollama_client.chat', return_value={'role': 'assistant', 'content': 'Bonjour'}):
            return (client or self.owner_c).post('/api/ai/chat/', {'message': 'Salut'}, format='json')


class FeatureFlagTests(ModulesBase):
    def test_enabled_by_default(self):
        for key in ('ai', 'webhooks', 'channels'):
            self.assertTrue(feature_enabled(self.store, key))

    def test_store_and_global_switches(self):
        self.store.disabled_features = ['ai']
        self.assertFalse(feature_enabled(self.store, 'ai'))
        self.assertTrue(feature_enabled(self.store, 'webhooks'))
        self.store.disabled_features = []
        PlatformSettings.objects.update_or_create(pk=1, defaults={'disabled_features': ['webhooks']})
        cache.clear()
        self.assertFalse(feature_enabled(self.store, 'webhooks'))

    def test_unknown_keys_in_the_global_list_are_ignored(self):
        PlatformSettings.objects.update_or_create(pk=1, defaults={'disabled_features': ['ghost']})
        cache.clear()
        self.assertTrue(feature_enabled(self.store, 'ghost'))


class StoreFeaturesEndpointTests(ModulesBase):
    def test_only_superadmin_and_validation(self):
        url = f'{BASE}/accounts/{self.store.id}/features/'
        self.assertEqual(self.admin_c.put(url, {'disabled': ['ai']}, format='json').status_code, 403)
        self.assertEqual(self.super_c.put(url, {'disabled': ['nope']}, format='json').status_code, 400)
        self.assertEqual(self.super_c.put(url, {'disabled': 'ai'}, format='json').status_code, 400)
        self.assertEqual(self.super_c.put(f'{BASE}/accounts/999999/features/', {'disabled': []}, format='json').status_code, 404)

    def test_update_is_stored_audited_and_shown_in_the_detail(self):
        url = f'{BASE}/accounts/{self.store.id}/features/'
        self.assertEqual(self.super_c.put(url, {'disabled': ['ai', 'ai', 'webhooks']}, format='json').status_code, 200)
        self.store.refresh_from_db()
        self.assertEqual(self.store.disabled_features, ['ai', 'webhooks'])
        self.assertTrue(AuditLog.objects.filter(action='platform.store_features_changed', store=self.store).exists())
        self.assertEqual(self.admin_c.get(f'{BASE}/accounts/{self.store.id}/').data['disabled_features'], ['ai', 'webhooks'])


class EnforcementTests(ModulesBase):
    def test_ai_works_then_is_cut_for_the_store(self):
        self.assertEqual(self._ai_chat().status_code, 200)
        self.store.disabled_features = ['ai']
        self.store.save()
        resp = self._ai_chat()
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data['code'], 'feature_disabled')

    def test_ai_global_switch_applies_to_every_store(self):
        self.super_c.put(f'{BASE}/settings/', {'disabled_features': ['ai']}, format='json')
        self.assertEqual(self._ai_chat().status_code, 403)
        _, other = make_owner()
        self.assertEqual(self._ai_chat(auth_client(other.owner)).status_code, 403)
        self.super_c.put(f'{BASE}/settings/', {'disabled_features': []}, format='json')
        self.assertEqual(self._ai_chat().status_code, 200)

    def test_daily_limit_blocks_with_429_and_other_stores_are_independent(self):
        self.super_c.put(f'{BASE}/settings/', {'ai_daily_limit': 2}, format='json')
        self.assertEqual(self._ai_chat().status_code, 200)
        self.assertEqual(self._ai_chat().status_code, 200)
        third = self._ai_chat()
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data['code'], 'ai_quota')
        _, other = make_owner()
        self.assertEqual(self._ai_chat(auth_client(other.owner)).status_code, 200)

    def test_blocked_calls_are_not_counted_and_no_limit_means_unlimited(self):
        for _ in range(5):
            self._ai_chat()
        self.assertEqual(AIUsageDay.objects.get(store=self.store).calls, 5)
        self.store.disabled_features = ['ai']
        self.store.save()
        self._ai_chat()
        self.assertEqual(AIUsageDay.objects.get(store=self.store).calls, 5)

    def test_webhooks_are_not_sent_when_the_module_is_off(self):
        WebhookEndpoint.objects.create(store=self.store, url='https://example.com/h', events=[])
        with patch('webhooks.dispatch.requests.post') as post:
            post.return_value.status_code = 200
            fire_event(self.store, 'order.created', {'id': 1})
            self.assertEqual(post.call_count, 1)
            self.store.disabled_features = ['webhooks']
            fire_event(self.store, 'order.created', {'id': 2})
            self.assertEqual(post.call_count, 1)

    def test_channel_sync_endpoint_is_refused_when_the_module_is_off(self):
        self.store.disabled_features = ['channels']
        self.store.save()
        resp = self.owner_c.post('/api/channels/connections/1/sync/', {'direction': 'push'}, format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data['code'], 'feature_disabled')


class SettingsAndUsageTests(ModulesBase):
    def test_settings_expose_the_catalogue_and_validate(self):
        data = self.super_c.get(f'{BASE}/settings/').data
        self.assertEqual({f['key'] for f in data['features']}, {'ai', 'webhooks', 'channels'})
        self.assertEqual(self.super_c.put(f'{BASE}/settings/', {'disabled_features': ['x']}, format='json').status_code, 400)
        self.assertEqual(self.super_c.put(f'{BASE}/settings/', {'ai_daily_limit': -1}, format='json').status_code, 400)
        self.assertEqual(self.super_c.put(f'{BASE}/settings/', {'ai_daily_limit': 'x'}, format='json').status_code, 400)
        self.assertEqual(self.admin_c.put(f'{BASE}/settings/', {'ai_daily_limit': 5}, format='json').status_code, 403)

    def test_changes_are_audited(self):
        self.super_c.put(f'{BASE}/settings/', {'ai_daily_limit': 50, 'disabled_features': ['channels']}, format='json')
        entry = AuditLog.objects.get(action='platform.settings_updated')
        self.assertEqual(entry.metadata['changes']['ai_daily_limit'], {'before': '0', 'after': '50'})
        self.assertIn('disabled_features', entry.metadata['changes'])

    def test_ai_usage_report(self):
        today = timezone.localdate()
        _, other = make_owner()
        AIUsageDay.objects.create(store=self.store, day=today, calls=7)
        AIUsageDay.objects.create(store=other, day=today, calls=3)
        AIUsageDay.objects.create(store=self.store, day=today - timedelta(days=2), calls=4)
        AIUsageDay.objects.create(store=self.store, day=today - timedelta(days=30), calls=99)
        data = self.admin_c.get(f'{BASE}/ai-usage/').data
        self.assertEqual(data['today'], 10)
        self.assertEqual(len(data['last_7_days']), 7)
        self.assertEqual(sum(d['calls'] for d in data['last_7_days']), 14)
        self.assertEqual(data['top_stores_today'][0], {'store_id': self.store.id, 'store_name': self.store.name, 'calls': 7})
        self.assertEqual(auth_client(self.owner).get(f'{BASE}/ai-usage/').status_code, 403)


class PlanAiLimitsTests(ModulesBase):
    def _plan(self, daily, weekly):
        from stores.models import SubscriptionPlan
        plan = SubscriptionPlan.objects.create(name='P', price_monthly=1, price_yearly=1, ai_daily_limit=daily, ai_weekly_limit=weekly)
        q = self.store.quota
        q.plan = plan
        q.save()
        return plan

    def test_plan_daily_limit_applies_to_the_whole_store_not_per_account(self):
        self._plan(2, 0)
        member, _m = make_team_member(self.store, 'admin')
        self.assertEqual(self._ai_chat().status_code, 200)
        self.assertEqual(self._ai_chat(auth_client(member)).status_code, 200)
        third = self._ai_chat()
        self.assertEqual((third.status_code, third.data['period']), (429, 'daily'))

    def test_plan_weekly_limit_is_rolling_and_counts_previous_days(self):
        self._plan(0, 3)
        today = timezone.localdate()
        AIUsageDay.objects.create(store=self.store, day=today - timedelta(days=3), calls=2)
        self.assertEqual(self._ai_chat().status_code, 200)
        weekly = self._ai_chat()
        self.assertEqual((weekly.status_code, weekly.data['period']), (429, 'weekly'))
        AIUsageDay.objects.filter(day=today - timedelta(days=3)).update(day=today - timedelta(days=8))
        self.assertEqual(self._ai_chat().status_code, 200)

    def test_plan_limits_override_global_and_trial_uses_global(self):
        PlatformSettings.objects.update_or_create(pk=1, defaults={'ai_daily_limit': 1})
        cache.clear()
        self.assertEqual(self._ai_chat().status_code, 200)
        self.assertEqual(self._ai_chat().status_code, 429)  # essai : plafond global
        self._plan(0, 0)  # palier illimité : le plafond global ne s'applique plus
        self.assertEqual(self._ai_chat().status_code, 200)

    def test_admin_configures_plan_limits(self):
        plan = self._plan(0, 0)
        url = f'{BASE}/plans/{plan.id}/'
        self.assertEqual(self.admin_c.put(url, {'ai_daily_limit': 5}, format='json').status_code, 403)
        self.assertEqual(self.super_c.put(url, {'ai_daily_limit': -1}, format='json').status_code, 400)
        r = self.super_c.put(url, {'ai_daily_limit': 5, 'ai_weekly_limit': 20}, format='json')
        self.assertEqual((r.data['ai_daily_limit'], r.data['ai_weekly_limit']), (5, 20))
        self.assertEqual(self.super_c.put(f'{BASE}/settings/', {'ai_weekly_limit': 30}, format='json').data['ai_weekly_limit'], 30)


class FeatureQuotaTests(ModulesBase):
    def _plan(self, quotas):
        from stores.models import SubscriptionPlan
        plan = SubscriptionPlan.objects.create(name='F', price_monthly=1, price_yearly=1, ai_quotas=quotas)
        q = self.store.quota
        q.plan = plan
        q.save()

    def test_each_feature_has_its_own_quota(self):
        self._plan({'chat': {'daily': 1, 'weekly': 0}})
        self.assertEqual(self._ai_chat().status_code, 200)
        blocked = self._ai_chat()
        self.assertEqual((blocked.status_code, blocked.data['period']), (429, 'daily'))
        self.assertIn('Assistant IA', blocked.data['feature'])
        # une autre fonctionnalité n'est pas touchée par le quota du chat
        with patch('ai_assistant.ollama_client.generate', return_value='Titre'):
            r = self.owner_c.post('/api/ai/generate-product/', {'name': 'Sac'}, format='json')
        self.assertNotEqual(r.status_code, 429)

    def test_feature_weekly_quota(self):
        self._plan({'chat': {'daily': 0, 'weekly': 2}})
        today = timezone.localdate()
        AIUsageDay.objects.create(store=self.store, day=today - timedelta(days=2), calls=1, feature='chat')
        self.assertEqual(self._ai_chat().status_code, 200)
        self.assertEqual(self._ai_chat().data['period'], 'weekly')

    def test_admin_validates_and_saves_feature_quotas(self):
        from stores.models import SubscriptionPlan
        plan = SubscriptionPlan.objects.create(name='Q', price_monthly=1, price_yearly=1)
        url = f'{BASE}/plans/{plan.id}/'
        self.assertEqual(self.super_c.put(url, {'ai_quotas': {'ghost': {'daily': 1}}}, format='json').status_code, 400)
        self.assertEqual(self.super_c.put(url, {'ai_quotas': {'chat': {'daily': -1}}}, format='json').status_code, 400)
        r = self.super_c.put(url, {'ai_quotas': {'chat': {'daily': 3, 'weekly': 9}}}, format='json')
        row = next(x for x in r.data['ai_quotas'] if x['key'] == 'chat')
        self.assertEqual((row['daily'], row['weekly']), (3, 9))
        self.assertEqual(len(r.data['ai_quotas']), 10)  # catalogue complet côté admin
        public = self.owner_c.get('/api/stores/plans/').data
        mine = next(p for p in public if p['id'] == plan.id)
        self.assertEqual([q['key'] for q in mine['ai_quotas']], ['chat'])  # seulement les limitées côté vendeur

    def test_trial_uses_global_feature_quotas_and_usage_breaks_down_by_feature(self):
        self.super_c.put(f'{BASE}/settings/', {'ai_quotas': {'chat': {'daily': 1}}}, format='json')
        cache.clear()
        self.assertEqual(self._ai_chat().status_code, 200)
        self.assertEqual(self._ai_chat().status_code, 429)
        self.assertEqual(self.admin_c.get(f'{BASE}/ai-usage/').data['today_by_feature'], {'chat': 1})
