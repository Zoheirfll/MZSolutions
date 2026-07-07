import json
from decimal import Decimal
from datetime import date, timedelta
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q, Count, Case, When, IntegerField, Max, Min
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from .models import Order, OrderItem, OrderStatusHistory, STATUS_CHOICES, OrderAssignment, FailureReason, CallAttempt, CALL_STATUS_CHOICES, PaymentWebhookLog, AbandonedCart, CarrierAccount, CARRIER_CHOICES, CustomerRisk, BlacklistedPhone, Complaint, ComplaintMessage, COMPLAINT_STATUS_CHOICES, ExchangeRequest, EXCHANGE_STATUS_CHOICES
from .serializers import OrderSerializer, OrderDetailSerializer, OrderAssignmentSerializer, FailureReasonSerializer, CallAttemptSerializer, AbandonedCartSerializer, CarrierAccountSerializer, BlacklistedPhoneSerializer, ComplaintSerializer, ComplaintDetailSerializer, ExchangeRequestSerializer
from .utils import assign_order_round_robin
from . import chargily
from .carriers import get_carrier_client
from core.permissions import IsOwnerOrAdminForWrites, is_owner_or_admin, has_permission


def _get_store(request):
    try:
        return request.user.store
    except Exception:
        pass
    try:
        return request.user.team_membership.store
    except Exception:
        return None


def _authoritative_item_price(store, item):
    """Résout le prix réel (serveur) d'une ligne de panier — ne jamais faire
    confiance au `price` envoyé par le client (Epic 8.6, faille critique :
    un client pouvait auparavant payer le montant de son choix en modifiant
    la requête réseau). Même logique de prix que `PublicProductDetailView` :
    l'option de variante a son propre prix (jamais remisé par une offre
    auto) ; sinon le prix de base du produit, remisé si une offre auto
    (`Promotion kind='auto'`) est active."""
    from products.models import Product, VariantOption

    variant_option_id = item.get('variant_option')
    product_id = item.get('product')

    if variant_option_id:
        try:
            opt = VariantOption.objects.select_related('variant__product').get(
                pk=variant_option_id, variant__product__store=store, variant__product_id=product_id,
            )
        except VariantOption.DoesNotExist:
            return None
        return opt.price if opt.price is not None else opt.variant.product.price

    try:
        product = store.products.get(pk=product_id)
    except Product.DoesNotExist:
        return None

    promo = product.active_auto_promotion()
    if promo:
        return product.price - promo.compute_discount(product.price)
    return product.price


def _deduct_stock_for_order(store, order):
    """Décrémente le stock de chaque article à la création de la commande
    (évite la survente si deux clients commandent le dernier article en même
    temps) et journalise un StockMovement par ligne, traçable comme pour les
    échanges."""
    from products.models import StockMovement
    for item in order.items.select_related('product', 'variant_option').all():
        if item.variant_option:
            opt = item.variant_option
            opt.stock = max(opt.stock - item.quantity, 0)
            opt.save(update_fields=['stock'])
            StockMovement.objects.create(
                store=store, product=item.product, variant_option=opt,
                quantity=-item.quantity, reason='order_sale', note=f"Commande #{order.id}",
            )
        elif item.product:
            item.product.stock = max(item.product.stock - item.quantity, 0)
            item.product.save(update_fields=['stock'])
            StockMovement.objects.create(
                store=store, product=item.product, variant_option=None,
                quantity=-item.quantity, reason='order_sale', note=f"Commande #{order.id}",
            )
        if item.product:
            _sync_stock_to_channels(store, item.product)


def _sync_stock_to_channels(store, product):
    """Pousse le stock mis à jour vers les canaux de vente externes connectés
    (Epic 8.2 US-8.2.1) — pour éviter la survente sur Shopify/Google Sheets.
    Best-effort : ne doit jamais faire échouer la création de commande."""
    try:
        from channels.models import ChannelConnection, ChannelSyncLog
        from channels.clients import get_channel_client
        for connection in ChannelConnection.objects.filter(store=store, is_active=True):
            client = get_channel_client(connection)
            result = client.sync_stock(product)
            ChannelSyncLog.objects.create(
                store=store, connection=connection, channel=connection.channel,
                direction='push', status='success' if result.success else 'error',
                items_synced=result.items_synced, message=result.message,
            )
    except Exception:
        pass


def _sync_commission_for_order(store, order, new_status):
    """Calcule la commission du dropshipper uniquement quand la commande passe
    à 'delivered' (une entrée par article, idempotent) ; supprime les entrées
    déjà calculées si la commande repasse en 'returned'/'cancelled' — pour ne
    jamais rémunérer une commande annulée ou retournée."""
    if not order.dropshipper_id:
        return
    from dropshipping.models import Commission, CommissionEntry

    if new_status == 'delivered':
        commissions = {
            c.product_id: c
            for c in Commission.objects.filter(store=store, dropshipper_id=order.dropshipper_id)
        }
        for item in order.items.select_related('product').all():
            if not item.product_id or item.product_id not in commissions:
                continue
            if CommissionEntry.objects.filter(order_item=item).exists():
                continue
            commission = commissions[item.product_id]
            CommissionEntry.objects.create(
                store=store, dropshipper_id=order.dropshipper_id, order_item=item,
                product_id=item.product_id,
                amount=commission.compute_amount(item.price, item.quantity),
            )
    elif new_status in ('returned', 'cancelled'):
        CommissionEntry.objects.filter(order_item__order=order).delete()


STATUS_TO_WEBHOOK_EVENT = {
    'confirmed': 'order.confirmed',
    'shipped':   'order.shipped',
    'delivered': 'order.delivered',
    'cancelled': 'order.cancelled',
    'returned':  'order.returned',
}


def _order_webhook_payload(order):
    return {
        'order_id':  order.id,
        'status':    order.status,
        'first_name': order.first_name,
        'last_name':  order.last_name,
        'phone':      order.phone,
        'wilaya':     order.wilaya,
        'commune':    order.commune,
        'total':      str(order.total),
        'payment_method': order.payment_method,
        'items': [
            {'product_name': i.product_name, 'quantity': i.quantity, 'price': str(i.price)}
            for i in order.items.all()
        ],
    }


def _fire_order_webhook(store, order, event):
    """Notifie les webhooks sortants configurés (Epic 8.4 US-8.4.1).
    Best-effort : ne doit jamais faire échouer le flux de commande."""
    try:
        from webhooks.dispatch import fire_event
        fire_event(store, event, _order_webhook_payload(order))
    except Exception:
        pass


def activate_scheduled_order(store, order, changed_by=None):
    """Fait passer une commande 'scheduled' à 'pending' et exécute les effets
    normalement déclenchés à la création d'une commande (Epic Commandes
    programmées) : ceux-ci sont volontairement différés jusqu'à l'activation
    pour ne pas immobiliser du stock ni consommer le quota d'essai avant que
    la commande ne soit réellement envoyée. Appelée par le management command
    `activate_scheduled_orders` (échéance passée) et par `OrderStatusView`
    (activation manuelle anticipée, ex: bouton "Envoyer maintenant")."""
    order.status = 'pending'
    order.save(update_fields=['status'])
    OrderStatusHistory.objects.create(order=order, status='pending', changed_by=changed_by)
    assign_order_round_robin(order)
    _deduct_stock_for_order(store, order)
    _fire_order_webhook(store, order, 'order.created')

    try:
        quota = store.quota
        if quota.orders_used < quota.orders_limit:
            quota.orders_used += 1
            quota.save(update_fields=['orders_used'])
    except Exception:
        pass


class OrderListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        qs = store.orders.prefetch_related('items').all()

        # Confirmateur : seulement ses commandes assignées. Dropshipper : seulement ses ventes.
        try:
            membership = request.user.team_membership
            if membership.role == 'confirmateur':
                qs = qs.filter(assignment__confirmateur=membership)
            elif membership.role == 'dropshipper':
                qs = qs.filter(dropshipper=membership)
        except Exception:
            pass

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(phone__icontains=search)
            )

        order_id = request.query_params.get('order_id', '').strip()
        if order_id:
            qs = qs.filter(id__icontains=order_id)

        phone = request.query_params.get('phone', '').strip()
        if phone:
            qs = qs.filter(phone__icontains=phone)

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
        if confirmateur:
            qs = qs.filter(assignment__confirmateur_id=confirmateur)

        carrier = request.query_params.get('carrier')
        if carrier:
            qs = qs.filter(carrier_id=carrier)

        date_from = request.query_params.get('date_from', '').strip()
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = request.query_params.get('date_to', '').strip()
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        if request.query_params.get('duplicates_only') == '1':
            dup_phones = (
                store.orders.values('phone')
                .annotate(n=Count('id'))
                .filter(n__gt=1)
                .values_list('phone', flat=True)
            )
            qs = qs.filter(phone__in=list(dup_phones))

        ordering_field = request.query_params.get('ordering', 'created_at')
        if ordering_field not in ('created_at', 'updated_at'):
            ordering_field = 'created_at'
        ordering_dir = request.query_params.get('ordering_dir', 'desc')
        qs = qs.order_by(f"-{ordering_field}" if ordering_dir == 'desc' else ordering_field)

        page     = max(1, int(request.query_params.get('page', 1)))
        per_page = int(request.query_params.get('per_page', 10))
        total    = qs.count()
        qs       = qs[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  OrderSerializer(qs, many=True).data,
        })

    @transaction.atomic
    def post(self, request):
        dropshipper_membership = None
        try:
            membership = request.user.team_membership
            if membership.role == 'dropshipper':
                dropshipper_membership = membership
        except Exception:
            pass

        if not is_owner_or_admin(request) and not dropshipper_membership:
            return Response({'detail': 'Création réservée au propriétaire, administrateur ou dropshipper.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        # Une commande programmée ne consomme le quota / stock qu'à son activation
        # (voir activate_scheduled_order) — pas de blocage quota à la simple planification.
        scheduled_at = None
        raw_scheduled_at = request.data.get('scheduled_at')
        if raw_scheduled_at:
            scheduled_at = parse_datetime(raw_scheduled_at)
            if scheduled_at is None:
                return Response({'detail': 'scheduled_at invalide (format ISO attendu).'}, status=400)
            if timezone.is_naive(scheduled_at):
                scheduled_at = timezone.make_aware(scheduled_at)
            if scheduled_at <= timezone.now():
                return Response({'detail': 'scheduled_at doit être dans le futur.'}, status=400)

        quota = None
        if not scheduled_at:
            try:
                quota = store.quota
                if quota.orders_used >= quota.orders_limit:
                    return Response({'detail': 'Quota de commandes atteint.'}, status=403)
            except Exception:
                quota = None

        items_data = request.data.get('items', [])
        if not items_data:
            return Response({'detail': 'La commande doit contenir au moins un article.'}, status=400)

        if dropshipper_membership:
            from dropshipping.models import DropshipperProduct
            allowed_product_ids = set(
                DropshipperProduct.objects.filter(dropshipper=dropshipper_membership)
                .values_list('product_id', flat=True)
            )
            for item in items_data:
                if item.get('product') not in allowed_product_ids:
                    return Response({'detail': "Cet article ne fait pas partie de vos produits sélectionnés."}, status=403)

        # Prix résolus côté serveur (jamais celui envoyé par le client) avant
        # toute création, pour ne rien laisser en base si un article est invalide.
        resolved_prices = []
        for item in items_data:
            price = _authoritative_item_price(store, item)
            if price is None:
                return Response({'detail': 'Un article de la commande est introuvable.'}, status=400)
            resolved_prices.append(price)

        order = Order.objects.create(
            store         = store,
            status        = 'scheduled' if scheduled_at else 'pending',
            scheduled_at  = scheduled_at,
            first_name    = request.data.get('first_name', ''),
            last_name     = request.data.get('last_name', ''),
            phone         = request.data.get('phone', ''),
            wilaya        = request.data.get('wilaya', ''),
            commune       = request.data.get('commune', ''),
            address       = request.data.get('address', ''),
            shipping_cost = request.data.get('shipping_cost', 0),
            delivery_type = request.data.get('delivery_type', ''),
            note          = request.data.get('note', ''),
            dropshipper   = dropshipper_membership,
        )

        for item, price in zip(items_data, resolved_prices):
            OrderItem.objects.create(
                order             = order,
                product_id        = item.get('product'),
                variant_option_id = item.get('variant_option'),
                product_name      = item.get('product_name', ''),
                price             = price,
                quantity          = item.get('quantity', 1),
            )

        order.recalculate()

        if scheduled_at:
            # Effets de bord (stock, confirmateur, quota, webhook) différés jusqu'à
            # l'activation — voir activate_scheduled_order.
            OrderStatusHistory.objects.create(order=order, status='scheduled', changed_by=request.user)
        else:
            OrderStatusHistory.objects.create(order=order, status='pending', changed_by=request.user)
            assign_order_round_robin(order)
            _deduct_stock_for_order(store, order)
            _fire_order_webhook(store, order, 'order.created')

            if quota:
                quota.orders_used += 1
                quota.save(update_fields=['orders_used'])

        return Response(OrderDetailSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.orders.prefetch_related('items', 'history__changed_by').get(pk=pk), None
        except Order.DoesNotExist:
            return None, Response({'detail': 'Commande introuvable.'}, status=404)

    def get(self, request, pk):
        order, err = self._get(request, pk)
        if err: return err
        return Response(OrderDetailSerializer(order).data)

    def put(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Modification réservée au propriétaire ou administrateur.'}, status=403)
        order, err = self._get(request, pk)
        if err: return err
        allowed = ['first_name', 'last_name', 'phone', 'wilaya', 'commune',
                   'address', 'shipping_cost', 'delivery_type', 'note']
        for field in allowed:
            if field in request.data:
                setattr(order, field, request.data[field])
        if 'scheduled_at' in request.data and order.status == 'scheduled':
            new_scheduled_at = parse_datetime(request.data['scheduled_at'] or '')
            if new_scheduled_at is None:
                return Response({'detail': 'scheduled_at invalide (format ISO attendu).'}, status=400)
            if timezone.is_naive(new_scheduled_at):
                new_scheduled_at = timezone.make_aware(new_scheduled_at)
            order.scheduled_at = new_scheduled_at
        order.save()
        order.recalculate()
        return Response(OrderDetailSerializer(order).data)

    def delete(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Suppression réservée au propriétaire ou administrateur.'}, status=403)
        order, err = self._get(request, pk)
        if err: return err
        order.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrderStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            order = store.orders.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=404)

        new_status = request.data.get('status')
        valid = [s[0] for s in STATUS_CHOICES]
        if new_status not in valid:
            return Response({'detail': f'Statut invalide. Valeurs : {valid}'}, status=400)

        # Activation anticipée d'une commande programmée (ex: bouton "Envoyer
        # maintenant") — applique les effets normalement déclenchés à la création.
        # Si le statut demandé est justement 'pending', l'activation suffit.
        if order.status == 'scheduled' and new_status != 'scheduled':
            activate_scheduled_order(store, order, changed_by=request.user)
            if new_status == 'pending':
                return Response(OrderDetailSerializer(order).data)
            order.refresh_from_db()

        order.status = new_status
        order.save(update_fields=['status'])
        OrderStatusHistory.objects.create(
            order      = order,
            status     = new_status,
            changed_by = request.user,
            note       = request.data.get('note', ''),
        )

        carrier_warning = self._maybe_create_shipment(request, store, order, new_status)
        _sync_commission_for_order(store, order, new_status)
        if new_status in STATUS_TO_WEBHOOK_EVENT:
            _fire_order_webhook(store, order, STATUS_TO_WEBHOOK_EVENT[new_status])

        data = OrderDetailSerializer(order).data
        if carrier_warning:
            data['carrier_warning'] = carrier_warning
        return Response(data)

    def _maybe_create_shipment(self, request, store, order, new_status):
        if new_status != 'confirmed' or order.carrier_tracking_number:
            return None

        carrier_id = request.data.get('carrier_id')
        account = None
        if carrier_id:
            account = store.carrier_accounts.filter(pk=carrier_id, is_active=True).first()
        if not account:
            account = store.carrier_accounts.filter(is_default=True, is_active=True).first()

        if not account:
            return 'Aucun transporteur configuré — expédition non créée.'

        try:
            result = get_carrier_client(account).create_shipment(order)
        except Exception as e:
            return f"Erreur transporteur : {e}"

        order.carrier = account
        order.carrier_tracking_number = result.tracking_number
        order.carrier_status = result.status
        order.carrier_shipment_created_at = timezone.now()
        order.save(update_fields=['carrier', 'carrier_tracking_number', 'carrier_status', 'carrier_shipment_created_at'])
        return None


class CarrierAccountListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        accounts = store.carrier_accounts.all()
        return Response(CarrierAccountSerializer(accounts, many=True).data)

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Création réservée au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        carrier = request.data.get('carrier')
        valid = [c[0] for c in CARRIER_CHOICES]
        if carrier not in valid:
            return Response({'detail': f'Transporteur invalide. Valeurs : {valid}'}, status=400)
        if store.carrier_accounts.filter(carrier=carrier).exists():
            return Response({'detail': 'Ce transporteur est déjà connecté pour cette boutique.'}, status=400)

        account = CarrierAccount.objects.create(
            store             = store,
            carrier           = carrier,
            name              = request.data.get('name', ''),
            departure_wilaya  = request.data.get('departure_wilaya', ''),
            api_id            = request.data.get('api_id', ''),
            api_token         = request.data.get('api_token', ''),
            is_active         = request.data.get('is_active', True),
            is_default        = request.data.get('is_default', False),
        )
        return Response(CarrierAccountSerializer(account).data, status=status.HTTP_201_CREATED)


class CarrierAccountDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.carrier_accounts.get(pk=pk), None
        except CarrierAccount.DoesNotExist:
            return None, Response({'detail': 'Compte transporteur introuvable.'}, status=404)

    def put(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Modification réservée au propriétaire ou administrateur.'}, status=403)
        account, err = self._get(request, pk)
        if err: return err
        for field in ['name', 'departure_wilaya', 'api_id', 'api_token', 'is_active', 'is_default']:
            if field in request.data:
                setattr(account, field, request.data[field])
        account.save()
        return Response(CarrierAccountSerializer(account).data)

    def delete(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Suppression réservée au propriétaire ou administrateur.'}, status=403)
        account, err = self._get(request, pk)
        if err: return err
        account.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrderStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        result = {'total': store.orders.count()}
        for code, label in STATUS_CHOICES:
            result[code] = {'label': label, 'count': store.orders.filter(status=code).count()}
        return Response(result)


# ─── Clients (agrégés à la volée depuis Order, pas de modèle Customer) ────────

RISK_STATUSES = ['cancelled', 'returned']


class ClientListView(APIView):
    """Liste des clients agrégée par téléphone. ?risk_only=1 filtre sur le
    risque (auto : commandes cancelled/returned sur la période dépassant le
    seuil de StoreSettings, OU manuel via CustomerRisk.manual_risk)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        settings_obj = getattr(store, 'settings', None)
        threshold = settings_obj.risk_threshold_orders if settings_obj else 3
        period_days = settings_obj.risk_period_days if settings_obj else 90
        cutoff = timezone.now() - timedelta(days=period_days)

        qs = store.orders.all()
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(phone__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search)
            )

        aggregated = qs.values('phone').annotate(
            first_name=Max('first_name'),
            last_name=Max('last_name'),
            email=Max('customer_email'),
            wilaya=Max('wilaya'),
            commune=Max('commune'),
            orders_count=Count('id'),
            risky_count=Count('id', filter=Q(status__in=RISK_STATUSES, created_at__gte=cutoff)),
            created_at=Min('created_at'),
        ).order_by('-created_at')

        manual_risk_phones = set(
            CustomerRisk.objects.filter(store=store, manual_risk=True).values_list('phone', flat=True)
        )

        results = []
        for row in aggregated:
            is_risky = row['risky_count'] >= threshold or row['phone'] in manual_risk_phones
            if request.query_params.get('risk_only') and not is_risky:
                continue
            results.append({
                'phone':          row['phone'],
                'first_name':     row['first_name'],
                'last_name':      row['last_name'],
                'email':          row['email'],
                'wilaya':         row['wilaya'],
                'commune':        row['commune'],
                'orders_count':   row['orders_count'],
                'risky_count':    row['risky_count'],
                'is_risky':       is_risky,
                'manual_risk':    row['phone'] in manual_risk_phones,
                'created_at':     row['created_at'],
            })

        page     = max(1, int(request.query_params.get('page', 1)))
        per_page = int(request.query_params.get('per_page', 10))
        total    = len(results)
        results  = results[(page - 1) * per_page: page * per_page]

        return Response({'count': total, 'page': page, 'per_page': per_page, 'results': results})


class CustomerRiskToggleView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def post(self, request, phone):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        risk, _ = CustomerRisk.objects.get_or_create(store=store, phone=phone)
        risk.manual_risk = not risk.manual_risk
        risk.note = request.data.get('note', risk.note)
        risk.save(update_fields=['manual_risk', 'note', 'updated_at'])
        return Response({'phone': phone, 'manual_risk': risk.manual_risk})


class BlacklistListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        qs = store.blacklisted_phones.all()
        return Response(BlacklistedPhoneSerializer(qs, many=True).data)

    def post(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        s = BlacklistedPhoneSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save(store=store)
        return Response(s.data, status=status.HTTP_201_CREATED)


class BlacklistDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.blacklisted_phones.get(pk=pk), None
        except BlacklistedPhone.DoesNotExist:
            return None, Response({'detail': 'Entrée introuvable.'}, status=404)

    def put(self, request, pk):
        entry, err = self._get(request, pk)
        if err: return err
        s = BlacklistedPhoneSerializer(entry, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def delete(self, request, pk):
        entry, err = self._get(request, pk)
        if err: return err
        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Réclamations ──────────────────────────────────────────────────────────────

class ComplaintListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        qs = store.complaints.select_related('order').all()

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(order__phone__icontains=search) |
                Q(order__first_name__icontains=search) |
                Q(order__last_name__icontains=search) |
                Q(subject__icontains=search)
            )

        page     = max(1, int(request.query_params.get('page', 1)))
        per_page = int(request.query_params.get('per_page', 10))
        total    = qs.count()
        qs       = qs[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  ComplaintSerializer(qs, many=True).data,
        })


class ComplaintDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.complaints.select_related('order').prefetch_related('messages__author').get(pk=pk), None
        except Complaint.DoesNotExist:
            return None, Response({'detail': 'Réclamation introuvable.'}, status=404)

    def get(self, request, pk):
        complaint, err = self._get(request, pk)
        if err: return err
        return Response(ComplaintDetailSerializer(complaint).data)


class ComplaintStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            complaint = store.complaints.get(pk=pk)
        except Complaint.DoesNotExist:
            return Response({'detail': 'Réclamation introuvable.'}, status=404)

        new_status = request.data.get('status')
        valid = [s[0] for s in COMPLAINT_STATUS_CHOICES]
        if new_status not in valid:
            return Response({'detail': f'Statut invalide. Valeurs : {valid}'}, status=400)

        complaint.status = new_status
        complaint.save(update_fields=['status', 'updated_at'])
        ComplaintMessage.objects.create(
            complaint = complaint,
            status    = new_status,
            message   = request.data.get('note', ''),
            author    = request.user,
        )
        return Response(ComplaintDetailSerializer(complaint).data)


class ComplaintMessageCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            complaint = store.complaints.get(pk=pk)
        except Complaint.DoesNotExist:
            return Response({'detail': 'Réclamation introuvable.'}, status=404)

        message = request.data.get('message', '').strip()
        if not message:
            return Response({'detail': 'Message vide.'}, status=400)

        ComplaintMessage.objects.create(complaint=complaint, message=message, author=request.user)
        return Response(ComplaintDetailSerializer(complaint).data, status=status.HTTP_201_CREATED)


def _get_public_store_for_complaints(slug):
    from stores.models import Store
    try:
        return Store.objects.get(slug=slug, is_active=True)
    except Store.DoesNotExist:
        return None


class PublicComplaintCreateView(APIView):
    """Le client ne fournit que son téléphone (+ éventuellement le numéro de
    commande reçu à la confirmation d'achat) — jamais de liste de commandes
    renvoyée au client, pour éviter qu'un tiers ne devine un téléphone et
    consulte les commandes/montants de quelqu'un d'autre."""
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        store_slug = request.data.get('store_slug')
        if not store_slug:
            return Response({'detail': 'store_slug requis.'}, status=400)
        store = _get_public_store_for_complaints(store_slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        order_id    = request.data.get('order_id')
        phone       = (request.data.get('phone') or '').strip()
        subject     = (request.data.get('subject') or '').strip()
        description = (request.data.get('description') or '').strip()

        if not phone or not subject or not description:
            return Response({'detail': 'Tous les champs sont requis.'}, status=400)

        if order_id:
            order = store.orders.filter(pk=order_id, phone=phone).first()
        else:
            order = store.orders.filter(phone=phone).order_by('-created_at').first()

        if not order:
            return Response({'detail': 'Aucune commande trouvée avec ce numéro de téléphone.'}, status=404)

        complaint = Complaint.objects.create(store=store, order=order, subject=subject, description=description)
        ComplaintMessage.objects.create(complaint=complaint, message=description, status='open', author=None)

        return Response({'id': complaint.id, 'detail': 'Réclamation envoyée.'}, status=status.HTTP_201_CREATED)


# ─── Échanges produit ──────────────────────────────────────────────────────────

class ExchangeListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        qs = store.exchange_requests.select_related('order_item__order', 'replacement_option').all()

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        page     = max(1, int(request.query_params.get('page', 1)))
        per_page = int(request.query_params.get('per_page', 10))
        total    = qs.count()
        qs       = qs[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  ExchangeRequestSerializer(qs, many=True).data,
        })


class ExchangeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            exchange = store.exchange_requests.select_related('order_item__order', 'replacement_option').get(pk=pk)
        except ExchangeRequest.DoesNotExist:
            return Response({'detail': 'Échange introuvable.'}, status=404)

        from products.serializers import StockMovementSerializer
        movements = store.stock_movements.filter(note=f"Échange #{exchange.id}")

        data = ExchangeRequestSerializer(exchange).data
        data['stock_movements'] = StockMovementSerializer(movements, many=True).data
        return Response(data)


class ExchangeStatusView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            exchange = store.exchange_requests.select_for_update().select_related('order_item', 'replacement_option').get(pk=pk)
        except ExchangeRequest.DoesNotExist:
            return Response({'detail': 'Échange introuvable.'}, status=404)

        new_status = request.data.get('status')
        valid = [s[0] for s in EXCHANGE_STATUS_CHOICES]
        if new_status not in valid:
            return Response({'detail': f'Statut invalide. Valeurs : {valid}'}, status=400)

        if exchange.status != 'open':
            return Response({'detail': 'Cette demande a déjà été traitée.'}, status=400)

        exchange.status = new_status
        exchange.vendor_note = request.data.get('note', '')
        exchange.save(update_fields=['status', 'vendor_note', 'updated_at'])

        if new_status == 'approved':
            from products.models import StockMovement
            item = exchange.order_item
            original_option = item.variant_option
            replacement = exchange.replacement_option

            if original_option:
                original_option.stock += item.quantity
                original_option.save(update_fields=['stock'])
            elif item.product:
                item.product.stock += item.quantity
                item.product.save(update_fields=['stock'])

            replacement.stock = max(replacement.stock - item.quantity, 0)
            replacement.save(update_fields=['stock'])

            note = f"Échange #{exchange.id}"
            StockMovement.objects.create(
                store=store, product=item.product, variant_option=original_option,
                quantity=item.quantity, reason='exchange_return', note=note,
            )
            StockMovement.objects.create(
                store=store, product=replacement.variant.product, variant_option=replacement,
                quantity=-item.quantity, reason='exchange_issue', note=note,
            )

        return Response(ExchangeRequestSerializer(exchange).data)


def _get_public_store_for_exchanges(slug):
    from stores.models import Store
    try:
        return Store.objects.get(slug=slug, is_active=True)
    except Store.DoesNotExist:
        return None


class PublicExchangeCreateView(APIView):
    """Même principe de vérification que PublicComplaintCreateView : la commande
    doit appartenir à la boutique et le téléphone doit correspondre, avant de
    pouvoir référencer un article précis de cette commande."""
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        store_slug = request.data.get('store_slug')
        if not store_slug:
            return Response({'detail': 'store_slug requis.'}, status=400)
        store = _get_public_store_for_exchanges(store_slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        order_id              = request.data.get('order_id')
        phone                 = (request.data.get('phone') or '').strip()
        order_item_id         = request.data.get('order_item_id')
        replacement_option_id = request.data.get('replacement_option_id')
        reason                = (request.data.get('reason') or '').strip()

        if not phone or not order_item_id or not replacement_option_id or not reason:
            return Response({'detail': 'Tous les champs sont requis.'}, status=400)

        if order_id:
            order = store.orders.filter(pk=order_id, phone=phone).first()
        else:
            order = store.orders.filter(phone=phone).order_by('-created_at').first()
        if not order:
            return Response({'detail': 'Commande introuvable — vérifiez le numéro de commande et le téléphone.'}, status=404)

        order_item = order.items.filter(pk=order_item_id).first()
        if not order_item or not order_item.product:
            return Response({'detail': 'Article introuvable pour cette commande.'}, status=404)

        from products.models import VariantOption
        replacement = VariantOption.objects.filter(pk=replacement_option_id, variant__product=order_item.product).first()
        if not replacement:
            return Response({'detail': 'Variante de remplacement invalide pour ce produit.'}, status=400)

        exchange = ExchangeRequest.objects.create(
            store=store, order_item=order_item, replacement_option=replacement, reason=reason,
        )
        return Response({'id': exchange.id, 'detail': 'Demande d\'échange envoyée.'}, status=status.HTTP_201_CREATED)


class PublicOrderItemsView(APIView):
    """Retourne les articles d'UNE commande précise, jamais une recherche
    ouverte. Si order_id est fourni, il doit correspondre au téléphone. Si le
    client ne connaît pas son numéro de commande, on retombe sur SA commande
    la plus récente (comme PublicComplaintCreateView) — jamais un choix parmi
    plusieurs commandes, pour limiter ce qu'un tiers connaissant le téléphone
    peut voir à une seule commande récente plutôt qu'à tout l'historique."""
    permission_classes = [AllowAny]

    def get(self, request, slug):
        store = _get_public_store_for_exchanges(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        order_id = request.query_params.get('order_id')
        phone    = (request.query_params.get('phone') or '').strip()
        if not phone:
            return Response({'detail': 'Téléphone requis.'}, status=400)

        qs = store.orders.prefetch_related('items__product__variants__options')
        if order_id:
            order = qs.filter(pk=order_id, phone=phone).first()
        else:
            order = qs.filter(phone=phone).order_by('-created_at').first()
        if not order:
            return Response({'detail': 'Commande introuvable — vérifiez le numéro de commande et le téléphone.'}, status=404)

        items = []
        for item in order.items.all():
            if not item.product:
                continue
            options = []
            for variant in item.product.variants.all():
                for opt in variant.options.filter(is_active=True):
                    if item.variant_option_id and opt.id == item.variant_option_id:
                        continue
                    options.append({'id': opt.id, 'value': opt.value, 'variant_name': variant.name})
            items.append({
                'id':                 item.id,
                'product_name':       item.product_name,
                'current_option':     item.variant_option.value if item.variant_option else None,
                'quantity':           item.quantity,
                'replacement_options': options,
            })

        return Response({'order_id': order.id, 'items': items})


class ConfirmationRateView(APIView):
    permission_classes = [IsAuthenticated]

    CONFIRMED_STATUSES = ['confirmed', 'shipped', 'delivered']
    PROCESSED_STATUSES = ['no_answer_1', 'no_answer_2', 'no_answer_3', 'confirmed', 'shipped', 'delivered', 'returned', 'cancelled']

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'stats_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        # Calcul de la plage de dates
        period    = request.query_params.get('period', 'week')
        today     = date.today()
        if period == 'day':
            date_from = today
            date_to   = today
        elif period == 'month':
            date_from = today - timedelta(days=30)
            date_to   = today
        elif period == 'custom':
            try:
                date_from = date.fromisoformat(request.query_params.get('date_from', str(today - timedelta(days=7))))
                date_to   = date.fromisoformat(request.query_params.get('date_to', str(today)))
            except ValueError:
                return Response({'detail': 'Format de date invalide (YYYY-MM-DD).'}, status=400)
        else:  # week (default)
            date_from = today - timedelta(days=7)
            date_to   = today

        qs = store.orders.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)

        # Stats globales
        totals = qs.aggregate(
            processed=Count(Case(When(status__in=self.PROCESSED_STATUSES, then=1), output_field=IntegerField())),
            confirmed=Count(Case(When(status__in=self.CONFIRMED_STATUSES, then=1), output_field=IntegerField())),
        )
        processed = totals['processed'] or 0
        confirmed = totals['confirmed'] or 0
        rate = round(confirmed / processed * 100, 1) if processed else 0.0

        # Stats par confirmateur via OrderAssignment
        assignments = (
            store.orders
            .filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
            .filter(assignment__isnull=False)
            .values('assignment__confirmateur__id',
                    'assignment__confirmateur__first_name',
                    'assignment__confirmateur__last_name')
            .annotate(
                processed=Count(Case(When(status__in=self.PROCESSED_STATUSES, then=1), output_field=IntegerField())),
                confirmed=Count(Case(When(status__in=self.CONFIRMED_STATUSES, then=1), output_field=IntegerField())),
            )
        )

        by_confirmateur = []
        for a in assignments:
            conf_processed = a['processed'] or 0
            conf_confirmed = a['confirmed'] or 0
            conf_rate = round(conf_confirmed / conf_processed * 100, 1) if conf_processed else 0.0
            by_confirmateur.append({
                'confirmateur_id':   a['assignment__confirmateur__id'],
                'confirmateur_name': f"{a['assignment__confirmateur__first_name']} {a['assignment__confirmateur__last_name']}".strip(),
                'processed':         conf_processed,
                'confirmed':         conf_confirmed,
                'rate':              conf_rate,
            })

        by_confirmateur.sort(key=lambda x: x['rate'], reverse=True)

        return Response({
            'period':     period,
            'date_from':  str(date_from),
            'date_to':    str(date_to),
            'total_processed': processed,
            'total_confirmed': confirmed,
            'confirmation_rate': rate,
            'by_confirmateur': by_confirmateur,
        })


class PublicOrderView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        from stores.models import Store
        from products.models import Promotion
        store_slug = request.data.get('store_slug')
        if not store_slug:
            return Response({'detail': 'store_slug requis.'}, status=400)
        try:
            store = Store.objects.get(slug=store_slug, is_active=True)
        except Store.DoesNotExist:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        phone_input = request.data.get('phone', '')
        blocked = store.blacklisted_phones.filter(phone=phone_input).first()
        if blocked:
            blocked.blocked_attempts += 1
            blocked.last_attempt_at = timezone.now()
            blocked.save(update_fields=['blocked_attempts', 'last_attempt_at'])
            return Response({'detail': blocked.message or 'Commande refusée.'}, status=403)

        try:
            quota = store.quota
            if quota.orders_used >= quota.orders_limit:
                return Response({'detail': 'Cette boutique ne peut plus accepter de commandes.'}, status=403)
        except Exception:
            quota = None

        items_data = request.data.get('items', [])
        if not items_data:
            return Response({'detail': 'Panier vide.'}, status=400)

        payment_method = request.data.get('payment_method', 'cod')
        if payment_method not in ('cod', 'chargily'):
            return Response({'detail': 'Mode de paiement invalide.'}, status=400)

        # Prix résolus côté serveur (jamais celui envoyé par le client) avant
        # toute création — utilisés aussi pour le calcul du code promo, pour
        # qu'un prix falsifié ne puisse pas non plus fausser la remise.
        resolved_prices = []
        for item in items_data:
            price = _authoritative_item_price(store, item)
            if price is None:
                return Response({'detail': 'Un article du panier est introuvable.'}, status=400)
            resolved_prices.append(price)
        resolved_items_data = [
            {**item, 'price': price} for item, price in zip(items_data, resolved_prices)
        ]

        # Code promo : validé et verrouillé (select_for_update) AVANT toute création,
        # pour ne rien laisser en base si le code est invalide, et pour éviter une
        # race condition sur max_uses en cas de commandes simultanées.
        promo = None
        discount_amount = 0
        promo_code_input = (request.data.get('promo_code') or '').strip().upper()
        if promo_code_input:
            try:
                promo = Promotion.objects.select_for_update().get(store=store, kind='code', code=promo_code_input)
            except Promotion.DoesNotExist:
                return Response({'detail': 'Code promo invalide.'}, status=400)
            if not promo.is_valid_now():
                return Response({'detail': "Ce code promo est expiré, inactif ou a atteint son nombre maximum d'utilisations."}, status=400)
            discount_amount = promo.compute_discount_for_items(resolved_items_data)
            if discount_amount <= 0:
                return Response({'detail': "Ce code promo ne s'applique à aucun article de votre panier."}, status=400)

        order = Order.objects.create(
            store         = store,
            first_name    = request.data.get('first_name', ''),
            last_name     = request.data.get('last_name', ''),
            phone         = request.data.get('phone', ''),
            wilaya        = request.data.get('wilaya', ''),
            commune       = request.data.get('commune', ''),
            address       = request.data.get('address', ''),
            shipping_cost = request.data.get('shipping_cost', 0),
            payment_method = payment_method,
            note          = request.data.get('note', ''),
            promo_code      = promo.code if promo else '',
            discount_amount = discount_amount,
        )

        for item, price in zip(items_data, resolved_prices):
            OrderItem.objects.create(
                order             = order,
                product_id        = item.get('product'),
                variant_option_id = item.get('variant_option'),
                product_name      = item.get('product_name', ''),
                price             = price,
                quantity          = item.get('quantity', 1),
            )

        order.recalculate()
        OrderStatusHistory.objects.create(order=order, status='pending')
        assign_order_round_robin(order)
        _deduct_stock_for_order(store, order)
        _fire_order_webhook(store, order, 'order.created')

        if promo:
            promo.uses_count += 1
            promo.save(update_fields=['uses_count'])

        payment_url = None
        detail = 'Commande reçue.'

        if payment_method == 'cod':
            if quota:
                quota.orders_used += 1
                quota.save(update_fields=['orders_used'])
        else:
            try:
                checkout_id, payment_link = chargily.create_checkout(order)
                order.chargily_checkout_id  = checkout_id
                order.chargily_payment_link = payment_link
                order.save(update_fields=['chargily_checkout_id', 'chargily_payment_link'])
                payment_url = payment_link
            except chargily.ChargilyError:
                detail = "Commande créée mais le lien de paiement n'a pas pu être généré. Le vendeur vous contactera."

        return Response({'id': order.id, 'detail': detail, 'payment_url': payment_url}, status=status.HTTP_201_CREATED)


class ChargilyWebhookView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw_body = request.body
        signature_header = request.headers.get('Signature', '')
        signature_valid = chargily.verify_webhook_signature(raw_body, signature_header)

        try:
            payload = json.loads(raw_body or b'{}')
        except json.JSONDecodeError:
            payload = {}

        event_type  = payload.get('type', '')
        data        = payload.get('data', {}) or {}
        checkout_id = data.get('id', '')
        metadata    = data.get('metadata') or {}

        if not signature_valid:
            # Epic 8.6 — faille critique corrigée : la signature était calculée
            # et journalisée mais jamais appliquée, permettant à quiconque de
            # forger un faux "checkout.paid" (confirmation de commande ou
            # upgrade d'abonnement gratuits, sans authentification).
            PaymentWebhookLog.objects.create(
                order=None, event_type=event_type, checkout_id=checkout_id,
                raw_payload=payload, signature_valid=False,
                status='error', error_message='Signature invalide — requête rejetée.',
            )
            return Response(status=403)

        if metadata.get('subscription'):
            return self._handle_subscription_webhook(event_type, checkout_id, metadata, payload, signature_valid)

        order = None
        if checkout_id:
            order = Order.objects.filter(chargily_checkout_id=checkout_id).first()
        if not order:
            order_id = (data.get('metadata') or {}).get('order_id')
            if order_id:
                order = Order.objects.filter(id=order_id).first()

        log = PaymentWebhookLog.objects.create(
            order           = order,
            event_type      = event_type,
            checkout_id     = checkout_id,
            raw_payload     = payload,
            signature_valid = signature_valid,
            status          = 'received',
        )

        try:
            if not order:
                log.status = 'error'
                log.error_message = 'Aucune commande correspondante trouvée.'
                log.save(update_fields=['status', 'error_message'])
                return Response(status=200)

            if event_type == 'checkout.paid':
                order.status = 'confirmed'
                order.save(update_fields=['status'])
                OrderStatusHistory.objects.create(
                    order  = order,
                    status = 'confirmed',
                    note   = 'Paiement confirmé automatiquement via Chargily.',
                )
                try:
                    quota = order.store.quota
                    quota.orders_used += 1
                    quota.save(update_fields=['orders_used'])
                except Exception:
                    pass
                _fire_order_webhook(order.store, order, 'order.paid')
                _fire_order_webhook(order.store, order, 'order.confirmed')
                log.status = 'processed'
                log.save(update_fields=['status'])

            elif event_type in ('checkout.failed', 'checkout.expired'):
                OrderStatusHistory.objects.create(
                    order  = order,
                    status = order.status,
                    note   = "Paiement Chargily échoué. Commande non confirmée automatiquement.",
                )
                if order.store.email:
                    send_mail(
                        subject=f"MZSolutions — Paiement échoué pour la commande #{order.id}",
                        message=(
                            f"Le paiement en ligne (Chargily) pour la commande #{order.id} "
                            f"({order.first_name} {order.last_name}) a échoué.\n\n"
                            "La commande n'a pas été confirmée automatiquement. "
                            "Vous pouvez la traiter manuellement depuis votre tableau de bord."
                        ),
                        from_email=None,
                        recipient_list=[order.store.email],
                        fail_silently=True,
                    )
                log.status = 'processed'
                log.save(update_fields=['status'])

            else:
                log.status = 'error'
                log.error_message = f"Type d'événement non géré : {event_type}"
                log.save(update_fields=['status', 'error_message'])

        except Exception as e:
            log.status = 'error'
            log.error_message = str(e)
            log.save(update_fields=['status', 'error_message'])

        return Response(status=200)

    def _handle_subscription_webhook(self, event_type, checkout_id, metadata, payload, signature_valid):
        """Traite un checkout.paid pour un abonnement (Epic 8.5 US-8.5.1) —
        upgrade le quota de la boutique (nouveau plan, nouvelle limite,
        période payée). Toujours 200 + journalisé, même en erreur, même
        philosophie que le flux commande."""
        from stores.models import Store, SubscriptionPlan
        from datetime import timedelta

        store = Store.objects.filter(id=metadata.get('store_id')).first()
        log = PaymentWebhookLog.objects.create(
            order=None, event_type=event_type, checkout_id=checkout_id,
            raw_payload=payload, signature_valid=signature_valid, status='received',
        )
        if not store:
            log.status = 'error'
            log.error_message = 'Boutique introuvable pour cet abonnement.'
            log.save(update_fields=['status', 'error_message'])
            return Response(status=200)

        try:
            if event_type == 'checkout.paid':
                plan = SubscriptionPlan.objects.filter(id=metadata.get('plan_id')).first()
                billing_cycle = metadata.get('billing_cycle', 'monthly')
                if plan:
                    quota = store.quota
                    quota.plan = plan
                    quota.billing_cycle = billing_cycle
                    quota.orders_limit = plan.orders_limit if plan.orders_limit is not None else 10**9
                    quota.orders_used = 0
                    days = 365 if billing_cycle == 'yearly' else 30
                    quota.period_end = timezone.now() + timedelta(days=days)
                    quota.save(update_fields=['plan', 'billing_cycle', 'orders_limit', 'orders_used', 'period_end'])
                    log.status = 'processed'
                else:
                    log.status = 'error'
                    log.error_message = 'Palier introuvable pour cet abonnement.'
                log.save(update_fields=['status', 'error_message'])
            else:
                log.status = 'processed'
                log.save(update_fields=['status'])
        except Exception as e:
            log.status = 'error'
            log.error_message = str(e)
            log.save(update_fields=['status', 'error_message'])

        return Response(status=200)


# ─── Assignment ───────────────────────────────────────────────────────────────

class OrderAssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def _order(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store, store.orders.get(pk=pk), None
        except Order.DoesNotExist:
            return store, None, Response({'detail': 'Commande introuvable.'}, status=404)

    def get(self, request, pk):
        store, order, err = self._order(request, pk)
        if err: return err
        try:
            return Response(OrderAssignmentSerializer(order.assignment).data)
        except OrderAssignment.DoesNotExist:
            return Response(None)

    def put(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Réassignation réservée au propriétaire ou administrateur.'}, status=403)
        from team.models import TeamMember
        store, order, err = self._order(request, pk)
        if err: return err
        confirmateur_id = request.data.get('confirmateur')
        if not confirmateur_id:
            return Response({'detail': 'confirmateur requis.'}, status=400)
        try:
            confirmateur = store.team_members.get(pk=confirmateur_id, role='confirmateur', is_active=True)
        except Exception:
            return Response({'detail': 'Confirmateur invalide.'}, status=400)
        assignment, _ = OrderAssignment.objects.update_or_create(
            order=order,
            defaults={'confirmateur': confirmateur, 'assigned_by': request.user},
        )
        return Response(OrderAssignmentSerializer(assignment).data)


# ─── Call Attempts ────────────────────────────────────────────────────────────

class CallAttemptListView(APIView):
    permission_classes = [IsAuthenticated]

    def _order(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            order = store.orders.get(pk=pk)
        except Order.DoesNotExist:
            return None, Response({'detail': 'Commande introuvable.'}, status=404)

        # Epic 8.6 — auparavant aucun contrôle : n'importe quel membre
        # d'équipe (y compris un dropshipper) pouvait lire/créer des
        # tentatives d'appel sur une commande qui ne lui était pas assignée.
        if not is_owner_or_admin(request):
            membership = getattr(request.user, 'team_membership', None)
            is_assigned_confirmateur = (
                membership and getattr(order, 'assignment', None)
                and order.assignment.confirmateur_id == membership.id
            )
            is_own_dropshipper_order = membership and order.dropshipper_id == membership.id
            if not (is_assigned_confirmateur or is_own_dropshipper_order):
                return None, Response({'detail': 'Accès refusé.'}, status=403)

        return order, None

    def get(self, request, pk):
        order, err = self._order(request, pk)
        if err: return err
        return Response(CallAttemptSerializer(order.call_attempts.all(), many=True).data)

    def post(self, request, pk):
        from team.models import TeamMember
        order, err = self._order(request, pk)
        if err: return err

        call_status = request.data.get('status')
        if call_status not in [s[0] for s in CALL_STATUS_CHOICES]:
            return Response({'detail': 'Statut invalide.'}, status=400)

        # Déterminer l'agent (confirmateur connecté si team_member)
        agent = None
        try:
            agent = request.user.team_membership
        except Exception:
            pass

        attempt = CallAttempt.objects.create(
            order          = order,
            agent          = agent,
            attempt_number = order.call_attempts.count() + 1,
            status         = call_status,
            failure_reason_id = request.data.get('failure_reason'),
            note           = request.data.get('note', ''),
        )
        return Response(CallAttemptSerializer(attempt).data, status=status.HTTP_201_CREATED)


class CallAttemptDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, cid):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            attempt = CallAttempt.objects.get(pk=cid, order__store=store, order_id=pk)
        except CallAttempt.DoesNotExist:
            return Response({'detail': 'Tentative introuvable.'}, status=404)
        attempt.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Failure Reasons ─────────────────────────────────────────────────────────

class FailureReasonListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        qs = store.failure_reasons.all()
        if request.query_params.get('active') == '1':
            qs = qs.filter(is_active=True)
        return Response(FailureReasonSerializer(qs, many=True).data)

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        s = FailureReasonSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save(store=store)
        return Response(s.data, status=status.HTTP_201_CREATED)


class FailureReasonDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.failure_reasons.get(pk=pk), None
        except FailureReason.DoesNotExist:
            return None, Response({'detail': 'Introuvable.'}, status=404)

    def put(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        reason, err = self._get(request, pk)
        if err: return err
        s = FailureReasonSerializer(reason, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def delete(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        reason, err = self._get(request, pk)
        if err: return err
        reason.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Paniers abandonnés ───────────────────────────────────────────────────────

class PublicAbandonedCartView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        store_slug = request.data.get('store_slug')
        phone = (request.data.get('phone') or '').strip()
        if not store_slug or not phone:
            return Response({'detail': 'store_slug et phone sont requis.'}, status=400)
        try:
            from stores.models import Store
            store = Store.objects.get(slug=store_slug)
        except Store.DoesNotExist:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        # Ne pas écraser un panier déjà récupéré
        existing = AbandonedCart.objects.filter(store=store, phone=phone, is_recovered=True).first()
        if existing:
            return Response({'detail': 'Commande déjà finalisée.'}, status=200)

        obj, _ = AbandonedCart.objects.update_or_create(
            store=store,
            phone=phone,
            is_recovered=False,
            defaults={
                'first_name': request.data.get('first_name', ''),
                'last_name':  request.data.get('last_name', ''),
                'email':      request.data.get('email', ''),
                'wilaya':     request.data.get('wilaya', ''),
                'items':      request.data.get('items', []),
                'total':      request.data.get('total', 0),
                'reminder_sent': False,
            }
        )
        return Response({'id': obj.pk}, status=200)


class PublicMarkCartRecoveredView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        store_slug = request.data.get('store_slug')
        phone = (request.data.get('phone') or '').strip()
        if not store_slug or not phone:
            return Response({'detail': 'store_slug et phone sont requis.'}, status=400)
        AbandonedCart.objects.filter(
            store__slug=store_slug, phone=phone, is_recovered=False
        ).update(is_recovered=True, recovered_at=timezone.now())
        return Response({'detail': 'Panier marqué comme récupéré.'})


class AbandonedCartListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        qs = store.abandoned_carts.all()
        recovered = request.query_params.get('recovered')
        if recovered == '1':
            qs = qs.filter(is_recovered=True)
        elif recovered == '0':
            qs = qs.filter(is_recovered=False)
        try:
            page     = max(1, int(request.query_params.get('page', 1)))
            per_page = max(1, min(100, int(request.query_params.get('per_page', 20))))
        except ValueError:
            page, per_page = 1, 20
        total  = qs.count()
        offset = (page - 1) * per_page
        results = AbandonedCartSerializer(qs[offset:offset + per_page], many=True).data
        return Response({'count': total, 'page': page, 'per_page': per_page, 'results': results})
