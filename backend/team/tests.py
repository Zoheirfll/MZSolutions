from django.core import mail
from django.test import TestCase

from .models import TeamMember, RolePermission, PERMISSION_CATALOG
from core.test_utils import make_owner, make_team_member, auth_client


class InviteTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_owner_can_invite_member(self):
        client = auth_client(self.owner)
        resp = client.post('/api/team/invite/', {
            'role': 'confirmateur', 'first_name': 'C', 'last_name': 'F', 'email': 'newconf@test.com',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(TeamMember.objects.filter(email='newconf@test.com', store=self.store).exists())
        self.assertEqual(len(mail.outbox), 1)

    def test_invite_rejects_existing_email(self):
        _, _ = make_owner(email='taken@test.com')
        client = auth_client(self.owner)
        resp = client.post('/api/team/invite/', {
            'role': 'confirmateur', 'first_name': 'C', 'last_name': 'F', 'email': 'taken@test.com',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_confirmateur_cannot_invite(self):
        conf_user, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(conf_user)
        resp = client.post('/api/team/invite/', {
            'role': 'confirmateur', 'first_name': 'X', 'last_name': 'Y', 'email': 'x@test.com',
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_accept_invitation_activates_account(self):
        member = TeamMember.objects.create(
            store=self.store, role='confirmateur', first_name='C', last_name='F', email='accept@test.com',
        )
        resp = self.client.post('/api/team/accept-invitation/', {
            'token': member.invite_token, 'password': 'NewPass1234',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        member.refresh_from_db()
        self.assertTrue(member.is_active)
        self.assertIsNotNone(member.user)
        self.assertTrue(member.user.check_password('NewPass1234'))

    def test_accept_invitation_rejects_reused_token(self):
        member = TeamMember.objects.create(
            store=self.store, role='confirmateur', first_name='C', last_name='F', email='reuse@test.com',
        )
        self.client.post('/api/team/accept-invitation/', {'token': member.invite_token, 'password': 'NewPass1234'}, format='json')
        resp = self.client.post('/api/team/accept-invitation/', {'token': member.invite_token, 'password': 'AnotherPass123'}, format='json')
        self.assertEqual(resp.status_code, 400)


class InvitePermissionsTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()

    def test_invite_without_permissions_creates_no_overrides(self):
        client = auth_client(self.owner)
        resp = client.post('/api/team/invite/', {
            'role': 'confirmateur', 'first_name': 'C', 'last_name': 'F', 'email': 'noperm@test.com',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        member = TeamMember.objects.get(email='noperm@test.com')
        self.assertEqual(member.permission_overrides.count(), 0)

    def test_invite_with_permissions_creates_only_diffs_from_role_default(self):
        client = auth_client(self.owner)
        # confirmateur default: orders_view=True, finances_view=False (see DEFAULT_PERMISSIONS)
        resp = client.post('/api/team/invite/', {
            'role': 'confirmateur', 'first_name': 'C', 'last_name': 'F', 'email': 'withperm@test.com',
            'permissions': {
                'orders_view': True,     # matches default -> no override stored
                'costs_view': True,   # differs from default -> override stored
            },
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        member = TeamMember.objects.get(email='withperm@test.com')
        overrides = {o.permission: o.enabled for o in member.permission_overrides.all()}
        self.assertEqual(overrides, {'costs_view': True})

    def test_new_member_effective_permissions_include_custom_override(self):
        client = auth_client(self.owner)
        client.post('/api/team/invite/', {
            'role': 'confirmateur', 'first_name': 'C', 'last_name': 'F', 'email': 'effective@test.com',
            'permissions': {'stock_view': True},
        }, format='json')
        member = TeamMember.objects.get(email='effective@test.com')
        from .models import get_effective_permissions
        perms = get_effective_permissions(self.store, 'confirmateur', member=member)
        self.assertTrue(perms['stock_view'])


class TeamListTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        _, self.conf = make_team_member(self.store, 'confirmateur')
        _, self.drop = make_team_member(self.store, 'dropshipper')

    def test_owner_sees_all_members(self):
        client = auth_client(self.owner)
        resp = client.get('/api/team/members/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)

    def test_filter_by_role(self):
        client = auth_client(self.owner)
        resp = client.get('/api/team/members/?role=dropshipper')
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['role'], 'dropshipper')

    def test_isolated_per_store(self):
        other_owner, other_store = make_owner()
        make_team_member(other_store, 'confirmateur')
        client = auth_client(other_owner)
        resp = client.get('/api/team/members/')
        self.assertEqual(len(resp.data), 1)  # seulement le sien, pas ceux de `self.store`

    def test_delete_deactivates_not_removes(self):
        client = auth_client(self.owner)
        resp = client.delete(f'/api/team/members/{self.conf.id}/')
        self.assertEqual(resp.status_code, 204)
        self.conf.refresh_from_db()
        self.assertFalse(self.conf.is_active)


class RolePermissionsMatrixTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conf_user, self.conf = make_team_member(self.store, 'confirmateur')

    def test_owner_can_view_matrix(self):
        client = auth_client(self.owner)
        resp = client.get('/api/team/permissions/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(set(resp.data['roles']), {'admin', 'confirmateur', 'dropshipper'})
        self.assertEqual(len(resp.data['catalog']), len(PERMISSION_CATALOG))

    def test_confirmateur_cannot_view_matrix(self):
        client = auth_client(self.conf_user)
        resp = client.get('/api/team/permissions/')
        self.assertEqual(resp.status_code, 403)

    def test_toggle_permission_persists_and_takes_effect(self):
        client = auth_client(self.owner)
        resp = client.post('/api/team/permissions/', {
            'role': 'confirmateur', 'permission': 'costs_view', 'enabled': True,
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(RolePermission.objects.filter(store=self.store, role='confirmateur', permission='costs_view', enabled=True).exists())

        conf_client = auth_client(self.conf_user)
        me = conf_client.get('/api/auth/me/')
        self.assertTrue(me.data['permissions']['costs_view'])

    def test_toggle_rejects_unknown_permission(self):
        client = auth_client(self.owner)
        resp = client.post('/api/team/permissions/', {
            'role': 'confirmateur', 'permission': 'not_a_real_permission', 'enabled': True,
        }, format='json')
        self.assertEqual(resp.status_code, 400)


class TeamMemberPermissionsViewTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conf_user, self.conf = make_team_member(self.store, 'confirmateur')

    def test_owner_can_view_member_permissions(self):
        client = auth_client(self.owner)
        resp = client.get(f'/api/team/members/{self.conf.id}/permissions/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['catalog']), len(PERMISSION_CATALOG))
        entry = next(e for e in resp.data['catalog'] if e['key'] == 'orders_view')
        self.assertTrue(entry['enabled'])
        self.assertFalse(entry['is_custom'])

    def test_confirmateur_cannot_view_own_permissions_endpoint(self):
        client = auth_client(self.conf_user)
        resp = client.get(f'/api/team/members/{self.conf.id}/permissions/')
        self.assertEqual(resp.status_code, 403)

    def test_post_creates_override_and_marks_custom(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/team/members/{self.conf.id}/permissions/', {
            'permission': 'stock_view', 'enabled': True,
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['permissions']['stock_view'])

        check = client.get(f'/api/team/members/{self.conf.id}/permissions/')
        entry = next(e for e in check.data['catalog'] if e['key'] == 'stock_view')
        self.assertTrue(entry['is_custom'])

    def test_post_upserts_same_permission_twice(self):
        client = auth_client(self.owner)
        client.post(f'/api/team/members/{self.conf.id}/permissions/', {'permission': 'stock_view', 'enabled': True}, format='json')
        resp = client.post(f'/api/team/members/{self.conf.id}/permissions/', {'permission': 'stock_view', 'enabled': False}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['permissions']['stock_view'])
        from .models import TeamMemberPermission
        self.assertEqual(TeamMemberPermission.objects.filter(member=self.conf, permission='stock_view').count(), 1)

    def test_post_rejects_unknown_permission(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/team/members/{self.conf.id}/permissions/', {
            'permission': 'not_a_real_permission', 'enabled': True,
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_member_override_does_not_leak_to_role_matrix(self):
        client = auth_client(self.owner)
        client.post(f'/api/team/members/{self.conf.id}/permissions/', {'permission': 'stock_view', 'enabled': True}, format='json')
        matrix = client.get('/api/team/permissions/')
        self.assertFalse(matrix.data['matrix']['confirmateur']['stock_view'])


from .models import TeamMemberPermission, get_effective_permissions


class EffectivePermissionsCascadeTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conf_user, self.conf = make_team_member(self.store, 'confirmateur')

    def test_defaults_to_role_default_with_no_overrides(self):
        perms = get_effective_permissions(self.store, 'confirmateur', member=self.conf)
        self.assertFalse(perms['costs_view'])
        self.assertTrue(perms['orders_view'])

    def test_role_override_applies_when_no_member_override(self):
        RolePermission.objects.create(store=self.store, role='confirmateur', permission='costs_view', enabled=True)
        perms = get_effective_permissions(self.store, 'confirmateur', member=self.conf)
        self.assertTrue(perms['costs_view'])

    def test_member_override_wins_over_role_override(self):
        RolePermission.objects.create(store=self.store, role='confirmateur', permission='costs_view', enabled=True)
        TeamMemberPermission.objects.create(member=self.conf, permission='costs_view', enabled=False)
        perms = get_effective_permissions(self.store, 'confirmateur', member=self.conf)
        self.assertFalse(perms['costs_view'])

    def test_member_override_isolated_from_other_members_same_role(self):
        _, other_conf = make_team_member(self.store, 'confirmateur')
        TeamMemberPermission.objects.create(member=self.conf, permission='stock_view', enabled=True)
        perms_conf  = get_effective_permissions(self.store, 'confirmateur', member=self.conf)
        perms_other = get_effective_permissions(self.store, 'confirmateur', member=other_conf)
        self.assertTrue(perms_conf['stock_view'])
        self.assertFalse(perms_other['stock_view'])

    def test_no_member_arg_behaves_like_role_only(self):
        perms = get_effective_permissions(self.store, 'confirmateur')
        self.assertFalse(perms['costs_view'])

    def test_member_override_reflected_in_auth_me(self):
        from .models import TeamMemberPermission
        TeamMemberPermission.objects.create(member=self.conf, permission='costs_view', enabled=True)
        client = auth_client(self.conf_user)
        resp = client.get('/api/auth/me/')
        self.assertTrue(resp.data['permissions']['costs_view'])


class OnlineStatusTests(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conf_user, self.conf = make_team_member(self.store, 'confirmateur')

    def test_confirmateur_can_toggle_own_status(self):
        client = auth_client(self.conf_user)
        resp = client.post('/api/team/online-status/', {'online': True}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.conf.refresh_from_db()
        self.assertTrue(self.conf.is_online)
        self.assertIsNotNone(self.conf.last_seen_at)

        resp = client.post('/api/team/online-status/', {'online': False}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.conf.refresh_from_db()
        self.assertFalse(self.conf.is_online)

    def test_heartbeat_without_online_key_only_updates_last_seen(self):
        self.conf.is_online = True
        self.conf.save(update_fields=['is_online'])
        client = auth_client(self.conf_user)
        resp = client.post('/api/team/online-status/', {}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.conf.refresh_from_db()
        self.assertTrue(self.conf.is_online)
        self.assertIsNotNone(self.conf.last_seen_at)

    def test_owner_without_team_membership_rejected(self):
        client = auth_client(self.owner)
        resp = client.post('/api/team/online-status/', {'online': True}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_stale_heartbeat_treated_as_offline(self):
        from datetime import timedelta
        from django.utils import timezone
        from team.models import online_confirmateurs_queryset
        self.conf.is_online = True
        self.conf.last_seen_at = timezone.now() - timedelta(minutes=10)
        self.conf.save(update_fields=['is_online', 'last_seen_at'])
        self.assertFalse(self.conf.is_currently_online)
        self.assertNotIn(self.conf, list(online_confirmateurs_queryset(self.store)))


class ConfirmateurMonitoringEngineTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        _, self.conf = make_team_member(self.store, 'confirmateur')

    def _make_order(self, status, days_ago=1, assign=True):
        from django.utils import timezone
        from orders.models import Order, OrderAssignment
        o = Order.objects.create(
            store=self.store, first_name='C', last_name='L', phone='0555000000',
            wilaya='Alger', commune='Alger Centre', address='Adr', status=status,
            subtotal=1000, shipping_cost=0, total=1000,
        )
        o.created_at = timezone.now() - timezone.timedelta(days=days_ago)
        o.save(update_fields=['created_at'])
        if assign:
            OrderAssignment.objects.create(order=o, confirmateur=self.conf)
        return o

    def test_confirmation_rate_uses_processed_denominator(self):
        from team.monitoring import compute_confirmateur_detail
        self._make_order('confirmed')
        self._make_order('confirmed')
        self._make_order('cancelled')
        self._make_order('pending')  # non traitée, exclue du dénominateur
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertAlmostEqual(detail['confirmation_rate'], 66.7, delta=0.5)

    def test_score_none_without_processed_orders(self):
        from team.monitoring import compute_confirmateur_detail
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertIsNone(detail['score'])

    def test_late_ratio_computed_on_pending_only(self):
        from django.utils import timezone
        from team.monitoring import compute_confirmateur_detail
        late = self._make_order('pending')
        late.created_at = timezone.now() - timezone.timedelta(hours=48)
        late.save(update_fields=['created_at'])
        recent = self._make_order('pending')
        recent.created_at = timezone.now() - timezone.timedelta(hours=1)
        recent.save(update_fields=['created_at'])
        self._make_order('confirmed')
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertAlmostEqual(detail['late_ratio'], 0.5, delta=0.01)

    def test_call_failure_rate(self):
        from orders.models import CallAttempt, FailureReason
        from team.monitoring import compute_confirmateur_detail
        o = self._make_order('confirmed')
        reason = FailureReason.objects.create(store=self.store, label='Injoignable')
        CallAttempt.objects.create(order=o, agent=self.conf, status='no_answer', failure_reason=reason)
        CallAttempt.objects.create(order=o, agent=self.conf, status='answered')
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertAlmostEqual(detail['call_failure_rate'], 0.5, delta=0.01)

    def test_cancellation_return_rate(self):
        from team.monitoring import compute_confirmateur_detail
        self._make_order('confirmed')
        self._make_order('cancelled')
        self._make_order('returned')
        self._make_order('delivered')
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertAlmostEqual(detail['cancellation_return_rate'], 50.0, delta=0.5)

    def test_flag_inactive_online_without_recent_audit_log(self):
        from team.monitoring import compute_confirmateur_detail
        self.conf.is_online = True
        self.conf.last_seen_at = None
        self.conf.save(update_fields=['is_online'])
        self._make_order('confirmed')
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertIn('inactive_online', detail['flags'])

    def test_flag_high_late_ratio(self):
        from django.utils import timezone
        from team.monitoring import compute_confirmateur_detail
        for _ in range(3):
            late = self._make_order('pending')
            late.created_at = timezone.now() - timezone.timedelta(hours=48)
            late.save(update_fields=['created_at'])
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertIn('high_late_ratio', detail['flags'])

    def test_flag_high_cancellation_requires_minimum_five_orders(self):
        from team.monitoring import compute_confirmateur_detail
        self._make_order('cancelled')
        self._make_order('cancelled')
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertNotIn('high_cancellation', detail['flags'])

    def test_flag_high_cancellation_triggers_above_team_average(self):
        from team.monitoring import compute_confirmateur_detail
        _, conf2 = make_team_member(self.store, 'confirmateur', email='conf2@test.com')
        from orders.models import Order, OrderAssignment
        for _ in range(5):
            o = Order.objects.create(store=self.store, first_name='C', last_name='L', phone='0555000001',
                                      wilaya='Alger', commune='Alger Centre', address='Adr', status='confirmed',
                                      subtotal=1000, shipping_cost=0, total=1000)
            OrderAssignment.objects.create(order=o, confirmateur=conf2)
        for _ in range(5):
            self._make_order('cancelled')
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertIn('high_cancellation', detail['flags'])

    def test_flag_low_throughput_requires_at_least_two_confirmateurs(self):
        from team.monitoring import compute_confirmateur_detail
        self._make_order('confirmed')
        detail = compute_confirmateur_detail(self.store, self.conf)
        self.assertNotIn('low_throughput', detail['flags'])

    def test_compute_team_overview_lists_all_confirmateurs(self):
        from team.monitoring import compute_team_overview
        _, conf2 = make_team_member(self.store, 'confirmateur', email='conf2@test.com')
        self._make_order('confirmed')
        overview = compute_team_overview(self.store)
        member_ids = [r['member_id'] for r in overview]
        self.assertIn(self.conf.id, member_ids)
        self.assertIn(conf2.id, member_ids)
