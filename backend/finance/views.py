import csv
from datetime import date, timedelta
from decimal import Decimal
from django.db.models import Max, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import parse_pagination
from core.permissions import is_owner_or_admin, has_permission
from orders.models import Order
from orders.utils import order_channel
from dropshipping.models import CommissionEntry
from .models import Cost, COST_CATEGORY_CHOICES
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
        if not (is_owner_or_admin(request) or has_permission(request, 'finances_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        qs = Cost.objects.filter(store=store)
        category = request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(label__icontains=search)
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
        if not (is_owner_or_admin(request) or has_permission(request, 'finances_view')):
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
                order_key = order_channel(order)
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

        if request.query_params.get('export') == 'csv':
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="rentabilite-{group_by}.csv"'
            writer = csv.writer(response)
            writer.writerow(['Libellé', 'Commandes', 'Revenu', 'Coût produit', 'Commission', 'Profit'])
            for r in results:
                writer.writerow([r['label'], r['orders_count'], r['revenue'], r['product_cost'], r['commission'], r['profit']])
            return response

        return Response(results)


class ProfitabilitySummaryView(APIView):
    """Rentabilité globale de la période — inclut les coûts opérationnels et
    marketing saisis manuellement, en plus du coût produit et de la
    commission dropshipper (US-7.4.2)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'finances_view')):
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
        # Toutes les catégories de Cost réduisent le profit net (pas
        # seulement operational/marketing comme avant l'ajout des catégories
        # écarts de livraison / frais de confirmation / coût de retour /
        # autres dettes — 2026-08) — sommé génériquement par catégorie pour
        # ne jamais en oublier une silencieusement si le catalogue évolue.
        costs_by_category = {cat: Decimal('0') for cat, _ in COST_CATEGORY_CHOICES}
        for c in costs:
            costs_by_category[c.category] = costs_by_category.get(c.category, Decimal('0')) + c.amount
        total_costs = sum(costs_by_category.values(), Decimal('0'))
        operational = costs_by_category.get('operational', Decimal('0'))
        marketing   = costs_by_category.get('marketing', Decimal('0'))

        net_profit = revenue - product_cost - commission - total_costs

        previous = None
        if period_start and period_end:
            try:
                start_date = date.fromisoformat(period_start)
                end_date   = date.fromisoformat(period_end)
                span = (end_date - start_date).days
                prev_end   = start_date - timedelta(days=1)
                prev_start = prev_end - timedelta(days=span)
                previous = self._summary_for_period(store, prev_start.isoformat(), prev_end.isoformat())
            except ValueError:
                previous = None

        return Response({
            'orders_count':          orders_count,
            'revenue':               revenue,
            'product_cost':          product_cost,
            'commission':            commission,
            'operational_cost':      operational,
            'marketing_cost':        marketing,
            'delivery_variance_cost': costs_by_category.get('delivery_variance', Decimal('0')),
            'confirmation_fees':      costs_by_category.get('confirmation_fees', Decimal('0')),
            'return_cost':            costs_by_category.get('return_cost', Decimal('0')),
            'other_debts':            costs_by_category.get('other_debts', Decimal('0')),
            'total_costs':            total_costs,
            'net_profit':             net_profit,
            'previous_period':        previous,
        })

    def _summary_for_period(self, store, period_start, period_end):
        """Même calcul que get(), réutilisé pour la période précédente
        (comparaison affichée sur ProfitabilityPage)."""
        orders = _delivered_orders(store, period_start, period_end)
        commission_by_item = {c.order_item_id: c.amount for c in CommissionEntry.objects.filter(store=store)}
        revenue = product_cost = commission = Decimal('0')
        for order in orders:
            for item in order.items.all():
                revenue += item.price * item.quantity
                unit_cost = _line_cost(item)
                if unit_cost is not None:
                    product_cost += unit_cost * item.quantity
                commission += commission_by_item.get(item.id, Decimal('0'))

        costs = Cost.objects.filter(store=store, period_end__gte=period_start, period_start__lte=period_end)
        total_costs = sum((c.amount for c in costs), Decimal('0'))
        return {
            'revenue': revenue,
            'net_profit': revenue - product_cost - commission - total_costs,
        }


# ─── Paiements (réconciliation COD) ─────────────────────────────────────────
# "Paiement prêt" = commandes livrées payées à la livraison (COD) dont le
# transporteur n'a pas encore reversé l'argent au vendeur ; "Paiement
# récupéré" = celles déjà pointées comme reversées (Order.payment_collected_at).
# Uniquement les commandes COD — un paiement Chargily est déjà réglé
# électroniquement, aucune remise physique à suivre.

def _cod_delivered_orders(store, period_start, period_end, state):
    qs = _delivered_orders(store, period_start, period_end).filter(payment_method='cod')
    if state == 'ready':
        qs = qs.filter(payment_collected_at__isnull=True)
    elif state == 'collected':
        qs = qs.filter(payment_collected_at__isnull=False)
    return qs


def _payments_summary(store, period_start, period_end, state):
    orders = _cod_delivered_orders(store, period_start, period_end, state)
    commission_by_item = {c.order_item_id: c.amount for c in CommissionEntry.objects.filter(store=store)}

    revenue = product_cost = commission = Decimal('0')
    orders_count = 0
    for order in orders:
        orders_count += 1
        revenue += order.total
        for item in order.items.all():
            unit_cost = _line_cost(item)
            if unit_cost is not None:
                product_cost += unit_cost * item.quantity
            commission += commission_by_item.get(item.id, Decimal('0'))

    costs = Cost.objects.filter(store=store)
    if period_start:
        costs = costs.filter(period_end__gte=period_start)
    if period_end:
        costs = costs.filter(period_start__lte=period_end)
    costs_by_category = {cat: Decimal('0') for cat, _ in COST_CATEGORY_CHOICES}
    for c in costs:
        costs_by_category[c.category] = costs_by_category.get(c.category, Decimal('0')) + c.amount
    total_costs = sum(costs_by_category.values(), Decimal('0'))
    net_profit = revenue - product_cost - commission - total_costs

    return {
        'orders_count': orders_count,
        'revenue': revenue,
        'net_profit': net_profit,
        'profit_per_order': round(net_profit / orders_count, 2) if orders_count else Decimal('0'),
        'profit_margin_pct': round(net_profit / revenue * 100, 1) if revenue else Decimal('0'),
        'product_cost': product_cost,
        'ads_cost': costs_by_category.get('marketing', Decimal('0')),
        'delivery_cost': costs_by_category.get('delivery_variance', Decimal('0')),
        'other_cost': costs_by_category.get('operational', Decimal('0')) + costs_by_category.get('other_debts', Decimal('0')) + costs_by_category.get('confirmation_fees', Decimal('0')) + costs_by_category.get('return_cost', Decimal('0')),
        'cod_amount': revenue,
    }


class PaymentsSummaryView(APIView):
    """Onglet "Indicateurs" des pages Paiements — mêmes indicateurs que
    ProfitabilitySummaryView, scopés aux commandes COD livrées selon l'état
    de remise transporteur (?state=ready|collected)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'finances_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        state = request.query_params.get('state', 'ready')
        if state not in ('ready', 'collected'):
            return Response({'detail': "state doit être 'ready' ou 'collected'."}, status=400)
        return Response(_payments_summary(store, request.query_params.get('period_start'), request.query_params.get('period_end'), state))


class PaymentsOrdersListView(APIView):
    """Onglet "Commandes" — liste paginée des commandes COD livrées pour
    l'état demandé, sélectionnables pour un pointage manuel en masse."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'finances_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        state = request.query_params.get('state', 'ready')
        if state not in ('ready', 'collected'):
            return Response({'detail': "state doit être 'ready' ou 'collected'."}, status=400)
        orders = _cod_delivered_orders(store, request.query_params.get('period_start'), request.query_params.get('period_end'), state).order_by('-created_at')

        page, per_page = parse_pagination(request, default_per_page=25)
        count = orders.count()
        orders = orders[(page - 1) * per_page: page * per_page]
        results = [{
            'id': o.id,
            'first_name': o.first_name, 'last_name': o.last_name, 'phone': o.phone,
            'carrier_tracking_number': o.carrier_tracking_number,
            'carrier_label': o.carrier.get_carrier_display() if o.carrier_id else None,
            'total': o.total,
            'payment_collected_at': o.payment_collected_at,
            'payment_collected_amount': o.payment_collected_amount,
        } for o in orders]
        return Response({'count': count, 'page': page, 'per_page': per_page, 'results': results})


class PaymentsMarkCollectedView(APIView):
    """Pointage manuel — marque une sélection de commandes comme reversées
    par le transporteur (`order_ids`), montant par défaut = `total` sauf si
    précisé (`amounts: {order_id: montant}`, pour le cas d'un écart connu)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        order_ids = request.data.get('order_ids', [])
        amounts = request.data.get('amounts', {}) or {}
        if not order_ids:
            return Response({'detail': 'order_ids requis.'}, status=400)

        updated = 0
        for order in Order.objects.filter(store=store, id__in=order_ids, status='delivered', payment_method='cod', payment_collected_at__isnull=True):
            amount = amounts.get(str(order.id))
            order.payment_collected_at = timezone.now()
            order.payment_collected_amount = Decimal(str(amount)) if amount is not None else order.total
            order.save(update_fields=['payment_collected_at', 'payment_collected_amount'])
            updated += 1
        return Response({'updated': updated})


class PaymentsReconciliationView(APIView):
    """Onglet "Vérification de cohérence" — commandes récupérées dont le
    montant reçu diffère du montant attendu (`total`), pour repérer les
    écarts de versement transporteur."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'finances_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        orders = (Order.objects.filter(store=store, status='delivered', payment_method='cod', payment_collected_at__isnull=False)
                  .exclude(payment_collected_amount=None).select_related('carrier'))
        results = []
        for o in orders:
            diff = o.payment_collected_amount - o.total
            if diff != 0:
                results.append({
                    'id': o.id, 'first_name': o.first_name, 'last_name': o.last_name,
                    'carrier_tracking_number': o.carrier_tracking_number,
                    'expected': o.total, 'received': o.payment_collected_amount, 'diff': diff,
                    'payment_collected_at': o.payment_collected_at,
                })
        results.sort(key=lambda r: abs(r['diff']), reverse=True)
        return Response({'count': len(results), 'results': results})


# Noms de colonnes reconnus dans le rapport transporteur — best-effort,
# insensible à la casse/aux accents, aucun transporteur branché n'exposant
# ce format de façon standardisée pour l'instant.
_TRACKING_COLUMN_HINTS = ['tracking', 'suivi', 'colis', 'numero', 'numéro', 'n°']
_AMOUNT_COLUMN_HINTS = ['montant', 'amount', 'prix', 'total', 'somme', 'cod']


class PaymentsExcelImportView(APIView):
    """"Upload excel file" — le vendeur importe le rapport de versement de
    son transporteur (format variable selon le transporteur, aucune norme) :
    détection heuristique des colonnes tracking/montant, matching par
    `Order.carrier_tracking_number`, pointage automatique en "récupéré"."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'Fichier requis.'}, status=400)

        try:
            import openpyxl
            wb = openpyxl.load_workbook(file, read_only=True, data_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
        except Exception:
            return Response({'detail': 'Fichier Excel invalide ou illisible.'}, status=400)

        if not rows:
            return Response({'detail': 'Fichier vide.'}, status=400)

        header = [str(c or '').strip().lower() for c in rows[0]]
        tracking_col = next((i for i, h in enumerate(header) if any(hint in h for hint in _TRACKING_COLUMN_HINTS)), None)
        amount_col = next((i for i, h in enumerate(header) if any(hint in h for hint in _AMOUNT_COLUMN_HINTS)), None)
        if tracking_col is None:
            return Response({'detail': "Colonne de numéro de suivi introuvable dans le fichier (attendu : une colonne contenant « tracking », « suivi » ou « colis »)."}, status=400)

        matched, unmatched = 0, 0
        total_amount = Decimal('0')
        for row in rows[1:]:
            if tracking_col >= len(row) or not row[tracking_col]:
                continue
            tracking = str(row[tracking_col]).strip()
            amount = None
            if amount_col is not None and amount_col < len(row) and row[amount_col] not in (None, ''):
                try:
                    amount = Decimal(str(row[amount_col]))
                except Exception:
                    amount = None

            order = Order.objects.filter(store=store, carrier_tracking_number=tracking, status='delivered', payment_method='cod').first()
            if not order:
                unmatched += 1
                continue
            order.payment_collected_at = order.payment_collected_at or timezone.now()
            order.payment_collected_amount = amount if amount is not None else order.total
            order.save(update_fields=['payment_collected_at', 'payment_collected_amount'])
            matched += 1
            total_amount += order.payment_collected_amount

        return Response({'matched': matched, 'unmatched': unmatched, 'total_amount': total_amount})
