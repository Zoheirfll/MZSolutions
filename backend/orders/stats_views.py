import csv
from collections import Counter, defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum, Q, Max
from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import is_owner_or_admin, has_permission
from core.pagination import parse_pagination
from .models import Order, CallAttempt, STATUS_CHOICES
from .utils import parse_period, order_channel, previous_period

CONFIRMED_STATUSES = ['confirmed', 'shipped', 'delivered']
PROCESSED_STATUSES = ['no_answer_1', 'no_answer_2', 'no_answer_3', 'confirmed', 'shipped', 'delivered', 'returned', 'cancelled']


def _get_store(request):
    try:
        return request.user.store
    except Exception:
        pass
    try:
        return request.user.team_membership.store
    except Exception:
        return None


def _csv_response(filename, header, rows):
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)
    writer.writerow(header)
    for row in rows:
        writer.writerow(row)
    return response


def _pct_delta(current, prev):
    """Variation en % vs période précédente — None si non calculable (pas de
    référence), pour laisser le frontend afficher '—' plutôt que 0%/∞%."""
    if prev in (None, 0):
        return None
    return round((float(current) - float(prev)) / abs(float(prev)) * 100, 1)


class StatsPermissionMixin:
    permission_classes = [IsAuthenticated]

    def check_access(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'stats_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        return None

    def get_store_or_error(self, request):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        return store, None


def _daterange(date_from, date_to):
    days = (date_to - date_from).days
    return [date_from + timedelta(days=i) for i in range(days + 1)]


class OrdersStatsDetailView(StatsPermissionMixin, APIView):
    """Statistiques commandes : évolution quotidienne + répartition par statut."""

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        qs = store.orders.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)

        by_day = Counter(o.created_at.date() for o in qs.only('created_at'))
        daily = [{'date': d.isoformat(), 'count': by_day.get(d, 0)} for d in _daterange(date_from, date_to)]

        by_status = []
        for code, label in STATUS_CHOICES:
            count = qs.filter(status=code).count()
            if count:
                by_status.append({'status': code, 'label': label, 'count': count})

        total = qs.count()
        prev_from, prev_to = previous_period(date_from, date_to)
        prev_total = store.orders.filter(created_at__date__gte=prev_from, created_at__date__lte=prev_to).count()

        if request.query_params.get('export') == 'csv':
            return _csv_response('commandes-quotidien.csv', ['Date', 'Commandes'], [[d['date'], d['count']] for d in daily])

        return Response({
            'total': total, 'daily': daily, 'by_status': by_status,
            'previous_total': prev_total, 'total_delta_pct': _pct_delta(total, prev_total),
        })


class ReturnsStatsView(StatsPermissionMixin, APIView):
    """Statistiques retours : évolution + taux de retour sur la période."""

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        qs = store.orders.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
        total = qs.count()
        returned_qs = qs.filter(status='returned')
        returned_count = returned_qs.count()
        cancel_requested_count = qs.filter(status='cancel_requested').count()
        return_rate = round(returned_count / total * 100, 1) if total else 0.0

        by_day = Counter(o.created_at.date() for o in returned_qs.only('created_at'))
        daily = [{'date': d.isoformat(), 'count': by_day.get(d, 0)} for d in _daterange(date_from, date_to)]

        prev_from, prev_to = previous_period(date_from, date_to)
        prev_qs = store.orders.filter(created_at__date__gte=prev_from, created_at__date__lte=prev_to)
        prev_total = prev_qs.count()
        prev_returned = prev_qs.filter(status='returned').count()
        prev_return_rate = round(prev_returned / prev_total * 100, 1) if prev_total else 0.0

        if request.query_params.get('export') == 'csv':
            return _csv_response('retours-quotidien.csv', ['Date', 'Retours'], [[d['date'], d['count']] for d in daily])

        return Response({
            'total_orders': total,
            'returned_count': returned_count,
            'cancel_requested_count': cancel_requested_count,
            'return_rate': return_rate,
            'daily': daily,
            'previous_return_rate': prev_return_rate,
            'return_rate_delta_pct': _pct_delta(return_rate, prev_return_rate),
        })


class FailureStatsView(StatsPermissionMixin, APIView):
    """Statistiques des échecs d'appel, ventilées par raison (FailureReason)."""

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        qs = (CallAttempt.objects
              .filter(order__store=store, attempted_at__date__gte=date_from, attempted_at__date__lte=date_to)
              .exclude(failure_reason__isnull=True))
        total = qs.count()
        grouped = (qs.values('failure_reason__id', 'failure_reason__label')
                     .annotate(count=Count('id')).order_by('-count'))
        results = [{
            'reason_id': g['failure_reason__id'],
            'label': g['failure_reason__label'],
            'count': g['count'],
            'percentage': round(g['count'] / total * 100, 1) if total else 0.0,
        } for g in grouped]

        prev_from, prev_to = previous_period(date_from, date_to)
        prev_total = (CallAttempt.objects
                      .filter(order__store=store, attempted_at__date__gte=prev_from, attempted_at__date__lte=prev_to)
                      .exclude(failure_reason__isnull=True).count())

        if request.query_params.get('export') == 'csv':
            return _csv_response('echecs.csv', ['Raison', 'Nombre', 'Pourcentage'],
                                  [[r['label'], r['count'], r['percentage']] for r in results])

        page, per_page = parse_pagination(request, default_per_page=20)
        count = len(results)
        results = results[(page - 1) * per_page: page * per_page]

        return Response({
            'total': total, 'by_reason': results, 'count': count, 'page': page, 'per_page': per_page,
            'previous_total': prev_total, 'total_delta_pct': _pct_delta(total, prev_total),
        })


class StockSalesStatsView(StatsPermissionMixin, APIView):
    """Statistiques de vente de stock : unités vendues par produit sur la période."""

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        from products.models import StockMovement
        base_qs = StockMovement.objects.filter(store=store, reason='order_sale',
                                                created_at__date__gte=date_from, created_at__date__lte=date_to)
        excluded_count = base_qs.filter(product__isnull=True).count()
        qs = base_qs.exclude(product__isnull=True)
        grouped = (qs.values('product__id', 'product__name')
                     .annotate(units_sold=Sum('quantity'), movements=Count('id'))
                     .order_by('units_sold'))  # quantity is negative for sales

        prev_from, prev_to = previous_period(date_from, date_to)
        prev_grouped = {
            g['product__id']: -g['units_sold']
            for g in (StockMovement.objects
                      .filter(store=store, reason='order_sale', product__isnull=False,
                              created_at__date__gte=prev_from, created_at__date__lte=prev_to)
                      .values('product__id').annotate(units_sold=Sum('quantity')))
        }

        results = [{
            'product_id': g['product__id'],
            'product_name': g['product__name'],
            'units_sold': -g['units_sold'],
            'movements': g['movements'],
            'previous_units_sold': prev_grouped.get(g['product__id'], 0),
            'units_sold_delta_pct': _pct_delta(-g['units_sold'], prev_grouped.get(g['product__id'], 0)),
        } for g in grouped]

        if request.query_params.get('export') == 'csv':
            return _csv_response('vente-stock.csv', ['Produit', 'Unités vendues', 'Mouvements'],
                                  [[r['product_name'], r['units_sold'], r['movements']] for r in results])

        page, per_page = parse_pagination(request, default_per_page=20)
        count = len(results)
        results = results[(page - 1) * per_page: page * per_page]

        return Response({
            'results': results, 'count': count, 'page': page, 'per_page': per_page,
            'excluded_movements': excluded_count,
        })


class ProductsStatsView(StatsPermissionMixin, APIView):
    """Statistiques par produit : commandes, confirmées, meilleure wilaya,
    meilleure source d'acquisition sur la période.

    Nécessite un passage en Python (Counter) plutôt qu'une agrégation SQL pure
    car `order_channel()` encode une logique métier (dropshipper nommé /
    boutique en ligne / vente manuelle, déduite de l'historique) qui n'est pas
    directement traduisible en `.annotate()`. La pagination ci-dessous borne
    la taille de la réponse ; `prefetch_related` évite le N+1 SQL (une seule
    requête par relation, pas une par commande)."""

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        orders = (store.orders
                  .filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
                  .prefetch_related('items__product', 'history').select_related('dropshipper'))

        stats = defaultdict(lambda: {'name': '', 'orders': set(), 'confirmed': 0, 'wilayas': Counter(), 'sources': Counter()})
        for order in orders:
            channel = order_channel(order)
            confirmed = order.status in CONFIRMED_STATUSES
            for item in order.items.all():
                if not item.product_id:
                    continue
                s = stats[item.product_id]
                s['name'] = item.product.name if item.product else item.product_name
                s['orders'].add(order.id)
                if confirmed:
                    s['confirmed'] += 1
                s['wilayas'][order.wilaya or '—'] += 1
                s['sources'][channel] += 1

        prev_from, prev_to = previous_period(date_from, date_to)
        prev_orders_by_product = Counter()
        prev_orders = (store.orders
                       .filter(created_at__date__gte=prev_from, created_at__date__lte=prev_to)
                       .prefetch_related('items'))
        for order in prev_orders:
            seen = set()
            for item in order.items.all():
                if item.product_id and item.product_id not in seen:
                    prev_orders_by_product[item.product_id] += 1
                    seen.add(item.product_id)

        results = []
        for product_id, s in stats.items():
            best_wilaya = s['wilayas'].most_common(1)[0][0] if s['wilayas'] else '—'
            best_source = s['sources'].most_common(1)[0][0] if s['sources'] else '—'
            orders_count = len(s['orders'])
            prev_count = prev_orders_by_product.get(product_id, 0)
            results.append({
                'product_id': product_id,
                'product_name': s['name'],
                'orders_count': orders_count,
                'confirmed_count': s['confirmed'],
                'best_wilaya': best_wilaya,
                'best_source': best_source,
                'previous_orders_count': prev_count,
                'orders_count_delta_pct': _pct_delta(orders_count, prev_count),
            })
        results.sort(key=lambda r: r['orders_count'], reverse=True)

        if request.query_params.get('export') == 'csv':
            return _csv_response('produits.csv', ['Produit', 'Commandes', 'Confirmées', 'Meilleure wilaya', 'Meilleure source'],
                                  [[r['product_name'], r['orders_count'], r['confirmed_count'], r['best_wilaya'], r['best_source']] for r in results])

        page, per_page = parse_pagination(request, default_per_page=20)
        count = len(results)
        results = results[(page - 1) * per_page: page * per_page]

        return Response({'results': results, 'count': count, 'page': page, 'per_page': per_page})


class WilayaStatsView(StatsPermissionMixin, APIView):
    """Statistiques par wilaya : commandes, confirmées, revenu sur la période."""

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        qs = store.orders.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
        grouped = (qs.values('wilaya')
                     .annotate(
                         orders_count=Count('id'),
                         confirmed_count=Count('id', filter=Q(status__in=CONFIRMED_STATUSES)),
                         revenue=Sum('total', filter=Q(status__in=CONFIRMED_STATUSES)),
                     ).order_by('-orders_count'))

        prev_from, prev_to = previous_period(date_from, date_to)
        prev_grouped = {
            g['wilaya']: g['orders_count']
            for g in (store.orders.filter(created_at__date__gte=prev_from, created_at__date__lte=prev_to)
                      .values('wilaya').annotate(orders_count=Count('id')))
        }

        results = [{
            'wilaya': g['wilaya'] or '—',
            'orders_count': g['orders_count'],
            'confirmed_count': g['confirmed_count'],
            'revenue': g['revenue'] or Decimal('0'),
            'previous_orders_count': prev_grouped.get(g['wilaya'], 0),
            'orders_count_delta_pct': _pct_delta(g['orders_count'], prev_grouped.get(g['wilaya'], 0)),
        } for g in grouped]

        if request.query_params.get('export') == 'csv':
            return _csv_response('wilayas.csv', ['Wilaya', 'Commandes', 'Confirmées', 'Revenu'],
                                  [[r['wilaya'], r['orders_count'], r['confirmed_count'], r['revenue']] for r in results])

        page, per_page = parse_pagination(request, default_per_page=20)
        count = len(results)
        results = results[(page - 1) * per_page: page * per_page]

        return Response({'results': results, 'count': count, 'page': page, 'per_page': per_page})


class SourceStatsView(StatsPermissionMixin, APIView):
    """Statistiques par source (canal de vente) : commandes, confirmées, revenu."""

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        orders = (store.orders
                  .filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
                  .prefetch_related('history').select_related('dropshipper'))

        stats = defaultdict(lambda: {'orders': 0, 'confirmed': 0, 'revenue': Decimal('0')})
        for order in orders:
            channel = order_channel(order)
            s = stats[channel]
            s['orders'] += 1
            if order.status in CONFIRMED_STATUSES:
                s['confirmed'] += 1
                s['revenue'] += order.total

        prev_from, prev_to = previous_period(date_from, date_to)
        prev_orders = (store.orders
                       .filter(created_at__date__gte=prev_from, created_at__date__lte=prev_to)
                       .prefetch_related('history').select_related('dropshipper'))
        prev_stats = Counter()
        for order in prev_orders:
            prev_stats[order_channel(order)] += 1

        results = [{
            'source': channel, 'orders_count': s['orders'],
            'confirmed_count': s['confirmed'], 'revenue': s['revenue'],
            'previous_orders_count': prev_stats.get(channel, 0),
            'orders_count_delta_pct': _pct_delta(s['orders'], prev_stats.get(channel, 0)),
        } for channel, s in stats.items()]
        results.sort(key=lambda r: r['orders_count'], reverse=True)

        if request.query_params.get('export') == 'csv':
            return _csv_response('sources.csv', ['Source', 'Commandes', 'Confirmées', 'Revenu'],
                                  [[r['source'], r['orders_count'], r['confirmed_count'], r['revenue']] for r in results])

        return Response({'results': results})


class GlobalStatsView(StatsPermissionMixin, APIView):
    """Vue d'ensemble : KPIs clés sur la période (résumé de toutes les autres vues)."""

    def _summary(self, store, date_from, date_to):
        qs = store.orders.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
        total = qs.count()
        processed = qs.filter(status__in=PROCESSED_STATUSES).count()
        confirmed = qs.filter(status__in=CONFIRMED_STATUSES).count()
        delivered = qs.filter(status='delivered').count()
        returned  = qs.filter(status='returned').count()
        cancelled = qs.filter(status='cancelled').count()
        revenue   = qs.filter(status__in=CONFIRMED_STATUSES).aggregate(s=Sum('total'))['s'] or Decimal('0')
        avg_basket = (revenue / confirmed) if confirmed else Decimal('0')
        return {
            'total_orders': total,
            'confirmation_rate': round(confirmed / processed * 100, 1) if processed else 0.0,
            'delivered_count': delivered,
            'returned_count': returned,
            'cancelled_count': cancelled,
            'revenue': revenue,
            'avg_basket': round(avg_basket, 2),
        }

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        current = self._summary(store, date_from, date_to)
        prev_from, prev_to = previous_period(date_from, date_to)
        previous = self._summary(store, prev_from, prev_to)

        current['previous_period'] = previous
        current['revenue_delta_pct'] = _pct_delta(current['revenue'], previous['revenue'])
        current['total_orders_delta_pct'] = _pct_delta(current['total_orders'], previous['total_orders'])
        current['confirmation_rate_delta_pct'] = _pct_delta(current['confirmation_rate'], previous['confirmation_rate'])
        return Response(current)
