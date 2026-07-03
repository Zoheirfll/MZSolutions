from decimal import Decimal
from django.db.models import Max, Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import is_owner_or_admin
from orders.models import Order
from dropshipping.models import CommissionEntry
from .models import Cost
from .serializers import CostSerializer


def _get_store(request):
    try:
        return request.user.store
    except Exception:
        pass
    try:
        return request.user.team_membership.store
    except Exception:
        return None


class CostListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        qs = Cost.objects.filter(store=store)
        category = request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        period_start = request.query_params.get('period_start')
        period_end = request.query_params.get('period_end')
        if period_start:
            qs = qs.filter(period_end__gte=period_start)
        if period_end:
            qs = qs.filter(period_start__lte=period_end)
        return Response(CostSerializer(qs, many=True).data)

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        serializer = CostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(store=store)
        return Response(serializer.data, status=201)


class CostDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        if not is_owner_or_admin(request):
            return None, Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        try:
            return Cost.objects.get(store=store, pk=pk), None
        except Cost.DoesNotExist:
            return None, Response({'detail': 'Coût introuvable.'}, status=404)

    def put(self, request, pk):
        cost, err = self._get(request, pk)
        if err: return err
        serializer = CostSerializer(cost, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        cost, err = self._get(request, pk)
        if err: return err
        cost.delete()
        return Response(status=204)


def _delivered_orders(store, period_start, period_end):
    """Commandes actuellement au statut 'delivered', filtrées sur la date à
    laquelle elles sont passées à ce statut (dernière transition vers
    'delivered' dans l'historique). Une commande livrée puis retournée sort
    naturellement de ce jeu (status != 'delivered'), cohérent avec la
    réversion de commission de l'Epic 7.3."""
    qs = Order.objects.filter(store=store, status='delivered').annotate(
        delivered_at=Max('history__changed_at', filter=Q(history__status='delivered'))
    ).prefetch_related('items__product', 'items__variant_option', 'history').select_related('dropshipper')
    if period_start:
        qs = qs.filter(delivered_at__date__gte=period_start)
    if period_end:
        qs = qs.filter(delivered_at__date__lte=period_end)
    return qs


def _order_channel(order):
    """Canal de vente déduit des données existantes (pas de nouveau champ) :
    dropshipper si Order.dropshipper renseigné, sinon boutique en ligne si la
    première entrée d'historique n'a pas d'auteur (créée par PublicOrderView,
    système), sinon vente manuelle (créée par un membre authentifié)."""
    if order.dropshipper_id:
        name = f"{order.dropshipper.first_name} {order.dropshipper.last_name}".strip()
        return f"Dropshipper — {name}" if name else "Dropshipper"
    history = list(order.history.all())
    first_entry = history[0] if history else None
    if first_entry and first_entry.changed_by_id is None:
        return "Boutique en ligne"
    return "Vente manuelle"


def _line_cost(item):
    if item.variant_option and item.variant_option.cost_price is not None:
        return item.variant_option.cost_price
    if item.product and item.product.cost_price is not None:
        return item.product.cost_price
    return None


class ProfitabilityView(APIView):
    """Rentabilité par produit/wilaya/source — uniquement les coûts
    directement attribuables (produit + commission dropshipper), sans
    répartition arbitraire des coûts opérationnels/marketing (US-7.4.2)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        group_by = request.query_params.get('group_by', 'product')
        if group_by not in ('product', 'wilaya', 'source'):
            return Response({'detail': "group_by doit être 'product', 'wilaya' ou 'source'."}, status=400)

        orders = _delivered_orders(store, request.query_params.get('period_start'), request.query_params.get('period_end'))
        commission_by_item = {c.order_item_id: c.amount for c in CommissionEntry.objects.filter(store=store)}

        groups = {}
        for order in orders:
            order_key = None
            if group_by == 'wilaya':
                order_key = order.wilaya or '—'
            elif group_by == 'source':
                order_key = _order_channel(order)
            for item in order.items.all():
                if group_by == 'product':
                    key = item.product.name if item.product else item.product_name
                else:
                    key = order_key
                g = groups.setdefault(key, {'revenue': Decimal('0'), 'product_cost': Decimal('0'), 'commission': Decimal('0'), 'orders': set()})
                g['revenue'] += item.price * item.quantity
                unit_cost = _line_cost(item)
                if unit_cost is not None:
                    g['product_cost'] += unit_cost * item.quantity
                g['commission'] += commission_by_item.get(item.id, Decimal('0'))
                g['orders'].add(order.id)

        results = []
        for key, g in groups.items():
            results.append({
                'label': key,
                'orders_count': len(g['orders']),
                'revenue': g['revenue'],
                'product_cost': g['product_cost'],
                'commission': g['commission'],
                'profit': g['revenue'] - g['product_cost'] - g['commission'],
            })
        results.sort(key=lambda r: r['revenue'], reverse=True)
        return Response(results)


class ProfitabilitySummaryView(APIView):
    """Rentabilité globale de la période — inclut les coûts opérationnels et
    marketing saisis manuellement, en plus du coût produit et de la
    commission dropshipper (US-7.4.2)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        period_start = request.query_params.get('period_start')
        period_end   = request.query_params.get('period_end')
        orders = _delivered_orders(store, period_start, period_end)
        commission_by_item = {c.order_item_id: c.amount for c in CommissionEntry.objects.filter(store=store)}

        revenue = product_cost = commission = Decimal('0')
        orders_count = 0
        for order in orders:
            orders_count += 1
            for item in order.items.all():
                revenue += item.price * item.quantity
                unit_cost = _line_cost(item)
                if unit_cost is not None:
                    product_cost += unit_cost * item.quantity
                commission += commission_by_item.get(item.id, Decimal('0'))

        costs = Cost.objects.filter(store=store)
        if period_start:
            costs = costs.filter(period_end__gte=period_start)
        if period_end:
            costs = costs.filter(period_start__lte=period_end)
        operational = sum((c.amount for c in costs if c.category == 'operational'), Decimal('0'))
        marketing   = sum((c.amount for c in costs if c.category == 'marketing'), Decimal('0'))

        return Response({
            'orders_count':      orders_count,
            'revenue':           revenue,
            'product_cost':      product_cost,
            'commission':        commission,
            'operational_cost':  operational,
            'marketing_cost':    marketing,
            'net_profit':        revenue - product_cost - commission - operational - marketing,
        })
