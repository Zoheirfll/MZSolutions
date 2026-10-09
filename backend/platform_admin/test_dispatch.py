from datetime import timedelta

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from core.test_utils import clear_throttle_cache, make_owner
from orders.models import Order

from . import dispatch
from .dispatch_algorithms import ALGORITHMS, Signals, score
from .dispatch_models import ALGORITHM_KEYS, PlatformDispatchConfig, PlatformOrderFlow
from .models import PlatformConfirmationAccount, PlatformConfirmateurAssignment, PlatformOrderAssignment
from .routing import route_order
from .tests import make_active_confirmateur


def sig(**kw):
    base = dict(age_min=0, attempts=0, since_last_min=0, overdue_min=0, store_rate=50, amount=0, risk=50)
    return Signals(**{**base, **kw})


class AlgorithmTests(SimpleTestCase):
    def test_there_are_ten_algorithms_and_all_scores_stay_in_range(self):
        self.assertEqual(len(ALGORITHMS), 10)
        self.assertEqual(set(ALGORITHMS), set(ALGORITHM_KEYS))
        extreme = sig(age_min=10**6, attempts=50, since_last_min=10**6, overdue_min=10**6,
                      store_rate=500, amount=10**9, risk=-40)
        for key in ALGORITHMS:
            for s in (sig(), extreme):
                self.assertTrue(0 <= score(key, s) <= 100, key)

    def test_unknown_algorithm_falls_back_to_fifo(self):
        self.assertEqual(score('nope', sig(age_min=720)), score('fifo', sig(age_min=720)))

    def test_fifo_prefers_oldest_and_newest_prefers_youngest(self):
        old, young = sig(age_min=600), sig(age_min=10)
        self.assertGreater(score('fifo', old), score('fifo', young))
        self.assertGreater(score('newest', young), score('newest', old))

    def test_persistence_prefers_three_or_more_no_answers(self):
        self.assertGreater(score('persistence', sig(attempts=3)), score('persistence', sig(attempts=2)))
        self.assertGreater(score('persistence', sig(attempts=5)), score('persistence', sig(attempts=3)))

    def test_overdue_prefers_late_waiting_orders_over_fresh_ones(self):
        self.assertGreater(score('overdue', sig(attempts=1, overdue_min=30)), score('overdue', sig(attempts=0)))
        self.assertGreater(score('overdue', sig(attempts=1, overdue_min=60)), score('overdue', sig(attempts=1, overdue_min=5)))

    def test_longest_idle_prefers_longest_since_last_call(self):
        self.assertGreater(score('longest_idle', sig(since_last_min=900)), score('longest_idle', sig(since_last_min=30)))

    def test_store_rate_algorithms_are_opposite(self):
        low, high = sig(store_rate=20), sig(store_rate=80)
        self.assertGreater(score('low_rate_stores', low), score('low_rate_stores', high))
        self.assertGreater(score('high_rate_stores', high), score('high_rate_stores', low))

    def test_high_value_and_quick_wins(self):
        self.assertGreater(score('high_value', sig(amount=15000)), score('high_value', sig(amount=1000)))
        self.assertGreater(score('quick_wins', sig(risk=5)), score('quick_wins', sig(risk=90)))

    def test_balanced_combines_signals_and_respects_weights(self):
        hot = sig(age_min=1000, attempts=4, store_rate=10, amount=18000, risk=5, overdue_min=60)
        cold = sig()
        self.assertGreater(score('balanced', hot), score('balanced', cold))
        only_amount = {'age': 0, 'attempts': 0, 'low_rate': 0, 'amount': 1, 'quick_win': 0, 'overdue': 0}
        self.assertEqual(score('balanced', sig(amount=10000), only_amount), score('high_value', sig(amount=10000)))


class DispatchBase(TestCase):
    def setUp(self):
        clear_throttle_cache()
        self.owner, self.store = make_owner()
        self.account = PlatformConfirmationAccount.objects.create(store=self.store, is_active=True, mode='replace')
        self.now = timezone.now()
        self.soon = self.now + timedelta(minutes=1)  # marge : les flux sont créés après setUp

    def order(self, phone='0555000000', **kw):
        return Order.objects.create(store=self.store, first_name='Client', phone=phone, wilaya='Alger', **kw)

    def flow_of(self, order):
        return PlatformOrderFlow.objects.get(order=order)

    def kinds(self, flow):
        return list(flow.events.values_list('kind', flat=True))


class FlowStartTests(DispatchBase):
    def test_new_order_enters_flow_and_is_assigned(self):
        c = make_active_confirmateur(self.store, self.account)
        order = self.order()
        self.assertTrue(route_order(order))
        flow = self.flow_of(order)
        self.assertEqual(flow.state, 'assigned')
        self.assertEqual(flow.confirmateur, c)
        self.assertEqual(order.platform_assignment.confirmateur, c)
        self.assertEqual(self.kinds(flow), ['created', 'assigned'])

    def test_without_confirmateur_the_order_waits_unassigned(self):
        order = self.order()
        route_order(order)
        flow = self.flow_of(order)
        self.assertEqual(flow.state, 'waiting')
        self.assertFalse(PlatformOrderAssignment.objects.filter(order=order).exists())

    def test_start_flow_is_idempotent(self):
        order = self.order()
        dispatch.start_flow(order)
        dispatch.start_flow(order)
        self.assertEqual(PlatformOrderFlow.objects.filter(order=order).count(), 1)

    def test_order_status_is_never_modified(self):
        make_active_confirmateur(self.store, self.account)
        order = self.order()
        route_order(order)
        order.refresh_from_db()
        self.assertEqual(order.status, 'pending')

    def test_waiting_order_is_picked_up_once_a_confirmateur_is_available(self):
        order = self.order()
        route_order(order)
        make_active_confirmateur(self.store, self.account)
        self.assertEqual(dispatch.fill_slots(self.soon), 1)
        self.assertEqual(self.flow_of(order).state, 'assigned')

    def test_inactive_service_account_blocks_dispatch(self):
        make_active_confirmateur(self.store, self.account)
        order = self.order()
        dispatch.start_flow(order)
        PlatformConfirmationAccount.objects.filter(pk=self.account.pk).update(is_active=False)
        self.assertEqual(dispatch.fill_slots(self.soon), 0)


class CapacityAndRankingTests(DispatchBase):
    def test_capacity_limits_open_orders_per_confirmateur(self):
        make_active_confirmateur(self.store, self.account)
        PlatformDispatchConfig.objects.create(store=None, max_open=1)
        o1, o2 = self.order('0555000001'), self.order('0555000002')
        route_order(o1)
        route_order(o2)
        self.assertEqual(self.flow_of(o1).state, 'assigned')
        self.assertEqual(self.flow_of(o2).state, 'waiting')

    def test_finishing_an_order_frees_a_slot_for_the_next_one(self):
        make_active_confirmateur(self.store, self.account)
        PlatformDispatchConfig.objects.create(store=None, max_open=1)
        o1, o2 = self.order('0555000001'), self.order('0555000002')
        route_order(o1)
        route_order(o2)
        dispatch.finish_flow(o1, 'confirmed', now=self.soon)
        self.assertEqual(self.flow_of(o1).state, 'done')
        self.assertEqual(self.flow_of(o2).state, 'assigned')

    def test_least_loaded_confirmateur_gets_the_next_order(self):
        c1 = make_active_confirmateur(self.store, self.account)
        c2 = make_active_confirmateur(self.store, self.account)
        orders = [self.order(f'05550000{i:02d}') for i in range(3)]
        for o in orders:
            route_order(o)
        owners = [self.flow_of(o).confirmateur_id for o in orders]
        self.assertEqual(owners[0], owners[2])
        self.assertNotEqual(owners[0], owners[1])
        self.assertEqual({owners[0], owners[1]}, {c1.id, c2.id})

    def test_algorithm_decides_which_waiting_order_goes_first(self):
        PlatformDispatchConfig.objects.create(store=None, algorithm='persistence', max_open=1)
        calm, stubborn = self.order('0555000001'), self.order('0555000002')
        dispatch.start_flow(calm)
        dispatch.start_flow(stubborn)
        PlatformOrderFlow.objects.filter(order=stubborn).update(attempts=3, last_attempt_at=self.now - timedelta(hours=1))
        c = make_active_confirmateur(self.store, self.account)
        self.assertEqual(dispatch.fill_slots(self.soon), 1)
        self.assertEqual(self.flow_of(stubborn).state, 'assigned')
        self.assertEqual(self.flow_of(stubborn).confirmateur, c)
        self.assertEqual(self.flow_of(calm).state, 'waiting')

    def test_fifo_default_serves_the_oldest_first(self):
        PlatformDispatchConfig.objects.create(store=None, max_open=1)
        first, second = self.order('0555000001'), self.order('0555000002')
        Order.objects.filter(pk=first.pk).update(created_at=self.now - timedelta(hours=5))
        dispatch.start_flow(second)
        dispatch.start_flow(first)
        make_active_confirmateur(self.store, self.account)
        dispatch.fill_slots(self.soon)
        self.assertEqual(self.flow_of(first).state, 'assigned')
        self.assertEqual(self.flow_of(second).state, 'waiting')

    def test_orders_not_yet_available_are_skipped(self):
        make_active_confirmateur(self.store, self.account)
        order = self.order()
        flow = dispatch.start_flow(order)
        PlatformOrderFlow.objects.filter(pk=flow.pk).update(available_at=self.now + timedelta(minutes=20))
        self.assertEqual(dispatch.fill_slots(self.soon), 0)
        self.assertEqual(dispatch.fill_slots(self.now + timedelta(minutes=21)), 1)


class ConfigResolutionTests(DispatchBase):
    def test_default_when_nothing_configured(self):
        cfg = dispatch.resolve_config(self.store, self.now)
        self.assertEqual((cfg.algorithm, cfg.review_after, cfg.fail_after_review, cfg.max_open), ('fifo', 4, 4, 5))
        self.assertEqual(cfg.wait_minutes, [30, 40, 50, 60])

    def test_store_beats_site_and_date_beats_weekday_beats_plain(self):
        local = timezone.localtime(self.now)
        PlatformDispatchConfig.objects.create(store=None, algorithm='newest')
        self.assertEqual(dispatch.resolve_config(self.store, self.now).algorithm, 'newest')
        PlatformDispatchConfig.objects.create(store=None, weekday=local.weekday(), algorithm='high_value')
        self.assertEqual(dispatch.resolve_config(self.store, self.now).algorithm, 'high_value')
        PlatformDispatchConfig.objects.create(store=None, date=local.date(), algorithm='quick_wins')
        self.assertEqual(dispatch.resolve_config(self.store, self.now).algorithm, 'quick_wins')
        PlatformDispatchConfig.objects.create(store=self.store, algorithm='overdue')
        self.assertEqual(dispatch.resolve_config(self.store, self.now).algorithm, 'overdue')
        PlatformDispatchConfig.objects.create(store=self.store, weekday=local.weekday(), algorithm='balanced')
        self.assertEqual(dispatch.resolve_config(self.store, self.now).algorithm, 'balanced')
        PlatformDispatchConfig.objects.create(store=self.store, date=local.date(), algorithm='persistence')
        self.assertEqual(dispatch.resolve_config(self.store, self.now).algorithm, 'persistence')

    def test_other_day_and_other_store_do_not_apply(self):
        local = timezone.localtime(self.now)
        other_owner, other_store = make_owner()
        PlatformDispatchConfig.objects.create(store=other_store, algorithm='high_value')
        PlatformDispatchConfig.objects.create(store=None, weekday=(local.weekday() + 1) % 7, algorithm='newest')
        PlatformDispatchConfig.objects.create(store=None, date=local.date() + timedelta(days=1), algorithm='overdue')
        self.assertEqual(dispatch.resolve_config(self.store, self.now).algorithm, 'fifo')


class AttemptTests(DispatchBase):
    def setUp(self):
        super().setUp()
        self.c1 = make_active_confirmateur(self.store, self.account)
        self.order_obj = self.order()
        route_order(self.order_obj)

    def fail_once(self, confirmateur, when, outcome='no_answer'):
        return dispatch.record_attempt(self.order_obj, confirmateur, outcome, now=when)

    def test_no_answer_sends_the_order_back_to_waiting_for_30_minutes(self):
        flow = self.fail_once(self.c1, self.now)
        flow.refresh_from_db()
        self.assertEqual((flow.state, flow.attempts), ('waiting', 1))
        self.assertEqual(flow.available_at, self.now + timedelta(minutes=30))
        self.assertFalse(PlatformOrderAssignment.objects.filter(order=self.order_obj).exists())
        self.assertEqual(self.kinds(flow), ['created', 'assigned', 'attempt', 'requeued'])

    def test_wait_grows_30_then_40_then_50_then_60_and_stays_at_60(self):
        waits = []
        when = self.now
        for _ in range(4):
            flow = self.fail_once(self.c1, when)
            flow.refresh_from_db()
            waits.append(round((flow.available_at - when).total_seconds() / 60))
            when = flow.available_at + timedelta(seconds=1)
            dispatch.fill_slots(when)
        self.assertEqual(waits, [30, 40, 50, 60])

    def test_the_retry_goes_to_another_confirmateur_when_one_exists(self):
        c2 = make_active_confirmateur(self.store, self.account)
        self.fail_once(self.c1, self.now)
        later = self.now + timedelta(minutes=31)
        dispatch.fill_slots(later)
        self.assertEqual(self.flow_of(self.order_obj).confirmateur, c2)

    def test_same_confirmateur_is_reused_when_he_is_the_only_one(self):
        self.fail_once(self.c1, self.now)
        dispatch.fill_slots(self.now + timedelta(minutes=31))
        self.assertEqual(self.flow_of(self.order_obj).confirmateur, self.c1)

    def test_admin_is_alerted_at_the_fourth_failed_call_only(self):
        when = self.now
        for i in range(1, 5):
            flow = self.fail_once(self.c1, when)
            flow.refresh_from_db()
            if i < 4:
                self.assertIsNone(flow.admin_flagged_at)
            when = flow.available_at + timedelta(seconds=1)
            dispatch.fill_slots(when)
        flow = self.flow_of(self.order_obj)
        self.assertIsNotNone(flow.admin_flagged_at)
        self.assertEqual(self.kinds(flow).count('escalated'), 1)
        self.assertIn(flow.state, ('waiting', 'assigned'))

    def test_eighth_failed_call_is_a_final_failure_and_status_is_untouched(self):
        when = self.now
        for _ in range(8):
            flow = self.fail_once(self.c1, when)
            flow.refresh_from_db()
            if flow.state == 'failed':
                break
            when = flow.available_at + timedelta(seconds=1)
            dispatch.fill_slots(when)
        flow.refresh_from_db()
        self.assertEqual((flow.state, flow.attempts), ('failed', 8))
        self.assertIsNotNone(flow.failed_at)
        self.assertFalse(PlatformOrderAssignment.objects.filter(order=self.order_obj).exists())
        self.order_obj.refresh_from_db()
        self.assertEqual(self.order_obj.status, 'pending')
        self.assertEqual(self.kinds(flow).count('attempt'), 8)
        self.assertEqual(self.kinds(flow)[-1], 'failed')
        self.assertEqual(dispatch.fill_slots(when + timedelta(days=2)), 0)

    def test_thresholds_are_configurable(self):
        PlatformDispatchConfig.objects.create(store=None, review_after=1, fail_after_review=1, wait_minutes=[5])
        flow = self.fail_once(self.c1, self.now)
        flow.refresh_from_db()
        self.assertIsNotNone(flow.admin_flagged_at)
        self.assertEqual(flow.available_at, self.now + timedelta(minutes=5))
        dispatch.fill_slots(flow.available_at + timedelta(seconds=1))
        flow = self.fail_once(self.c1, self.now + timedelta(hours=1))
        flow.refresh_from_db()
        self.assertEqual(flow.state, 'failed')

    def test_callback_does_not_count_as_a_failed_call(self):
        flow = self.fail_once(self.c1, self.now, outcome='callback')
        flow.refresh_from_db()
        self.assertEqual((flow.state, flow.attempts), ('waiting', 0))
        self.assertEqual(flow.available_at, self.now + timedelta(minutes=60))

    def test_callback_honours_the_requested_time(self):
        target = self.now + timedelta(hours=3)
        flow = dispatch.record_attempt(self.order_obj, self.c1, 'callback', callback_at=target, now=self.now)
        flow.refresh_from_db()
        self.assertEqual(flow.available_at, target)

    def test_every_failure_outcome_is_accepted(self):
        for i, outcome in enumerate(('no_answer', 'unreachable', 'busy')):
            order = self.order(f'066600000{i}')
            route_order(order)
            flow = dispatch.record_attempt(order, self.c1, outcome, now=self.now)
            self.assertEqual(flow.attempts, 1)

    def test_invalid_outcome_and_wrong_confirmateur_are_refused(self):
        with self.assertRaises(dispatch.DispatchError):
            dispatch.record_attempt(self.order_obj, self.c1, 'whatever', now=self.now)
        other = make_active_confirmateur(self.store, self.account)
        with self.assertRaises(dispatch.DispatchError):
            dispatch.record_attempt(self.order_obj, other, 'no_answer', now=self.now)

    def test_event_trail_keeps_who_when_and_why(self):
        self.fail_once(self.c1, self.now)
        attempt = self.flow_of(self.order_obj).events.get(kind='attempt')
        self.assertEqual(attempt.confirmateur_id, self.c1.id)
        self.assertEqual(attempt.outcome, 'no_answer')
        requeued = self.flow_of(self.order_obj).events.get(kind='requeued')
        self.assertEqual(requeued.detail['wait_minutes'], 30)


class ClosureTests(DispatchBase):
    def test_finish_flow_ignores_still_open_statuses(self):
        make_active_confirmateur(self.store, self.account)
        order = self.order()
        route_order(order)
        self.assertIsNone(dispatch.finish_flow(order, 'no_answer_1'))
        self.assertEqual(self.flow_of(order).state, 'assigned')

    def test_finish_flow_closes_on_confirmation(self):
        make_active_confirmateur(self.store, self.account)
        order = self.order()
        route_order(order)
        dispatch.finish_flow(order, 'confirmed', now=self.soon)
        flow = self.flow_of(order)
        self.assertEqual(flow.state, 'done')
        self.assertEqual(flow.events.get(kind='done').detail['status'], 'confirmed')

    def test_close_stale_flows_catches_orders_handled_elsewhere(self):
        make_active_confirmateur(self.store, self.account)
        order = self.order()
        route_order(order)
        Order.objects.filter(pk=order.pk).update(status='cancelled')
        self.assertEqual(dispatch.run_cycle(self.soon)['closed'], 1)
        self.assertEqual(self.flow_of(order).state, 'done')

    def test_run_cycle_assigns_waiting_orders(self):
        order = self.order()
        route_order(order)
        make_active_confirmateur(self.store, self.account)
        self.assertEqual(dispatch.run_cycle(self.soon)['assigned'], 1)
        self.assertEqual(self.flow_of(order).state, 'assigned')


class StoreRateTests(DispatchBase):
    def test_rate_is_neutral_with_too_few_orders_then_computed(self):
        self.assertEqual(dispatch.store_confirmation_rate(self.store.id, self.now, {}), 50.0)
        for i in range(8):
            self.order(f'07{i:08d}', status='confirmed')
        for i in range(2):
            self.order(f'08{i:08d}', status='cancelled')
        self.assertEqual(dispatch.store_confirmation_rate(self.store.id, self.now, {}), 80.0)

    def test_assignment_row_is_removed_when_unassigned_and_recreated_on_retry(self):
        c = make_active_confirmateur(self.store, self.account)
        order = self.order()
        route_order(order)
        dispatch.record_attempt(order, c, 'no_answer', now=self.now)
        self.assertFalse(PlatformOrderAssignment.objects.filter(order=order).exists())
        dispatch.fill_slots(self.now + timedelta(minutes=31))
        self.assertTrue(PlatformOrderAssignment.objects.filter(order=order, confirmateur=c).exists())
        self.assertEqual(PlatformConfirmateurAssignment.objects.filter(confirmateur=c).count(), 1)
