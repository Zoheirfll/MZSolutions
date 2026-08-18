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
from .wilaya_codes import wilaya_code

REAL_EXCLUDED_STATUSES = ['duplicate', 'fake']
IN_TRANSIT_STATUSES = ['shipped', 'out_for_delivery', 'in_progress']


def _apply_dashboard_filters(qs, request):
    """Filtres avancés du panneau "Filtrage" du tableau de bord (US demandée,
    alignée sur le concurrent RiseCart) — mêmes noms de paramètres et même
    logique que les filtres déjà établis sur OrderListCreateView.get, pour
    rester cohérent avec le reste de l'app plutôt que d'inventer une nouvelle
    convention. `source` filtre par canal de vente exact (voir order_channel()),
    calculé en Python (pas un champ DB), donc appliqué en dernier via id__in."""
    wilaya = request.query_params.get('wilaya', '').strip()
    if wilaya:
        qs = qs.filter(wilaya=wilaya)

    product = request.query_params.get('product', '').strip()
    if product:
        qs = qs.filter(items__product_name__icontains=product).distinct()

    category = request.query_params.get('category', '').strip()
    if category:
        qs = qs.filter(items__product__categories__name__icontains=category).distinct()

    confirmateur = request.query_params.get('confirmateur')
    # Un confirmateur sans stats_view voit le même tableau de bord que le
    # vendeur (mêmes composants), mais TOUJOURS filtré sur lui-même — la
    # valeur qu'il enverrait dans la query string est ignorée, jamais fait
    # confiance (sinon il pourrait consulter les stats d'un collègue en
    # changeant juste ?confirmateur=<id>).
    try:
        self_membership = request.user.team_membership
    except Exception:
        self_membership = None
    if self_membership and self_membership.role == 'confirmateur' and not (is_owner_or_admin(request) or has_permission(request, 'dashboard_view')):
        confirmateur = self_membership.id
    if confirmateur:
        qs = qs.filter(assignment__confirmateur_id=confirmateur)

    carrier = request.query_params.get('carrier')
    if carrier:
        qs = qs.filter(carrier_id=carrier)

    source = request.query_params.get('source', '').strip()
    if source:
        matching_ids = [
            o.id for o in qs.select_related('dropshipper').prefetch_related('history')
            if order_channel(o) == source
        ]
        qs = qs.filter(id__in=matching_ids)

    return qs

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
    """`permission_key` — chaque sous-classe déclare la permission (2026-08,
    catalogue granulaire une-permission-par-page) qui gate SA page précise ;
    ne jamais retomber sur une clé générique 'stats_view' (n'existe plus)."""
    permission_classes = [IsAuthenticated]
    permission_key = None

    def check_access(self, request):
        assert self.permission_key, f"{type(self).__name__} doit déclarer permission_key"
        if not (is_owner_or_admin(request) or has_permission(request, self.permission_key)):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        return None

    def get_store_or_error(self, request):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        return store, None


def _confirmateur_self_or_stats_access(request, permission_key='dashboard_view'):
    """Comme StatsPermissionMixin.check_access, mais ouvre aussi l'accès à un
    confirmateur — réservé aux SEULES vues qui appellent réellement
    `_apply_dashboard_filters()` sur toute requête sous-jacente (sinon un
    confirmateur verrait les données de toute la boutique, pas seulement les
    siennes). Ne PAS remonter cette exception dans StatsPermissionMixin lui-même
    : plusieurs vues qui en héritent (OrdersStatsDetailView, ReturnsStats...)
    n'ont aucune logique de scoping par confirmateur et fuiraient sinon les
    données de toute la boutique."""
    if is_owner_or_admin(request) or has_permission(request, permission_key):
        return None
    try:
        membership = request.user.team_membership
    except Exception:
        membership = None
    if membership and membership.role == 'confirmateur':
        return None
    return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)

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
    permission_key = 'stats_orders_view'

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
    permission_key = 'stats_returns_view'

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
    permission_key = 'stats_failures_view'

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
    permission_key = 'stats_stock_sales_view'

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
    permission_key = 'stats_products_view'

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
    permission_key = 'stats_wilayas_view'

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

        # "Meilleur produit" par wilaya (colonne croisée alignée sur RiseCart) —
        # même approche Counter que ProductsStatsView.best_wilaya, un seul passage
        # Python sur les items déjà préchargés (pas de N+1 SQL).
        best_product_by_wilaya = defaultdict(Counter)
        for order in qs.prefetch_related('items'):
            for item in order.items.all():
                name = item.product_name or (item.product.name if item.product_id else None)
                if name:
                    best_product_by_wilaya[order.wilaya][name] += 1

        results = [{
            'wilaya': g['wilaya'] or '—',
            'orders_count': g['orders_count'],
            'confirmed_count': g['confirmed_count'],
            'revenue': g['revenue'] or Decimal('0'),
            'best_product': (best_product_by_wilaya[g['wilaya']].most_common(1)[0][0]
                              if best_product_by_wilaya.get(g['wilaya']) else '—'),
            'previous_orders_count': prev_grouped.get(g['wilaya'], 0),
            'orders_count_delta_pct': _pct_delta(g['orders_count'], prev_grouped.get(g['wilaya'], 0)),
        } for g in grouped]

        if request.query_params.get('export') == 'csv':
            return _csv_response('wilayas.csv', ['Wilaya', 'Commandes', 'Confirmées', 'Revenu', 'Meilleur produit'],
                                  [[r['wilaya'], r['orders_count'], r['confirmed_count'], r['revenue'], r['best_product']] for r in results])

        page, per_page = parse_pagination(request, default_per_page=20)
        count = len(results)
        results = results[(page - 1) * per_page: page * per_page]

        return Response({'results': results, 'count': count, 'page': page, 'per_page': per_page})


class SourceStatsView(StatsPermissionMixin, APIView):
    """Statistiques par source (canal de vente) : commandes, confirmées, revenu."""
    permission_key = 'stats_sources_view'

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        orders = (store.orders
                  .filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
                  .prefetch_related('history', 'items').select_related('dropshipper'))

        stats = defaultdict(lambda: {'orders': 0, 'confirmed': 0, 'revenue': Decimal('0'), 'products': Counter(), 'wilayas': Counter()})
        for order in orders:
            channel = order_channel(order)
            s = stats[channel]
            s['orders'] += 1
            if order.status in CONFIRMED_STATUSES:
                s['confirmed'] += 1
                s['revenue'] += order.total
            s['wilayas'][order.wilaya or '—'] += 1
            for item in order.items.all():
                name = item.product_name or (item.product.name if item.product_id else None)
                if name:
                    s['products'][name] += 1

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
            'best_product': s['products'].most_common(1)[0][0] if s['products'] else '—',
            'best_wilaya':  s['wilayas'].most_common(1)[0][0] if s['wilayas'] else '—',
            'previous_orders_count': prev_stats.get(channel, 0),
            'orders_count_delta_pct': _pct_delta(s['orders'], prev_stats.get(channel, 0)),
        } for channel, s in stats.items()]
        results.sort(key=lambda r: r['orders_count'], reverse=True)

        if request.query_params.get('export') == 'csv':
            return _csv_response('sources.csv', ['Source', 'Commandes', 'Confirmées', 'Revenu', 'Meilleur produit', 'Meilleure wilaya'],
                                  [[r['source'], r['orders_count'], r['confirmed_count'], r['revenue'], r['best_product'], r['best_wilaya']] for r in results])

        return Response({'results': results})


class GlobalStatsView(StatsPermissionMixin, APIView):
    """Vue d'ensemble : KPIs clés sur la période (résumé de toutes les autres vues)."""
    permission_key = 'stats_global_view'

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

    def _is_paid(self, order):
        # Même définition que le tableau de bord (DashboardRevenueView) — pas
        # de champ "payé" explicite en base, proxy le plus fiable : COD encaissé
        # à la livraison, ou Chargily déjà confirmé (le webhook checkout.paid
        # ne confirme la commande qu'une fois le paiement reçu).
        if order.status == 'delivered':
            return True
        return order.payment_method == 'chargily' and order.status in CONFIRMED_STATUSES

    def _daily_breakdown(self, store, date_from, date_to):
        qs = store.orders.filter(created_at__date__gte=date_from, created_at__date__lte=date_to).prefetch_related('history')
        by_day = defaultdict(list)
        for order in qs:
            by_day[order.created_at.date()].append(order)

        rows = []
        for day in _daterange(date_from, date_to):
            orders = by_day.get(day, [])
            total = len(orders)
            confirmed = sum(1 for o in orders if o.status in CONFIRMED_STATUSES)
            shipped   = sum(1 for o in orders if o.status in IN_TRANSIT_STATUSES + ['delivered', 'returned'] or o.carrier_tracking_number)
            delivered = sum(1 for o in orders if o.status == 'delivered')
            paid      = sum(1 for o in orders if self._is_paid(o))
            pct = lambda n: round(n / total * 100, 1) if total else 0.0
            rows.append({
                'date': str(day), 'orders': total,
                'confirmed': confirmed, 'confirmed_pct': pct(confirmed),
                'shipped': shipped, 'shipped_pct': pct(shipped),
                'delivered': delivered, 'delivered_pct': pct(delivered),
                'paid': paid, 'paid_pct': pct(paid),
            })
        return rows

    def _avg_delays(self, store, date_from, date_to):
        # Délais moyens entre transitions de statut (US demandée, alignée sur
        # RiseCart) — calculés à partir de la première occurrence de chaque
        # statut dans OrderStatusHistory. Moyenne en secondes, formatée côté
        # frontend ; None si aucune commande n'a les deux jalons.
        qs = (store.orders
              .filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
              .prefetch_related('history'))

        confirm_to_ship, ship_to_deliver, ship_to_return = [], [], []
        for order in qs:
            firsts = {}
            for h in order.history.all().order_by('changed_at'):
                firsts.setdefault(h.status, h.changed_at)
            if 'confirmed' in firsts and 'shipped' in firsts and firsts['shipped'] > firsts['confirmed']:
                confirm_to_ship.append((firsts['shipped'] - firsts['confirmed']).total_seconds())
            if 'shipped' in firsts and 'delivered' in firsts and firsts['delivered'] > firsts['shipped']:
                ship_to_deliver.append((firsts['delivered'] - firsts['shipped']).total_seconds())
            if 'shipped' in firsts and 'returned' in firsts and firsts['returned'] > firsts['shipped']:
                ship_to_return.append((firsts['returned'] - firsts['shipped']).total_seconds())

        avg = lambda vals: round(sum(vals) / len(vals)) if vals else None
        return {
            'confirmation_to_shipped_seconds': avg(confirm_to_ship),
            'shipped_to_delivered_seconds':    avg(ship_to_deliver),
            'shipped_to_returned_seconds':     avg(ship_to_return),
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

        # "Advance Statistics" — ratio Commandes/Livraison (donut RiseCart)
        current['delivery_rate'] = round(current['delivered_count'] / current['total_orders'] * 100, 1) if current['total_orders'] else 0.0

        current['daily'] = self._daily_breakdown(store, date_from, date_to)
        current['avg_delays'] = self._avg_delays(store, date_from, date_to)

        if request.query_params.get('export') == 'csv':
            return _csv_response(
                'statistiques-globales.csv',
                ['Date', 'Commandes', 'Confirmé', 'Confirmé %', 'Expédié', 'Expédié %', 'Livré', 'Livré %', 'Payé', 'Payé %'],
                [[r['date'], r['orders'], r['confirmed'], r['confirmed_pct'], r['shipped'], r['shipped_pct'],
                  r['delivered'], r['delivered_pct'], r['paid'], r['paid_pct']] for r in current['daily']],
            )

        return Response(current)


class DashboardDeliveriesView(StatsPermissionMixin, APIView):
    """Onglet "Livraisons" du tableau de bord (US demandée, alignée sur le
    concurrent RiseCart) : entonnoir commandes → réelles → confirmées →
    expédiées, cartes secondaires, évolution quotidienne à 6 séries,
    répartition par wilaya/source/statut. "Réelles" = total − (duplicate +
    fake), décision produit validée le 2026-08-12.

    Ouverte aussi au rôle confirmateur (tableau de bord confirmateur, 2026-08)
    — sûr ici précisément parce que TOUTE requête ci-dessous passe par
    `_apply_dashboard_filters()`, qui le restreint alors à ses propres
    commandes assignées."""

    def check_access(self, request):
        return _confirmateur_self_or_stats_access(request)

    def _funnel_counts(self, qs):
        total = qs.count()
        real = qs.exclude(status__in=REAL_EXCLUDED_STATUSES).count()
        confirmed = qs.filter(status__in=CONFIRMED_STATUSES).count()
        shipped = qs.filter(status__in=IN_TRANSIT_STATUSES + ['delivered']).count()
        return {
            'total': total, 'real': real, 'confirmed': confirmed, 'shipped': shipped,
            'real_pct': round(real / total * 100, 1) if total else 0.0,
            'confirmed_pct': round(confirmed / real * 100, 1) if real else 0.0,
            'shipped_pct': round(shipped / confirmed * 100, 1) if confirmed else 0.0,
        }

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        qs = store.orders.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
        qs = _apply_dashboard_filters(qs, request)
        funnel = self._funnel_counts(qs)

        total = funnel['total']
        in_transit = qs.filter(status__in=IN_TRANSIT_STATUSES).count()
        delivered  = qs.filter(status='delivered').count()
        returned   = qs.filter(status='returned').count()
        cancelled  = qs.filter(status='cancelled').count()
        secondary = {
            'in_transit': {'count': in_transit, 'pct': round(in_transit / total * 100, 1) if total else 0.0},
            'delivered':  {'count': delivered,  'pct': round(delivered / total * 100, 1) if total else 0.0},
            'returned':   {'count': returned,   'pct': round(returned / total * 100, 1) if total else 0.0},
            'cancelled':  {'count': cancelled,  'pct': round(cancelled / total * 100, 1) if total else 0.0},
        }

        # Timeseries 6 séries — une passe Python plutôt que 6 requêtes agrégées,
        # le volume de commandes par boutique reste faible sur une période.
        rows = list(qs.only('created_at', 'status'))
        by_day = defaultdict(lambda: {'total': 0, 'real': 0, 'confirmed': 0, 'shipped': 0, 'delivered': 0, 'returned': 0})
        for o in rows:
            d = o.created_at.date()
            bucket = by_day[d]
            bucket['total'] += 1
            if o.status not in REAL_EXCLUDED_STATUSES:
                bucket['real'] += 1
            if o.status in CONFIRMED_STATUSES:
                bucket['confirmed'] += 1
            if o.status in IN_TRANSIT_STATUSES or o.status == 'delivered':
                bucket['shipped'] += 1
            if o.status == 'delivered':
                bucket['delivered'] += 1
            if o.status == 'returned':
                bucket['returned'] += 1
        timeseries = [{'date': d.isoformat(), **by_day.get(d, {'total': 0, 'real': 0, 'confirmed': 0, 'shipped': 0, 'delivered': 0, 'returned': 0})}
                      for d in _daterange(date_from, date_to)]

        by_wilaya_grouped = (qs.values('wilaya')
                             .annotate(orders_count=Count('id'),
                                       confirmed_count=Count('id', filter=Q(status__in=CONFIRMED_STATUSES)),
                                       revenue=Sum('total', filter=Q(status__in=CONFIRMED_STATUSES)))
                             .order_by('-orders_count'))
        by_wilaya = [{
            'wilaya': g['wilaya'] or '—',
            'wilaya_id': wilaya_code(g['wilaya']),
            'orders_count': g['orders_count'],
            'confirmed_count': g['confirmed_count'],
            'revenue': g['revenue'] or Decimal('0'),
        } for g in by_wilaya_grouped]

        source_stats = defaultdict(lambda: {'total': 0, 'real': 0, 'confirmed': 0, 'delivered': 0, 'returned': 0, 'cancelled': 0})
        for o in qs.prefetch_related('history').select_related('dropshipper'):
            channel = order_channel(o)
            s = source_stats[channel]
            s['total'] += 1
            if o.status not in REAL_EXCLUDED_STATUSES:
                s['real'] += 1
            if o.status in CONFIRMED_STATUSES:
                s['confirmed'] += 1
            if o.status == 'delivered':
                s['delivered'] += 1
            if o.status == 'returned':
                s['returned'] += 1
            if o.status == 'cancelled':
                s['cancelled'] += 1
        by_source = [{
            'source': channel,
            'total': s['total'], 'real': s['real'],
            'confirmed_pct': round(s['confirmed'] / s['total'] * 100, 1) if s['total'] else 0.0,
            'delivered_pct': round(s['delivered'] / s['total'] * 100, 1) if s['total'] else 0.0,
            'returned': s['returned'], 'cancelled': s['cancelled'],
        } for channel, s in source_stats.items()]
        by_source.sort(key=lambda r: r['total'], reverse=True)

        by_status = [{'status': code, 'label': label, 'count': qs.filter(status=code).count()}
                     for code, label in STATUS_CHOICES]

        prev_from, prev_to = previous_period(date_from, date_to)
        prev_qs = store.orders.filter(created_at__date__gte=prev_from, created_at__date__lte=prev_to)
        prev_qs = _apply_dashboard_filters(prev_qs, request)
        previous_funnel = self._funnel_counts(prev_qs)
        deltas = {
            'total': _pct_delta(funnel['total'], previous_funnel['total']),
            'real': _pct_delta(funnel['real'], previous_funnel['real']),
            'confirmed': _pct_delta(funnel['confirmed'], previous_funnel['confirmed']),
            'shipped': _pct_delta(funnel['shipped'], previous_funnel['shipped']),
        }

        return Response({
            'funnel': funnel,
            'secondary': secondary,
            'timeseries': timeseries,
            'by_wilaya': by_wilaya,
            'by_source': by_source,
            'by_status': by_status,
            'previous_period': {'funnel': previous_funnel},
            'deltas': deltas,
        })


class DashboardRevenueView(StatsPermissionMixin, APIView):
    """Onglet "Revenus" du tableau de bord — 8 cartes. Bénéfices/CA/coût
    produit/commission réutilisent le même calcul que ProfitabilitySummaryView
    (factorisé plutôt que dupliqué). Écarts de livraison/Frais de
    confirmation/Coût de retour/Autres dettes = saisie manuelle via
    finance.Cost (décision produit validée le 2026-08-12 — pas de calcul
    automatique tant que leur définition métier exacte n'est pas fixée).
    Dettes de produits = crédits fournisseurs impayés (SupplierCredit −
    SupplierPayment), donnée déjà en base depuis l'Epic 3.5.

    ⚠️ Contrairement aux 2 autres onglets du tableau de bord confirmateur
    (Livraisons/KPI), CETTE vue n'est PAS ouverte au rôle confirmateur : le
    profit net, les coûts publicitaires et les dettes fournisseurs sont des
    données financières de toute la boutique, sans notion de "mes revenus à
    moi" possible pour un confirmateur (rien à filtrer par assignation). D'où
    un check_access strict, qui n'hérite volontairement pas de l'exception
    confirmateur du mixin. Clé `stats_global_view` réutilisée (pas de clé
    dédiée) : reste désactivée par défaut pour confirmateur/dropshipper
    (contrairement à `dashboard_view`), tout en restant configurable via la
    matrice si le vendeur veut explicitement l'ouvrir."""
    permission_key = 'stats_global_view'

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        from finance.views import ProfitabilitySummaryView
        from products.models import SupplierCredit, SupplierPayment

        profitability_request = request
        profitability_view = ProfitabilitySummaryView()
        profitability_view.request = request
        summary_resp = profitability_view.get(_PeriodParamsShim(request, date_from, date_to))
        summary = summary_resp.data

        product_debts = (
            (SupplierCredit.objects.filter(supplier__store=store).aggregate(s=Sum('amount'))['s'] or Decimal('0')) -
            (SupplierPayment.objects.filter(supplier__store=store).aggregate(s=Sum('amount'))['s'] or Decimal('0'))
        )

        return Response({
            'profit':               summary.get('net_profit', Decimal('0')),
            'revenue':              summary.get('revenue', Decimal('0')),
            'ads_cost':             summary.get('marketing_cost', Decimal('0')),
            'delivery_variance':    summary.get('delivery_variance_cost', Decimal('0')),
            'confirmation_fees':    summary.get('confirmation_fees', Decimal('0')),
            'return_cost':          summary.get('return_cost', Decimal('0')),
            'product_debts':        max(product_debts, Decimal('0')),
            'other_debts':          summary.get('other_debts', Decimal('0')),
        })


class _PeriodParamsShim:
    """`ProfitabilitySummaryView.get()` lit `period_start`/`period_end` (noms
    de champs date, pas period/date_from/date_to comme `parse_period()`) —
    ce shim adapte la requête DRF déjà authentifiée du dashboard pour
    réutiliser le calcul de rentabilité sans le dupliquer."""
    def __init__(self, request, date_from, date_to):
        self._request = request
        self.query_params = {**request.query_params.dict(), 'period_start': date_from.isoformat(), 'period_end': date_to.isoformat()}
        self.user = request.user

    def __getattr__(self, name):
        return getattr(self._request, name)


class DashboardKpiView(StatsPermissionMixin, APIView):
    """Onglet "KPI" du tableau de bord — Top 5 sources et Top 5 wilayas avec
    ventilation complète du funnel (Commandes/Confirmé/Expédié/Livré/Payé/
    Retour). "Payé" = livrée (COD encaissé à la remise) OU payée en ligne via
    Chargily et confirmée (une commande Chargily n'est confirmée qu'après le
    webhook checkout.paid — voir ChargilyWebhookView) — pas de champ "payé"
    explicite en base, c'est le proxy le plus fiable disponible.

    Ouverte aussi au rôle confirmateur — voir DashboardDeliveriesView, même
    garde-fou (`_apply_dashboard_filters()` sur toute la requête)."""

    def check_access(self, request):
        return _confirmateur_self_or_stats_access(request)

    def get(self, request):
        if (err := self.check_access(request)): return err
        store, err = self.get_store_or_error(request)
        if err: return err
        date_from, date_to, err = parse_period(request)
        if err: return err

        qs = store.orders.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
        qs = _apply_dashboard_filters(qs, request)

        def is_paid(o):
            if o.status == 'delivered':
                return True
            return o.payment_method == 'chargily' and o.status in CONFIRMED_STATUSES

        source_stats = defaultdict(lambda: {'orders': 0, 'confirmed': 0, 'shipped': 0, 'delivered': 0, 'paid': 0, 'returned': 0})
        wilaya_stats  = defaultdict(lambda: {'orders': 0, 'confirmed': 0, 'shipped': 0, 'delivered': 0, 'paid': 0, 'returned': 0})
        for o in qs.prefetch_related('history').select_related('dropshipper'):
            for stats, key in ((source_stats, order_channel(o)), (wilaya_stats, o.wilaya or '—')):
                s = stats[key]
                s['orders'] += 1
                if o.status in CONFIRMED_STATUSES:
                    s['confirmed'] += 1
                if o.status in IN_TRANSIT_STATUSES or o.status == 'delivered':
                    s['shipped'] += 1
                if o.status == 'delivered':
                    s['delivered'] += 1
                if is_paid(o):
                    s['paid'] += 1
                if o.status == 'returned':
                    s['returned'] += 1

        def top5(stats_dict, key_name):
            rows = [{key_name: k, **v} for k, v in stats_dict.items()]
            rows.sort(key=lambda r: r['orders'], reverse=True)
            return rows[:5]

        return Response({
            'top_sources': top5(source_stats, 'source'),
            'top_wilayas': [{**row, 'wilaya_id': wilaya_code(row['wilaya'])} for row in top5(wilaya_stats, 'wilaya')],
        })
