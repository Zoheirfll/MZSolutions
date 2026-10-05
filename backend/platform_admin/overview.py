"""KPI de la vue d'ensemble admin — agrégats SQL, jamais de boucle par boutique."""
from datetime import timedelta

from django.db.models import Sum, Count, F
from django.db.models.functions import TruncMonth
from django.utils import timezone

from orders.models import Order
from stores.models import Store, SubscriptionQuota, SubscriptionPayment
from .system_models import ErrorEvent
from .communication_models import ContactMessage

TRIAL_ALERT_DAYS = 3
QUOTA_ALERT_RATIO = 0.8
PAYMENT_STUCK_HOURS = 1


def _month_keys(now, n=12):
    year, month = now.year, now.month
    keys = []
    for _ in range(n):
        keys.append(f'{year:04d}-{month:02d}')
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(keys))


def _series(now, qs, date_field, value):
    """Série 12 mois (du plus ancien au plus récent), mois sans donnée = 0."""
    keys = _month_keys(now)
    first = keys[0]
    start = now.replace(year=int(first[:4]), month=int(first[5:]), day=1, hour=0, minute=0, second=0, microsecond=0)
    rows = (qs.filter(**{f'{date_field}__gte': start})
              .annotate(m=TruncMonth(date_field)).values('m').annotate(v=value))
    by_month = {r['m'].strftime('%Y-%m'): r['v'] or 0 for r in rows}
    return [{'month': k, 'value': by_month.get(k, 0)} for k in keys]


def compute_overview(now=None):
    now = now or timezone.now()
    active_quotas = SubscriptionQuota.objects.filter(store__is_active=True)

    total = Store.objects.count()
    suspended = Store.objects.filter(is_active=False).count()
    subscribed = active_quotas.filter(plan__isnull=False, period_end__gt=now).count()
    trial = active_quotas.filter(plan__isnull=True, trial_ends_at__gt=now).count()
    expired = max(0, (total - suspended) - subscribed - trial)

    paid = SubscriptionPayment.objects.filter(status='success')
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    this_month = paid.filter(created_at__gte=month_start).aggregate(s=Sum('amount'))['s'] or 0

    trials_expiring = list(active_quotas.filter(
        plan__isnull=True, trial_ends_at__gt=now, trial_ends_at__lte=now + timedelta(days=TRIAL_ALERT_DAYS),
    ).values_list('store_id', flat=True))
    quota_high = list(active_quotas.filter(orders_limit__gt=0, orders_used__gte=F('orders_limit') * QUOTA_ALERT_RATIO)
                      .values_list('store_id', flat=True))
    stuck = list(SubscriptionPayment.objects.filter(
        status='pending', created_at__lte=now - timedelta(hours=PAYMENT_STUCK_HOURS)).values_list('id', flat=True))

    return {
        'stores': {'total': total, 'trial': trial, 'subscribed': subscribed, 'expired': expired, 'suspended': suspended},
        'revenue': {
            'this_month': this_month,
            'pending': SubscriptionPayment.objects.filter(status='pending').count(),
            'failed': SubscriptionPayment.objects.filter(status='failed').count(),
            'series': _series(now, paid, 'created_at', Sum('amount')),
        },
        'activity': {
            'orders_30d': Order.objects.filter(created_at__gte=now - timedelta(days=30)).count(),
            'orders_series': _series(now, Order.objects.all(), 'created_at', Count('id')),
            'new_stores_series': _series(now, Store.objects.all(), 'created_at', Count('id')),
        },
        'alerts': {
            'trials_expiring': {'count': len(trials_expiring), 'store_ids': trials_expiring},
            'quota_high': {'count': len(quota_high), 'store_ids': quota_high},
            'payments_stuck': {'count': len(stuck), 'payment_ids': stuck},
            'open_errors': {'count': ErrorEvent.objects.filter(status='open').count()},
            'unread_messages': {'count': ContactMessage.objects.filter(status='new').count()},
        },
    }
