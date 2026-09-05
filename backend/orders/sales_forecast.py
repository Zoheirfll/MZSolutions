"""Prévision de ventes — calcul DÉTERMINISTE pur, aucun appel réseau, aucun
appel IA. Moyenne mobile pondérée PAR JOUR DE LA SEMAINE (un lundi se
compare aux lundis précédents, pas à la moyenne globale — évite qu'un pic
de week-end fausse un jour de semaine), ajustée par la tendance récente.
Voir docs/superpowers/specs/2026-09-05-prevision-ventes-design.md."""
import statistics
from datetime import timedelta

from django.db.models import Count, Sum
from django.utils import timezone

from .stats_views import CONFIRMED_STATUSES

MIN_HISTORY_DAYS = 14
WEEKDAY_OCCURRENCES = 4
WEEKDAY_WEIGHTS = [4, 3, 2, 1]  # plus récent en premier


def _daily_counts_and_revenue(store, since):
    qs = (store.orders
          .filter(status__in=CONFIRMED_STATUSES, created_at__date__gte=since)
          .values('created_at__date')
          .annotate(orders_count=Count('id'), revenue=Sum('total'))
          .order_by('created_at__date'))
    by_date = {}
    for row in qs:
        by_date[row['created_at__date']] = {
            'orders': row['orders_count'],
            'revenue': float(row['revenue'] or 0),
        }
    return by_date


def compute_sales_forecast(store, horizon_days):
    today = timezone.now().date()
    earliest_order = store.orders.order_by('created_at').first()
    if not earliest_order:
        return None
    history_days = (today - earliest_order.created_at.date()).days
    if history_days < MIN_HISTORY_DAYS:
        return None

    lookback = WEEKDAY_OCCURRENCES * 7 + 7
    by_date = _daily_counts_and_revenue(store, today - timedelta(days=lookback))

    def week_avg(start_offset_days, num_days=14):
        vals = []
        for i in range(1, num_days + 1):
            d = today - timedelta(days=start_offset_days + i)
            vals.append(by_date.get(d, {'orders': 0})['orders'])
        return sum(vals) / num_days if vals else 0

    recent_avg = week_avg(0)
    prior_avg = week_avg(14)
    weekly_trend = recent_avg - prior_avg

    points = []
    for day_offset in range(1, horizon_days + 1):
        target_date = today + timedelta(days=day_offset)

        occurrences = []
        for back in range(1, WEEKDAY_OCCURRENCES + 1):
            d = target_date - timedelta(weeks=back)
            if d in by_date:
                occurrences.append(by_date[d])

        if occurrences:
            weights = WEEKDAY_WEIGHTS[:len(occurrences)]
            total_weight = sum(weights)
            base_orders = sum(o['orders'] * w for o, w in zip(occurrences, weights)) / total_weight
            base_revenue = sum(o['revenue'] * w for o, w in zip(occurrences, weights)) / total_weight
            order_values = [o['orders'] for o in occurrences]
            revenue_values = [o['revenue'] for o in occurrences]
            orders_std = statistics.pstdev(order_values) if len(order_values) > 1 else base_orders * 0.3
            revenue_std = statistics.pstdev(revenue_values) if len(revenue_values) > 1 else base_revenue * 0.3
        else:
            base_orders, base_revenue = 0, 0
            orders_std, revenue_std = 0, 0

        weeks_ahead = (day_offset - 1) // 7 + 1
        trend_adjustment = weekly_trend * weeks_ahead / 7
        predicted_orders = max(0, base_orders + trend_adjustment)
        predicted_revenue = max(0, base_revenue + trend_adjustment * (base_revenue / base_orders if base_orders else 0))

        points.append({
            'date': target_date.isoformat(),
            'predicted_orders': round(predicted_orders, 1),
            'orders_low': round(max(0, predicted_orders - orders_std), 1),
            'orders_high': round(predicted_orders + orders_std, 1),
            'predicted_revenue': round(predicted_revenue, 2),
            'revenue_low': round(max(0, predicted_revenue - revenue_std), 2),
            'revenue_high': round(predicted_revenue + revenue_std, 2),
        })

    return {'history_days': history_days, 'points': points}
