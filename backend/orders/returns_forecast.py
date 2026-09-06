"""Prévision de taux de retour — calcul DÉTERMINISTE pur, aucun appel réseau,
aucun appel IA. Moyenne mobile pondérée PAR JOUR DE LA SEMAINE, sur le même
principe que sales_forecast.py, adaptée à un TAUX (pas un volume) : les
occurrences sont sommées avant de diviser, pour ne pas bruiter le taux avec
des jours à faible volume. Aucune dépendance vers stats_views.py (contrairement
à sales_forecast.py) — pas de risque de cycle d'import ici.
Voir docs/superpowers/specs/2026-09-06-prevision-taux-retour-design.md."""
import statistics
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

MIN_HISTORY_DAYS = 30
WEEKDAY_OCCURRENCES = 4
WEEKDAY_WEIGHTS = [4, 3, 2, 1]  # plus récent en premier


def _daily_totals(store, since):
    qs = (store.orders
          .filter(created_at__date__gte=since)
          .values('created_at__date')
          .annotate(orders=Count('id'), returned=Count('id', filter=Q(status='returned')))
          .order_by('created_at__date'))
    by_date = {}
    for row in qs:
        by_date[row['created_at__date']] = {'orders': row['orders'], 'returned': row['returned']}
    return by_date


def _rate(returned, orders):
    return (returned / orders * 100) if orders else 0.0


def compute_returns_forecast(store, horizon_days):
    today = timezone.now().date()
    earliest_order = store.orders.order_by('created_at').first()
    if not earliest_order:
        return None
    history_days = (today - earliest_order.created_at.date()).days
    if history_days < MIN_HISTORY_DAYS:
        return None

    lookback = WEEKDAY_OCCURRENCES * 7 + 7
    by_date = _daily_totals(store, today - timedelta(days=lookback))

    def window_rate(start_offset_days, num_days=14):
        orders_sum = returned_sum = 0
        for i in range(1, num_days + 1):
            d = today - timedelta(days=start_offset_days + i)
            row = by_date.get(d)
            if row:
                orders_sum += row['orders']
                returned_sum += row['returned']
        return _rate(returned_sum, orders_sum)

    recent_rate = window_rate(0)
    prior_rate = window_rate(14)
    weekly_trend = recent_rate - prior_rate

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
            weighted_orders = sum(o['orders'] * w for o, w in zip(occurrences, weights)) / total_weight
            weighted_returned = sum(o['returned'] * w for o, w in zip(occurrences, weights)) / total_weight
            base_rate = _rate(weighted_returned, weighted_orders)
            daily_rates = [_rate(o['returned'], o['orders']) for o in occurrences if o['orders']]
            rate_std = statistics.pstdev(daily_rates) if len(daily_rates) > 1 else base_rate * 0.3
        else:
            base_rate, rate_std = 0.0, 0.0

        weeks_ahead = (day_offset - 1) // 7 + 1
        trend_adjustment = weekly_trend * weeks_ahead / 7
        predicted_rate = base_rate + trend_adjustment
        predicted_rate = max(0.0, min(100.0, predicted_rate))

        points.append({
            'date': target_date.isoformat(),
            'predicted_rate': round(predicted_rate, 1),
            'rate_low': round(max(0.0, predicted_rate - rate_std), 1),
            'rate_high': round(min(100.0, predicted_rate + rate_std), 1),
        })

    return {'history_days': history_days, 'points': points}
