"""Suivi de performance et détection d'anomalie pour les confirmateurs —
calcul DÉTERMINISTE pur, aucun appel réseau, aucun appel IA.
Voir docs/superpowers/specs/2026-09-11-suivi-confirmateurs-design.md."""
from datetime import timedelta

from django.utils import timezone

from orders.views import _PROCESSED_STATUSES_FOR_CHOICES

WINDOW_DAYS = 30
LATE_PENDING_HOURS = 24
INACTIVE_ONLINE_DAYS = 7
MIN_ORDERS_FOR_CANCELLATION_FLAG = 5
MIN_CONFIRMATEURS_FOR_THROUGHPUT_FLAG = 2
CONFIRMED_STATUSES = ['confirmed', 'shipped', 'delivered']


def _clamp(value):
    return max(0, min(100, round(value)))


def _raw_metrics(store, member, since):
    from orders.models import Order, CallAttempt

    assigned_qs = Order.objects.filter(store=store, assignment__confirmateur=member, created_at__gte=since)
    processed_qs = assigned_qs.filter(status__in=_PROCESSED_STATUSES_FOR_CHOICES)
    processed = processed_qs.count()
    confirmed = processed_qs.filter(status__in=CONFIRMED_STATUSES).count()
    cancelled_returned = processed_qs.filter(status__in=['cancelled', 'returned']).count()

    pending_qs = assigned_qs.filter(status='pending')
    pending_total = pending_qs.count()
    late_cutoff = timezone.now() - timedelta(hours=LATE_PENDING_HOURS)
    late_pending = pending_qs.filter(created_at__lte=late_cutoff).count()

    calls_qs = CallAttempt.objects.filter(agent=member, attempted_at__gte=since)
    calls_total = calls_qs.count()
    calls_failed = calls_qs.filter(failure_reason__isnull=False).count()

    return {
        'orders_assigned': processed,
        'confirmation_rate': round(confirmed / processed * 100, 1) if processed else None,
        'cancellation_return_rate': round(cancelled_returned / processed * 100, 1) if processed else None,
        'late_ratio': round(late_pending / pending_total, 3) if pending_total else 0.0,
        'call_failure_rate': round(calls_failed / calls_total, 3) if calls_total else 0.0,
    }


def _score(metrics):
    if metrics['confirmation_rate'] is None:
        return None
    value = metrics['confirmation_rate'] - metrics['late_ratio'] * 30 - metrics['call_failure_rate'] * 20
    return _clamp(value)


def _has_recent_audit_activity(member, since):
    from audit.models import AuditLog
    if not member.user_id:
        return False
    return AuditLog.objects.filter(actor=member.user, created_at__gte=since).exists()


def _compute_flags(member, metrics, team_avg_cancellation, team_avg_orders, confirmateur_count):
    flags = []
    inactive_since = timezone.now() - timedelta(days=INACTIVE_ONLINE_DAYS)
    if member.is_online and not _has_recent_audit_activity(member, inactive_since):
        flags.append('inactive_online')

    if metrics['late_ratio'] > 0.5:
        flags.append('high_late_ratio')

    if (metrics['orders_assigned'] >= MIN_ORDERS_FOR_CANCELLATION_FLAG and team_avg_cancellation is not None
            and metrics['cancellation_return_rate'] is not None
            and metrics['cancellation_return_rate'] >= team_avg_cancellation * 1.5):
        flags.append('high_cancellation')

    if (confirmateur_count >= MIN_CONFIRMATEURS_FOR_THROUGHPUT_FLAG and team_avg_orders
            and metrics['orders_assigned'] < team_avg_orders * 0.5):
        flags.append('low_throughput')

    return flags


def _active_confirmateurs(store):
    return list(store.team_members.filter(role='confirmateur', is_active=True))


def _team_averages(store, since):
    members = _active_confirmateurs(store)
    all_metrics = [_raw_metrics(store, m, since) for m in members]
    cancellation_values = [m['cancellation_return_rate'] for m in all_metrics
                            if m['orders_assigned'] >= MIN_ORDERS_FOR_CANCELLATION_FLAG and m['cancellation_return_rate'] is not None]
    orders_values = [m['orders_assigned'] for m in all_metrics]
    avg_cancellation = sum(cancellation_values) / len(cancellation_values) if cancellation_values else None
    avg_orders = sum(orders_values) / len(orders_values) if orders_values else None
    return avg_cancellation, avg_orders, len(members)


def compute_confirmateur_detail(store, member):
    since = timezone.now() - timedelta(days=WINDOW_DAYS)
    metrics = _raw_metrics(store, member, since)
    team_avg_cancellation, team_avg_orders, confirmateur_count = _team_averages(store, since)
    flags = _compute_flags(member, metrics, team_avg_cancellation, team_avg_orders, confirmateur_count)
    return {
        'member_id': member.id,
        'name': f"{member.first_name} {member.last_name}".strip(),
        'score': _score(metrics),
        'flags': flags,
        **metrics,
    }


def compute_team_overview(store):
    since = timezone.now() - timedelta(days=WINDOW_DAYS)
    members = _active_confirmateurs(store)
    team_avg_cancellation, team_avg_orders, confirmateur_count = _team_averages(store, since)
    results = []
    for member in members:
        metrics = _raw_metrics(store, member, since)
        flags = _compute_flags(member, metrics, team_avg_cancellation, team_avg_orders, confirmateur_count)
        results.append({
            'member_id': member.id,
            'name': f"{member.first_name} {member.last_name}".strip(),
            'score': _score(metrics),
            'orders_assigned': metrics['orders_assigned'],
            'flags': flags,
        })
    return results
