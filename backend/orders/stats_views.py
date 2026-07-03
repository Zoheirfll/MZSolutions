from collections import Counter, defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum, Q, Max
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import is_owner_or_admin, has_permission
from .models import Order, CallAttempt, STATUS_CHOICES
from .utils import parse_period, order_channel

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

        return Response({'total': qs.count(), 'daily': daily, 'by_status': by_status})


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

        by_day = Counter(o.created_at.date() for o in returned_qs.only('created_at'))
        daily = [{'date': d.isoformat(), 'count': by_day.get(d, 0)} for d in _daterange(date_from, date_to)]

        return Response({
            'total_orders': total,
            'returned_count': returned_count,
            'cancel_requested_count': cancel_requested_count,
            'return_rate': round(returned_count / total * 100, 1) if total else 0.0,
            'daily': daily,
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

        return Response({'total': total, 'by_reason': results})


class StockSalesStatsView(StatsPermissionMixin, APIView):
    """Statistiques de vente de stock : unités vendues par produit sur la période."""

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        from products.models import StockMovement
        qs = (StockMovement.objects
              .filter(store=store, reason='order_sale', created_at__date__gte=date_from, created_at__date__lte=date_to)
              .exclude(product__isnull=True))
        grouped = (qs.values('product__id', 'product__name')
                     .annotate(units_sold=Sum('quantity'), movements=Count('id'))
                     .order_by('units_sold'))  # quantity is negative for sales

        results = [{
            'product_id': g['product__id'],
            'product_name': g['product__name'],
            'units_sold': -g['units_sold'],
            'movements': g['movements'],
        } for g in grouped]

        return Response({'results': results})


class ProductsStatsView(StatsPermissionMixin, APIView):
    """Statistiques par produit : commandes, confirmées, meilleure wilaya,
    meilleure source d'acquisition sur la période."""

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

        results = []
        for product_id, s in stats.items():
            best_wilaya = s['wilayas'].most_common(1)[0][0] if s['wilayas'] else '—'
            best_source = s['sources'].most_common(1)[0][0] if s['sources'] else '—'
            results.append({
                'product_id': product_id,
                'product_name': s['name'],
                'orders_count': len(s['orders']),
                'confirmed_count': s['confirmed'],
                'best_wilaya': best_wilaya,
                'best_source': best_source,
            })
        results.sort(key=lambda r: r['orders_count'], reverse=True)
        return Response({'results': results})


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

        results = [{
            'wilaya': g['wilaya'] or '—',
            'orders_count': g['orders_count'],
            'confirmed_count': g['confirmed_count'],
            'revenue': g['revenue'] or Decimal('0'),
        } for g in grouped]

        return Response({'results': results})


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

        results = [{
            'source': channel, 'orders_count': s['orders'],
            'confirmed_count': s['confirmed'], 'revenue': s['revenue'],
        } for channel, s in stats.items()]
        results.sort(key=lambda r: r['orders_count'], reverse=True)
        return Response({'results': results})


class GlobalStatsView(StatsPermissionMixin, APIView):
    """Vue d'ensemble : KPIs clés sur la période (résumé de toutes les autres vues)."""

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        qs = store.orders.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
        total = qs.count()
        processed = qs.filter(status__in=PROCESSED_STATUSES).count()
        confirmed = qs.filter(status__in=CONFIRMED_STATUSES).count()
        delivered = qs.filter(status='delivered').count()
        returned  = qs.filter(status='returned').count()
        cancelled = qs.filter(status='cancelled').count()
        revenue   = qs.filter(status__in=CONFIRMED_STATUSES).aggregate(s=Sum('total'))['s'] or Decimal('0')
        avg_basket = (revenue / confirmed) if confirmed else Decimal('0')

        return Response({
            'total_orders': total,
            'confirmation_rate': round(confirmed / processed * 100, 1) if processed else 0.0,
            'delivered_count': delivered,
            'returned_count': returned,
            'cancelled_count': cancelled,
            'revenue': revenue,
            'avg_basket': round(avg_basket, 2),
        })
