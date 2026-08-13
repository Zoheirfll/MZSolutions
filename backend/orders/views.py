import hashlib
import hmac
import json
from decimal import Decimal
from io import BytesIO
from datetime import date, timedelta
from django.core.mail import send_mail
from django.http import HttpResponse
from django.db import transaction
from django.db.models import Q, Count, Case, When, IntegerField, Max, Min
from django.db.models.functions import TruncDate
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from .models import Order, OrderItem, OrderStatusHistory, STATUS_CHOICES, NO_ANSWER_STATUSES, OrderAssignment, FailureReason, CallAttempt, CALL_STATUS_CHOICES, PaymentWebhookLog, AbandonedCart, CarrierAccount, CARRIER_CHOICES, CustomerRisk, BlacklistedPhone, Complaint, ComplaintMessage, ComplaintAssignment, COMPLAINT_STATUS_CHOICES, ExchangeRequest, EXCHANGE_STATUS_CHOICES, WilayaRate, CommuneRate
from .serializers import OrderSerializer, OrderDetailSerializer, OrderAssignmentSerializer, FailureReasonSerializer, CallAttemptSerializer, AbandonedCartSerializer, CarrierAccountSerializer, BlacklistedPhoneSerializer, ComplaintSerializer, ComplaintDetailSerializer, ExchangeRequestSerializer, WilayaRateSerializer, CommuneRateSerializer
from .utils import assign_order_round_robin, assign_complaint_round_robin, send_abandoned_cart_email
from . import chargily
from .carriers import get_carrier_client
from .carriers.ecotrack import TrackingNotFoundError
from .carriers.yalidine import YALIDINE_STATUS_MAP
from core.permissions import IsOwnerOrAdminForWrites, is_owner_or_admin, has_permission
from core.validators import validate_uploaded_file
from core.pagination import parse_pagination
from django.core.exceptions import ValidationError as DjangoValidationError


def _get_store(request):
    try:
        return request.user.store
    except Exception:
        pass
    try:
        return request.user.team_membership.store
    except Exception:
        return None


def _quota_block_reason(quota):
    """Refuse la création de commande si le quota de commandes est atteint
    OU si l'essai gratuit est expiré sans abonnement payant actif — jusqu'ici
    seul le compteur de commandes bloquait, l'expiration de l'essai
    (badge "Expiré" du tableau de bord) n'avait aucun effet réel côté serveur."""
    if quota.orders_used >= quota.orders_limit:
        return 'Quota de commandes atteint.'
    if not quota.is_trial_active and not quota.is_subscription_active:
        return "Période d'essai expirée — un abonnement actif est requis pour continuer."
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


MAX_ORDER_ITEM_QUANTITY = 10000


def _validate_item_quantity(item):
    """`OrderItem.quantity` (PositiveIntegerField) n'a pas de contrainte CHECK
    en base sur ce projet — .objects.create() contourne toute validation
    Django. Sans ce contrôle, une quantité négative envoyée par le client
    (checkout invité y compris) peut réduire artificiellement order.total via
    recalculate() et gonfler le stock via _deduct_stock_for_order() (Sécurité
    — point 8). Retourne la quantité (int) si valide, sinon None."""
    quantity = item.get('quantity', 1)
    try:
        quantity = int(quantity)
    except (TypeError, ValueError):
        return None
    if quantity < 1 or quantity > MAX_ORDER_ITEM_QUANTITY:
        return None
    return quantity


def _validate_shipping_cost(request):
    """`Order.shipping_cost` est fourni tel quel par le client (aucun calcul
    automatique par wilaya pour l'instant, cf. TBD CLAUDE.md) — sans validation,
    une valeur négative permettait de faire passer order.total sous zéro même
    après le floor sur (subtotal - discount_amount), puisque shipping_cost est
    ajouté après ce floor dans Order.recalculate() (Sécurité — point 13,
    checkout invité inclus). Retourne la valeur (Decimal-compatible) si valide,
    sinon None."""
    from decimal import Decimal, InvalidOperation
    raw = request.data.get('shipping_cost', 0)
    try:
        value = Decimal(str(raw))
    except (InvalidOperation, ValueError, TypeError):
        return None
    if value < 0:
        return None
    return value


def _resolve_shipping_rates(store, wilaya_name, commune_name=None):
    """Résout {'tarif': .., 'tarif_stopdesk': ..} (domicile/bureau) pour une
    destination — priorité : `CommuneRate` (si commune fournie et trouvée) >
    `WilayaRate` > tarif transporteur par défaut en temps réel. None si rien
    n'est résolvable (pas de grille, pas de transporteur, wilaya inconnue).
    Source unique consommée par `_resolve_shipping_cost` (dashboard/checkout
    manuel) et les endpoints d'affichage (`CarrierRatesView`-like, tableau de
    bord, boutique publique) pour ne jamais diverger."""
    from .wilaya_codes import wilaya_code
    from .models import WilayaRate, CommuneRate
    wid = wilaya_code(wilaya_name)
    if not wid:
        return None

    if commune_name:
        commune_rate = CommuneRate.objects.filter(store=store, wilaya_id=wid, commune_name__iexact=commune_name.strip()).first()
        if commune_rate:
            return {'tarif': commune_rate.home_price, 'tarif_stopdesk': commune_rate.desk_price}

    wilaya_rate = WilayaRate.objects.filter(store=store, wilaya_id=wid).first()
    if wilaya_rate:
        return {'tarif': wilaya_rate.home_price, 'tarif_stopdesk': wilaya_rate.desk_price}

    account = store.carrier_accounts.filter(is_default=True, is_active=True).first()
    if not account:
        return None
    try:
        rates = get_carrier_client(account).get_rates(wid)
    except Exception:
        return None
    if not rates:
        return None
    return {
        'tarif':          Decimal(str(rates['tarif'])),
        'tarif_stopdesk': Decimal(str(rates['tarif_stopdesk'])) if rates.get('tarif_stopdesk') is not None else None,
    }


def _resolve_shipping_cost(store, wilaya_name, stop_desk, fallback, commune_name=None):
    """Wrapper de `_resolve_shipping_rates` pour les appelants qui veulent
    directement un montant unique (checkout — `fallback` déjà validé
    non-négatif, même logique de défense que `_authoritative_item_price`
    pour les prix produits, Epic 8.6)."""
    rates = _resolve_shipping_rates(store, wilaya_name, commune_name)
    if not rates:
        return fallback
    if stop_desk and rates.get('tarif_stopdesk') is not None:
        return rates['tarif_stopdesk']
    return rates['tarif']


def _valid_delivery_types(request):
    """Valide et normalise `delivery_types` (liste de codes DELIVERY_CHOICES,
    plusieurs combinables — ex: Assurance + Échange). Accepte aussi l'ancien
    format `delivery_type` (chaîne unique) pour compat, sans le stocker tel
    quel côté modèle."""
    from .models import DELIVERY_CHOICES
    valid_codes = {c[0] for c in DELIVERY_CHOICES}
    raw = request.data.get('delivery_types')
    if raw is None:
        single = request.data.get('delivery_type')
        raw = [single] if single else []
    if not isinstance(raw, list):
        return None
    codes = [c for c in raw if c in valid_codes]
    if len(codes) != len(raw):
        return None
    return codes


def _apply_delivery_type_shipping(store, shipping_cost, delivery_types):
    """"Vendu depuis le magasin"/"Livraison gratuite" forcent les frais à 0 ;
    "Assurance" ajoute le supplément configuré (`StoreSettings.insurance_fee`).
    "Échange" reste un pur tag, aucun effet ici (décision produit 2026-08)."""
    if 'store' in delivery_types or 'free' in delivery_types:
        return Decimal('0')
    if 'insurance' in delivery_types:
        try:
            fee = store.settings.insurance_fee
        except Exception:
            fee = Decimal('0')
        return (shipping_cost or Decimal('0')) + fee
    return shipping_cost


def _deduct_stock_for_order(store, order):
    """Décrémente le stock de chaque article à la création de la commande
    (évite la survente si deux clients commandent le dernier article en même
    temps) et journalise un StockMovement par ligne, traçable comme pour les
    échanges."""
    from products.stock import record_stock_movement
    for item in order.items.select_related('product', 'variant_option').all():
        if item.variant_option:
            record_stock_movement(
                store, item.product, item.variant_option, -item.quantity,
                reason='order_sale', note=f"Commande #{order.id}",
            )
        elif item.product:
            record_stock_movement(
                store, item.product, None, -item.quantity,
                reason='order_sale', note=f"Commande #{order.id}",
            )
        if item.product:
            _sync_stock_to_channels(store, item.product)


def _restock_order_items(store, order, reason, note):
    """Remet en stock chaque article d'une commande — utilisée quand un
    retour est validé ou qu'une commande est annulée (décisions produit
    2026-08-12, ferme le TBD "pas de restockage automatique"). L'appelant
    est responsable de la garde d'idempotence (`Order.restocked_at`)."""
    from products.stock import record_stock_movement
    for item in order.items.select_related('product', 'variant_option').all():
        if item.variant_option:
            record_stock_movement(store, item.product, item.variant_option, item.quantity, reason=reason, note=note)
        elif item.product:
            record_stock_movement(store, item.product, None, item.quantity, reason=reason, note=note)


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

        page, per_page = parse_pagination(request, default_per_page=10)
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
                block_reason = _quota_block_reason(quota)
                if block_reason:
                    return Response({'detail': block_reason}, status=403)
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
            if _validate_item_quantity(item) is None:
                return Response({'detail': 'Quantité invalide pour un article de la commande.'}, status=400)
            price = _authoritative_item_price(store, item)
            if price is None:
                return Response({'detail': 'Un article de la commande est introuvable.'}, status=400)
            resolved_prices.append(price)

        shipping_cost = _validate_shipping_cost(request)
        if shipping_cost is None:
            return Response({'detail': 'Frais de livraison invalides.'}, status=400)

        delivery_types = _valid_delivery_types(request)
        if delivery_types is None:
            return Response({'detail': 'delivery_types invalide.'}, status=400)
        shipping_cost = _apply_delivery_type_shipping(store, shipping_cost, delivery_types)

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
            shipping_cost = shipping_cost,
            stop_desk     = bool(request.data.get('stop_desk')),
            station_code  = request.data.get('station_code', ''),
            delivery_types = delivery_types,
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
                quantity          = _validate_item_quantity(item),
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

    @transaction.atomic
    def put(self, request, pk):
        # Modification réservée owner/admin par défaut, mais un confirmateur
        # peut aussi corriger une commande (ville/commune/quantité mal
        # remplies par le client) si le vendeur lui a accordé `orders_manage`
        # dans la matrice de permissions (Epic 7.5) — écart volontaire par
        # rapport à la règle "écriture = owner/admin uniquement" pour ce cas
        # précis, à la demande explicite du produit.
        if not (is_owner_or_admin(request) or has_permission(request, 'orders_manage')):
            return Response({'detail': 'Modification réservée au propriétaire, administrateur, ou confirmateur autorisé.'}, status=403)
        order, err = self._get(request, pk)
        if err: return err
        store = order.store

        wilaya_changed = 'wilaya' in request.data and request.data['wilaya'] != order.wilaya

        allowed = ['first_name', 'last_name', 'phone', 'wilaya', 'commune',
                   'address', 'shipping_cost', 'note', 'stop_desk', 'station_code',
                   'tracking_substatus']
        for field in allowed:
            if field in request.data:
                setattr(order, field, request.data[field])

        if 'delivery_types' in request.data or 'delivery_type' in request.data:
            delivery_types = _valid_delivery_types(request)
            if delivery_types is None:
                return Response({'detail': 'delivery_types invalide.'}, status=400)
            order.delivery_types = delivery_types

        # Si la wilaya change et qu'aucun nouveau tarif n'a été précisé
        # explicitement, on retente le vrai tarif du transporteur par défaut
        # plutôt que de laisser l'ancien montant (potentiellement erroné pour
        # la nouvelle destination) — sauté si "Vendu en magasin"/"Livraison
        # gratuite" forcent déjà les frais à 0.
        if wilaya_changed and 'shipping_cost' not in request.data and not ({'store', 'free'} & set(order.delivery_types)):
            order.shipping_cost = _resolve_shipping_cost(store, order.wilaya, order.stop_desk, order.shipping_cost, order.commune)

        if ('delivery_types' in request.data or 'delivery_type' in request.data) and 'shipping_cost' not in request.data:
            order.shipping_cost = _apply_delivery_type_shipping(store, order.shipping_cost, order.delivery_types)

        items_payload = request.data.get('items')
        if items_payload is not None:
            from products.stock import record_stock_movement
            # `order.items.all()` réutilise le cache déjà peuplé par le
            # `prefetch_related('items', ...)` de `_get()` — utiliser une
            # requête fraîche ici créerait des objets Python distincts,
            # mutés/sauvés en base mais invisibles à `order.recalculate()`
            # (qui lit lui aussi `self.items.all()`, donc le même cache).
            items_by_id = {i.id: i for i in order.items.all()}

            def restock(item):
                target = item.variant_option or item.product
                if target:
                    record_stock_movement(
                        store, item.product, item.variant_option, item.quantity,
                        reason='order_sale', note=f"Modification commande #{order.id}",
                    )

            def deduct(product, variant_option, qty):
                target = variant_option or product
                if target:
                    record_stock_movement(
                        store, product, variant_option, -qty,
                        reason='order_sale', note=f"Modification commande #{order.id}",
                    )

            for entry in items_payload:
                entry_id = entry.get('id')
                item = items_by_id.get(entry_id) if entry_id else None

                if entry.get('_delete'):
                    if item:
                        restock(item)
                        item.delete()
                    continue

                new_qty = entry.get('quantity')
                qty = int(new_qty) if new_qty is not None and int(new_qty) >= 1 else (item.quantity if item else 1)

                # `product`/`variant_option` fournis = le confirmateur/client a changé
                # d'article ou de variante (taille/couleur) — jamais fait confiance
                # au prix client, toujours résolu côté serveur comme à la création.
                new_product_id = entry.get('product')
                new_variant_id = entry.get('variant_option')
                product_changed = item and new_product_id and (
                    new_product_id != item.product_id or new_variant_id != item.variant_option_id
                )

                if item and not product_changed:
                    # Simple ajustement de quantité sur le même article.
                    delta = qty - item.quantity
                    if delta != 0:
                        deduct(item.product, item.variant_option, delta)
                    item.quantity = qty
                    item.save(update_fields=['quantity'])
                    continue

                # Nouvel article (pas d'id) OU changement de produit/variante sur
                # un article existant : résolution de prix identique à la création
                # de commande (jamais la valeur envoyée par le client).
                price = _authoritative_item_price(store, entry)
                if price is None:
                    continue
                from products.models import VariantOption
                product = store.products.filter(pk=new_product_id or (item.product_id if item else None)).first()
                if not product:
                    continue
                variant_option = None
                if new_variant_id:
                    variant_option = VariantOption.objects.filter(pk=new_variant_id, variant__product=product).first()
                    if not variant_option:
                        continue
                product_name = f"{product.name} — {variant_option.value}" if variant_option else product.name

                if item:
                    restock(item)
                    item.product = product
                    item.variant_option = variant_option
                    item.product_name = product_name
                    item.price = price
                    item.quantity = qty
                    item.save()
                else:
                    OrderItem.objects.create(
                        order=order, product=product, variant_option=variant_option,
                        product_name=product_name, price=price, quantity=qty,
                    )
                deduct(product, variant_option, qty)

            # Invalide le cache `prefetch_related('items', ...)` posé par
            # `_get()` — les articles ajoutés/supprimés ci-dessus existent
            # bien en base mais ce cache ne le sait pas, donc `recalculate()`
            # et la sérialisation qui suivent ignoreraient les nouveaux
            # articles / garderaient les supprimés (même piège que pour la
            # correction de quantité, mais ici sur le nombre de lignes).
            if hasattr(order, '_prefetched_objects_cache'):
                order._prefetched_objects_cache.pop('items', None)

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

        carrier_warning = _transition_order_status(
            store, order, new_status, changed_by=request.user,
            note=request.data.get('note', ''), carrier_id=request.data.get('carrier_id'),
        )

        data = OrderDetailSerializer(order).data
        if carrier_warning:
            data['carrier_warning'] = carrier_warning
        return Response(data)


def _transition_order_status(store, order, new_status, changed_by=None, note='', carrier_id=None):
    """Applique un changement de statut avec tous les effets de bord normalement
    déclenchés par `OrderStatusView.post` — factorisé pour être réutilisable par
    la synchronisation automatique des statuts transporteur (`sync_carrier_tracking`,
    `OrderSyncTrackingView`), qui doit produire exactement le même comportement
    qu'un changement manuel (historique, création d'expédition si confirmée,
    commission dropshipper, webhooks sortants)."""
    order.status = new_status
    order.save(update_fields=['status'])
    OrderStatusHistory.objects.create(order=order, status=new_status, changed_by=changed_by, note=note)

    carrier_warning = None
    if new_status == 'confirmed' and not order.carrier_tracking_number and 'store' not in (order.delivery_types or []):
        account = None
        if carrier_id:
            account = store.carrier_accounts.filter(pk=carrier_id, is_active=True).first()
        if not account:
            account = store.carrier_accounts.filter(is_default=True, is_active=True).first()
        if not account:
            carrier_warning = 'Aucun transporteur configuré — expédition non créée.'
        else:
            carrier_warning = _create_shipment_for_order(store, order, account)

    _sync_commission_for_order(store, order, new_status)

    # Restockage automatique à l'annulation (décision produit 2026-08-12) —
    # le stock a été déduit dès la création de la commande (voir
    # _deduct_stock_for_order), donc une annulation doit le rendre. Garde
    # d'idempotence : jamais restocké deux fois (ex: annulée puis un retour
    # est quand même validé dessus par erreur).
    if new_status == 'cancelled' and not order.restocked_at:
        _restock_order_items(store, order, reason='order_cancelled', note=f"Annulation commande #{order.id}")
        order.restocked_at = timezone.now()
        order.save(update_fields=['restocked_at'])

    if new_status in STATUS_TO_WEBHOOK_EVENT:
        _fire_order_webhook(store, order, STATUS_TO_WEBHOOK_EVENT[new_status])
    return carrier_warning


def sync_order_from_carrier(store, order):
    """Interroge le transporteur pour rafraîchir `carrier_status`, et fait
    avancer `Order.status` si l'événement correspond à une transition connue
    (voir `NOEST_STATUS_MAP`) — jamais en arrière, jamais sur une commande déjà
    dans un état terminal (delivered/returned/cancelled). Utilisée par le bouton
    de sync manuel (`OrderSyncTrackingView`) et par la commande automatique
    `sync_carrier_tracking` (à planifier en tâche périodique, comme
    `cancel_stale_calls`)."""
    client = get_carrier_client(order.carrier)
    info = client.get_status_info(order.carrier_tracking_number)
    order.carrier_status = info['carrier_status']
    order.save(update_fields=['carrier_status'])

    mapped = info.get('order_status')
    if mapped and mapped != order.status and order.status not in ('delivered', 'returned', 'cancelled'):
        _transition_order_status(
            store, order, mapped, changed_by=None,
            note=f"Mise à jour automatique — statut transporteur : {info['carrier_status']}",
        )
    return order


class OrderAssignCarrierView(APIView):
    """Attribue une société de livraison à une commande, indépendamment du
    statut — bouton "Assigner" permanent sur la fiche commande (pas caché
    dans "Modifier" ni conditionné à un changement de statut). Nécessaire
    pour les commandes importées depuis un canal externe (Shopify) qui
    arrivent sans transporteur : ce n'est pas une "modification", c'est une
    attribution manuelle à faire au cas par cas. Si la commande n'a pas
    encore de tracking, crée l'expédition immédiatement (sinon se contente
    de changer le transporteur par défaut pour une future confirmation)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        if not (is_owner_or_admin(request) or has_permission(request, 'orders_manage')):
            return Response({'detail': 'Réservé au propriétaire, administrateur, ou confirmateur autorisé.'}, status=403)
        try:
            order = store.orders.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=404)

        carrier_id = request.data.get('carrier_id')
        account = store.carrier_accounts.filter(pk=carrier_id, is_active=True).first() if carrier_id else None
        if not account:
            return Response({'detail': 'Transporteur invalide ou inactif.'}, status=400)

        warning = None
        if order.carrier_tracking_number:
            # Déjà expédiée — on change juste l'association pour référence,
            # pas de nouvel appel API (éviterait une double expédition réelle).
            order.carrier = account
            order.save(update_fields=['carrier'])
        else:
            warning = _create_shipment_for_order(store, order, account)

        data = OrderDetailSerializer(order).data
        if warning:
            data['carrier_warning'] = warning
        return Response(data)


def _create_shipment_for_order(store, order, account):
    """Appelle réellement l'API du transporteur pour créer l'expédition et
    enregistre le tracking sur la commande. Retourne un message d'erreur
    (string) en cas d'échec, ou None si tout s'est bien passé — partagé entre
    la confirmation automatique (OrderStatusView) et l'attribution manuelle
    (OrderAssignCarrierView)."""
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


class OrderRejectCancellationView(APIView):
    """Rejette une demande d'annulation (CancellationsPage.jsx, bouton
    "Rejeter") en restaurant le VRAI statut antérieur à 'cancel_requested'
    (retrouvé dans OrderStatusHistory), plutôt que de le figer arbitrairement
    à 'confirmed' — bug corrigé : une commande déjà 'shipped'/'delivered' au
    moment de la demande d'annulation ne doit pas régresser à 'confirmed'."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            order = store.orders.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=404)

        if order.status != 'cancel_requested':
            return Response({'detail': "Cette commande n'a pas de demande d'annulation en cours."}, status=400)

        history = list(order.history.order_by('changed_at'))
        restored_status = 'pending'
        for i, h in enumerate(history):
            if h.status == 'cancel_requested' and i > 0:
                restored_status = history[i - 1].status
                break

        order.status = restored_status
        order.save(update_fields=['status'])
        note = request.data.get('note', '')
        OrderStatusHistory.objects.create(
            order      = order,
            status     = restored_status,
            changed_by = request.user,
            note       = f"Demande d'annulation rejetée{' — ' + note if note else ''}",
        )
        return Response(OrderDetailSerializer(order).data)


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
            webhook_secret    = request.data.get('webhook_secret', ''),
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
        for field in ['name', 'departure_wilaya', 'api_id', 'api_token', 'webhook_secret', 'is_active', 'is_default']:
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


class CarrierRatesView(APIView):
    """Tarif de livraison réel pour un compte transporteur + une wilaya
    (US demandée : afficher le vrai prix au lieu de le saisir à la main).
    Best-effort — 404 si le transporteur n'expose pas de grille tarifaire
    ou si le compte n'est pas configuré (mock)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            account = store.carrier_accounts.get(pk=pk, is_active=True)
        except CarrierAccount.DoesNotExist:
            return Response({'detail': 'Compte transporteur introuvable ou inactif.'}, status=404)

        from .wilaya_codes import wilaya_code
        wilaya_name = request.query_params.get('wilaya', '')
        wid = wilaya_code(wilaya_name)
        if not wid:
            return Response({'detail': 'Wilaya invalide.'}, status=400)

        client = get_carrier_client(account)
        rates = client.get_rates(wid)
        if not rates:
            return Response({'detail': "Tarif indisponible pour ce transporteur/cette wilaya."}, status=404)
        return Response(rates)


class CarrierDesksView(APIView):
    """Liste des bureaux/points relais réels du transporteur pour une wilaya
    (ex: Noest — 108 bureaux avec nom/adresse). Nécessaire pour choisir un
    `station_code` valide quand `stop_desk=True`, sinon la création
    d'expédition échoue chez certains transporteurs."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            account = store.carrier_accounts.get(pk=pk, is_active=True)
        except CarrierAccount.DoesNotExist:
            return Response({'detail': 'Compte transporteur introuvable ou inactif.'}, status=404)

        from .wilaya_codes import wilaya_code
        wid = wilaya_code(request.query_params.get('wilaya', ''))
        if not wid:
            return Response({'detail': 'Wilaya invalide.'}, status=400)

        desks = get_carrier_client(account).get_desks(wid)
        return Response(desks)


class WilayaRateListCreateView(APIView):
    """Grille tarifaire de livraison par wilaya, éditable par le vendeur
    (onglet "Tarification" de ParametresLivraisonPage, équivalent RiseCart).
    Consommée en priorité par `_resolve_shipping_cost` avant tout appel
    transporteur en temps réel."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        return Response(WilayaRateSerializer(store.wilaya_rates.all(), many=True).data)

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Modification réservée au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        from .wilaya_codes import wilaya_name as wilaya_name_from_code
        wid = request.data.get('wilaya_id')
        name = wilaya_name_from_code(wid) if wid else None
        if not name:
            return Response({'detail': 'Wilaya invalide.'}, status=400)
        rate, _created = WilayaRate.objects.update_or_create(
            store=store, wilaya_id=wid,
            defaults={
                'wilaya_name': name,
                'home_price':  request.data.get('home_price', 0),
                'desk_price':  request.data.get('desk_price'),
                'show_home':   request.data.get('show_home', True),
                'show_desk':   request.data.get('show_desk', True),
            },
        )
        return Response(WilayaRateSerializer(rate).data, status=status.HTTP_201_CREATED)


class WilayaRateDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.wilaya_rates.get(pk=pk), None
        except WilayaRate.DoesNotExist:
            return None, Response({'detail': 'Tarif introuvable.'}, status=404)

    def put(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Modification réservée au propriétaire ou administrateur.'}, status=403)
        rate, err = self._get(request, pk)
        if err: return err
        for field in ['home_price', 'desk_price', 'show_home', 'show_desk']:
            if field in request.data:
                setattr(rate, field, request.data[field])
        rate.save()
        return Response(WilayaRateSerializer(rate).data)

    def delete(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Suppression réservée au propriétaire ou administrateur.'}, status=403)
        rate, err = self._get(request, pk)
        if err: return err
        rate.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WilayaRateSyncView(APIView):
    """Bouton "Mettre à jour depuis la société" (équivalent RiseCart) —
    remplit/écrase la grille tarifaire des 58 wilayas à partir du tarif réel
    du transporteur par défaut de la boutique, en un clic."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        account = store.carrier_accounts.filter(is_default=True, is_active=True).first()
        if not account:
            return Response({'detail': 'Aucun transporteur par défaut actif.'}, status=400)

        from .wilaya_codes import WILAYA_CODES
        client = get_carrier_client(account)
        updated, failed = 0, 0
        for name, wid in WILAYA_CODES.items():
            try:
                rates = client.get_rates(wid)
            except Exception:
                rates = None
            if not rates:
                failed += 1
                continue
            WilayaRate.objects.update_or_create(
                store=store, wilaya_id=wid,
                defaults={
                    'wilaya_name': name,
                    'home_price':  Decimal(str(rates['tarif'])),
                    'desk_price':  Decimal(str(rates['tarif_stopdesk'])) if rates.get('tarif_stopdesk') is not None else None,
                },
            )
            updated += 1
        return Response({'updated': updated, 'failed': failed})


class CommuneRateListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        qs = store.commune_rates.all()
        wilaya_id = request.query_params.get('wilaya_id')
        if wilaya_id:
            qs = qs.filter(wilaya_id=wilaya_id)
        return Response(CommuneRateSerializer(qs, many=True).data)

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Modification réservée au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        wid = request.data.get('wilaya_id')
        commune_name = (request.data.get('commune_name') or '').strip()
        if not wid or not commune_name:
            return Response({'detail': 'Wilaya et nom de commune requis.'}, status=400)
        rate, _created = CommuneRate.objects.update_or_create(
            store=store, wilaya_id=wid, commune_name=commune_name,
            defaults={
                'home_price': request.data.get('home_price', 0),
                'desk_price': request.data.get('desk_price'),
            },
        )
        return Response(CommuneRateSerializer(rate).data, status=status.HTTP_201_CREATED)


class CommuneRateDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.commune_rates.get(pk=pk), None
        except CommuneRate.DoesNotExist:
            return None, Response({'detail': 'Tarif introuvable.'}, status=404)

    def put(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Modification réservée au propriétaire ou administrateur.'}, status=403)
        rate, err = self._get(request, pk)
        if err: return err
        for field in ['home_price', 'desk_price']:
            if field in request.data:
                setattr(rate, field, request.data[field])
        rate.save()
        return Response(CommuneRateSerializer(rate).data)

    def delete(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Suppression réservée au propriétaire ou administrateur.'}, status=403)
        rate, err = self._get(request, pk)
        if err: return err
        rate.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommuneRateSyncView(APIView):
    """Équivalent de `WilayaRateSyncView` mais par commune — seul Yalidine
    (transporteur par défaut requis) expose une vraie grille par commune,
    voir `YalidineClient.get_commune_rates`. 400 explicite sinon."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        from .wilaya_codes import wilaya_code
        wid = wilaya_code(request.data.get('wilaya_name', ''))
        if not wid:
            return Response({'detail': 'Wilaya invalide.'}, status=400)

        account = store.carrier_accounts.filter(is_default=True, is_active=True).first()
        if not account:
            return Response({'detail': 'Aucun transporteur par défaut actif.'}, status=400)

        client = get_carrier_client(account)
        try:
            rates = client.get_commune_rates(wid)
        except Exception:
            rates = None
        if not rates:
            return Response({'detail': "Le transporteur par défaut ne fournit pas de tarifs par commune pour cette wilaya."}, status=400)

        updated = 0
        for commune_name, r in rates.items():
            CommuneRate.objects.update_or_create(
                store=store, wilaya_id=wid, commune_name=commune_name,
                defaults={
                    'home_price': Decimal(str(r['tarif'])),
                    'desk_price': Decimal(str(r['tarif_stopdesk'])) if r.get('tarif_stopdesk') is not None else None,
                },
            )
            updated += 1
        return Response({'updated': updated})


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
        blacklisted_phones = set(
            BlacklistedPhone.objects.filter(store=store).values_list('phone', flat=True)
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
                'is_blacklisted': row['phone'] in blacklisted_phones,
                'created_at':     row['created_at'],
            })

        page, per_page = parse_pagination(request, default_per_page=10)
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
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(phone__icontains=search)

        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        qs    = qs[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  BlacklistedPhoneSerializer(qs, many=True).data,
        })

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

        page, per_page = parse_pagination(request, default_per_page=10)
        total    = qs.count()
        qs       = qs[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  ComplaintSerializer(qs, many=True, context={'request': request}).data,
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
        return Response(ComplaintDetailSerializer(complaint, context={'request': request}).data)


class ComplaintAssignmentView(APIView):
    """Réassignation manuelle d'une réclamation à un confirmateur (mirroring
    OrderAssignmentView) — l'assignation initiale se fait automatiquement en
    round-robin à la création (PublicComplaintCreateView)."""
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Réassignation réservée au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            complaint = store.complaints.get(pk=pk)
        except Complaint.DoesNotExist:
            return Response({'detail': 'Réclamation introuvable.'}, status=404)

        confirmateur_id = request.data.get('confirmateur')
        if not confirmateur_id:
            return Response({'detail': 'confirmateur requis.'}, status=400)
        try:
            confirmateur = store.team_members.get(pk=confirmateur_id, role='confirmateur', is_active=True)
        except Exception:
            return Response({'detail': 'Confirmateur invalide.'}, status=400)

        ComplaintAssignment.objects.update_or_create(
            complaint=complaint,
            defaults={'confirmateur': confirmateur, 'assigned_by': request.user},
        )
        return Response(ComplaintSerializer(complaint, context={'request': request}).data)


def _validate_complaint_attachment(attachment):
    """Rejette un fichier hors whitelist image/taille avant tout enregistrement
    — ComplaintMessage.objects.create() ne passe pas par full_clean(), donc les
    validators du champ modèle ne se déclenchent jamais tout seuls ici."""
    if not attachment:
        return None
    try:
        validate_uploaded_file(attachment)
    except DjangoValidationError as e:
        return Response({'detail': e.messages[0] if e.messages else 'Fichier invalide.'}, status=400)
    return None


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

        attachment = request.FILES.get('attachment')
        err = _validate_complaint_attachment(attachment)
        if err: return err

        complaint.status = new_status
        complaint.save(update_fields=['status', 'updated_at'])
        ComplaintMessage.objects.create(
            complaint  = complaint,
            status     = new_status,
            message    = request.data.get('note', ''),
            author     = request.user,
            attachment = attachment,
        )
        return Response(ComplaintDetailSerializer(complaint, context={'request': request}).data)


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
        attachment = request.FILES.get('attachment')
        if not message and not attachment:
            return Response({'detail': 'Message vide.'}, status=400)

        err = _validate_complaint_attachment(attachment)
        if err: return err

        ComplaintMessage.objects.create(complaint=complaint, message=message, author=request.user, attachment=attachment)
        return Response(ComplaintDetailSerializer(complaint, context={'request': request}).data, status=status.HTTP_201_CREATED)


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
    throttle_scope = 'complaint'

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

        attachment = request.FILES.get('attachment')
        err = _validate_complaint_attachment(attachment)
        if err: return err

        complaint = Complaint.objects.create(store=store, order=order, subject=subject, description=description)
        ComplaintMessage.objects.create(
            complaint  = complaint,
            message    = description,
            status     = 'open',
            author     = None,
            attachment = attachment,
        )
        assign_complaint_round_robin(complaint)

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

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(order_item__order__phone__icontains=search) |
                Q(order_item__order__first_name__icontains=search) |
                Q(order_item__order__last_name__icontains=search) |
                Q(order_item__product_name__icontains=search)
            )

        page, per_page = parse_pagination(request, default_per_page=10)
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
            from products.stock import record_stock_movement
            item = exchange.order_item
            original_option = item.variant_option
            replacement = exchange.replacement_option
            note = f"Échange #{exchange.id}"

            record_stock_movement(
                store, item.product, original_option, item.quantity,
                reason='exchange_return', note=note,
            )
            record_stock_movement(
                store, replacement.variant.product, replacement, -item.quantity,
                reason='exchange_issue', note=note,
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
    throttle_scope = 'exchange'

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
    throttle_scope = 'exchange'

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


_PROCESSED_STATUSES_FOR_CHOICES = ['no_answer_1', 'no_answer_2', 'no_answer_3', 'confirmed', 'shipped', 'delivered', 'returned', 'cancelled']


class ConfirmationRateView(APIView):
    permission_classes = [IsAuthenticated]

    CONFIRMED_STATUSES = ['confirmed', 'shipped', 'delivered']
    PROCESSED_STATUSES = _PROCESSED_STATUSES_FOR_CHOICES
    PROCESSED_STATUS_CHOICES = [c for c in STATUS_CHOICES if c[0] in _PROCESSED_STATUSES_FOR_CHOICES]

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

        no_answer_total  = qs.filter(status__in=NO_ANSWER_STATUSES).count()
        returned_total   = qs.filter(status='returned').count()
        cancelled_total  = qs.filter(status='cancelled').count()

        # Stats par confirmateur via OrderAssignment — détail par issue (pas
        # seulement processed/confirmed) pour identifier où un confirmateur perd
        # des commandes (non-réponse vs annulation/retour).
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
                no_answer=Count(Case(When(status__in=NO_ANSWER_STATUSES, then=1), output_field=IntegerField())),
                returned=Count(Case(When(status='returned', then=1), output_field=IntegerField())),
                cancelled=Count(Case(When(status='cancelled', then=1), output_field=IntegerField())),
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
                'no_answer':         a['no_answer'] or 0,
                'returned':          a['returned'] or 0,
                'cancelled':         a['cancelled'] or 0,
                'rate':              conf_rate,
            })

        by_confirmateur.sort(key=lambda x: x['rate'], reverse=True)

        # Évolution quotidienne (traitées/confirmées/taux par jour) — pour le
        # graphique de tendance côté frontend.
        daily_qs = (
            qs.annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(
                processed=Count(Case(When(status__in=self.PROCESSED_STATUSES, then=1), output_field=IntegerField())),
                confirmed=Count(Case(When(status__in=self.CONFIRMED_STATUSES, then=1), output_field=IntegerField())),
            )
            .order_by('day')
        )
        daily = [{
            'date':      str(d['day']),
            'processed': d['processed'] or 0,
            'confirmed': d['confirmed'] or 0,
            'rate':      round((d['confirmed'] or 0) / d['processed'] * 100, 1) if d['processed'] else 0.0,
        } for d in daily_qs]

        by_status = [
            {'status': code, 'label': label, 'count': qs.filter(status=code).count()}
            for code, label in self.PROCESSED_STATUS_CHOICES
        ]
        by_status = [s for s in by_status if s['count'] > 0]

        # Comparaison avec la période précédente de même durée (tendance ↑/↓).
        span_days = (date_to - date_from).days + 1
        prev_date_to   = date_from - timedelta(days=1)
        prev_date_from = prev_date_to - timedelta(days=span_days - 1)
        prev_qs = store.orders.filter(created_at__date__gte=prev_date_from, created_at__date__lte=prev_date_to)
        prev_totals = prev_qs.aggregate(
            processed=Count(Case(When(status__in=self.PROCESSED_STATUSES, then=1), output_field=IntegerField())),
            confirmed=Count(Case(When(status__in=self.CONFIRMED_STATUSES, then=1), output_field=IntegerField())),
        )
        prev_processed = prev_totals['processed'] or 0
        prev_confirmed = prev_totals['confirmed'] or 0
        previous_rate = round(prev_confirmed / prev_processed * 100, 1) if prev_processed else None

        return Response({
            'period':     period,
            'date_from':  str(date_from),
            'date_to':    str(date_to),
            'total_processed': processed,
            'total_confirmed': confirmed,
            'confirmation_rate': rate,
            'no_answer_total':  no_answer_total,
            'returned_total':   returned_total,
            'cancelled_total':  cancelled_total,
            'previous_rate':    previous_rate,
            'by_confirmateur':  by_confirmateur,
            'daily':            daily,
            'by_status':        by_status,
        })


class PublicShippingRateView(APIView):
    """Tarif de livraison réel affiché au client sur la boutique publique,
    basé sur le transporteur PAR DÉFAUT de la boutique — pas de choix de
    transporteur côté client (décision produit : un seul transporteur
    "officiel" par boutique vu du client final, cohérent avec le fait que
    la boutique n'affiche qu'un seul prix de livraison au checkout)."""
    permission_classes = [AllowAny]

    def get(self, request, slug):
        from stores.models import Store
        try:
            store = Store.objects.get(slug=slug, is_active=True)
        except Store.DoesNotExist:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        wilaya_name = request.query_params.get('wilaya', '')
        commune_name = request.query_params.get('commune', '')
        rates = _resolve_shipping_rates(store, wilaya_name, commune_name)
        if not rates:
            return Response({'detail': 'Tarif indisponible pour cette wilaya.'}, status=404)
        return Response(rates)


class StoreShippingRateView(APIView):
    """Équivalent dashboard de `PublicShippingRateView` — utilisé par
    `OrderFormPage.jsx` (nouvelle commande manuelle) pour auto-remplir les
    frais de livraison avec la même priorité que le checkout public :
    grille tarifaire du vendeur (`WilayaRate`/`CommuneRate`) > tarif
    transporteur par défaut en temps réel."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        wilaya_name = request.query_params.get('wilaya', '')
        commune_name = request.query_params.get('commune', '')
        rates = _resolve_shipping_rates(store, wilaya_name, commune_name)
        if not rates:
            return Response({'detail': 'Tarif indisponible pour cette wilaya.'}, status=404)
        return Response(rates)


class PublicDesksView(APIView):
    """Liste des bureaux/points relais du transporteur par défaut de la
    boutique, pour que le client choisisse où retirer son colis (stop desk)."""
    permission_classes = [AllowAny]

    def get(self, request, slug):
        from stores.models import Store
        try:
            store = Store.objects.get(slug=slug, is_active=True)
        except Store.DoesNotExist:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        from .wilaya_codes import wilaya_code
        wid = wilaya_code(request.query_params.get('wilaya', ''))
        if not wid:
            return Response({'detail': 'Wilaya invalide.'}, status=400)

        account = store.carrier_accounts.filter(is_default=True, is_active=True).first()
        if not account:
            return Response([])

        return Response(get_carrier_client(account).get_desks(wid))


class PublicOrderView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = 'order'

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
            block_reason = _quota_block_reason(quota)
            if block_reason:
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
            if _validate_item_quantity(item) is None:
                return Response({'detail': 'Quantité invalide pour un article du panier.'}, status=400)
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

        shipping_cost = _validate_shipping_cost(request)
        if shipping_cost is None:
            return Response({'detail': 'Frais de livraison invalides.'}, status=400)
        shipping_cost = _resolve_shipping_cost(
            store, request.data.get('wilaya', ''), bool(request.data.get('stop_desk')), shipping_cost,
            request.data.get('commune', ''),
        )

        order = Order.objects.create(
            store         = store,
            first_name    = request.data.get('first_name', ''),
            last_name     = request.data.get('last_name', ''),
            phone         = request.data.get('phone', ''),
            wilaya        = request.data.get('wilaya', ''),
            commune       = request.data.get('commune', ''),
            address       = request.data.get('address', ''),
            shipping_cost = shipping_cost,
            stop_desk     = bool(request.data.get('stop_desk')),
            station_code  = request.data.get('station_code', ''),
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
                quantity          = _validate_item_quantity(item),
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
        qs = store.failure_reasons.annotate(_usage_count=Count('callattempt'))
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


class FailureReasonAttemptsView(APIView):
    """Liste des tentatives d'appel enregistrées pour une raison d'échec
    précise — permet au vendeur de retrouver quels clients/commandes ont
    échoué pour cette raison, pas juste le compteur agrégé (`usage_count`)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            reason = store.failure_reasons.get(pk=pk)
        except FailureReason.DoesNotExist:
            return Response({'detail': 'Introuvable.'}, status=404)

        qs = (CallAttempt.objects
              .filter(order__store=store, failure_reason=reason)
              .select_related('order', 'agent')
              .order_by('-attempted_at'))

        page, per_page = parse_pagination(request, default_per_page=20)
        count = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]

        results = [{
            'id':              a.id,
            'order_id':        a.order_id,
            'client_name':     f"{a.order.first_name} {a.order.last_name}".strip(),
            'phone':           a.order.phone,
            'attempt_number':  a.attempt_number,
            'agent_name':      f"{a.agent.first_name} {a.agent.last_name}".strip() if a.agent else None,
            'note':            a.note,
            'attempted_at':    a.attempted_at,
        } for a in qs]

        return Response({'results': results, 'count': count, 'page': page, 'per_page': per_page})


class FailureHistoryListView(APIView):
    """Historique complet des tentatives d'appel en échec, toutes raisons
    confondues, avec filtres — jusqu'ici seul un compteur agrégé par raison
    (usage_count) existait, aucune vue transversale filtrable."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        qs = (CallAttempt.objects
              .filter(order__store=store)
              .exclude(failure_reason__isnull=True)
              .select_related('order', 'agent', 'failure_reason')
              .order_by('-attempted_at'))

        reason_id = request.query_params.get('reason')
        if reason_id:
            qs = qs.filter(failure_reason_id=reason_id)

        agent_id = request.query_params.get('agent')
        if agent_id:
            qs = qs.filter(agent_id=agent_id)

        date_from = request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(attempted_at__date__gte=date_from)

        date_to = request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(attempted_at__date__lte=date_to)

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(order__first_name__icontains=search) |
                Q(order__last_name__icontains=search) |
                Q(order__phone__icontains=search)
            )

        page, per_page = parse_pagination(request, default_per_page=20)
        count = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]

        results = [{
            'id':              a.id,
            'order_id':        a.order_id,
            'client_name':     f"{a.order.first_name} {a.order.last_name}".strip(),
            'phone':           a.order.phone,
            'attempt_number':  a.attempt_number,
            'reason_id':       a.failure_reason_id,
            'reason_label':    a.failure_reason.label if a.failure_reason else None,
            'agent_name':      f"{a.agent.first_name} {a.agent.last_name}".strip() if a.agent else None,
            'note':            a.note,
            'attempted_at':    a.attempted_at,
        } for a in qs]

        return Response({'results': results, 'count': count, 'page': page, 'per_page': per_page})


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
    throttle_scope = 'abandoned_cart'

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
    throttle_scope = 'abandoned_cart'

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
        page, per_page = parse_pagination(request, default_per_page=20)
        total  = qs.count()
        offset = (page - 1) * per_page
        results = AbandonedCartSerializer(qs[offset:offset + per_page], many=True).data
        return Response({'count': total, 'page': page, 'per_page': per_page, 'results': results})


class AbandonedCartRemindView(APIView):
    """Relance manuelle immédiate d'un panier abandonné, en plus de la relance
    automatique par email (send_abandoned_cart_reminders). Deux canaux :
    - `channel=whatsapp` (défaut) : le lien wa.me est ouvert côté frontend,
      cet endpoint journalise juste que c'est fait (WhatsApp ne peut pas être
      déclenché depuis le serveur sans l'API Business, payante — hors scope).
    - `channel=email` : envoie réellement l'email via send_abandoned_cart_email
      (même contenu que la relance automatique), 400 si le panier n'a pas
      d'email renseigné."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            cart = store.abandoned_carts.get(pk=pk)
        except AbandonedCart.DoesNotExist:
            return Response({'detail': 'Panier introuvable.'}, status=404)

        channel = request.data.get('channel', 'whatsapp')
        if channel == 'email':
            if not cart.email:
                return Response({'detail': "Ce panier n'a pas d'email renseigné."}, status=400)
            try:
                send_abandoned_cart_email(store, cart)
            except Exception as e:
                return Response({'detail': f"Échec de l'envoi de l'email : {e}"}, status=502)

        cart.reminder_sent = True
        cart.reminder_sent_at = timezone.now()
        cart.save(update_fields=['reminder_sent', 'reminder_sent_at'])
        return Response(AbandonedCartSerializer(cart).data)


SHIPMENT_STATUSES = ('confirmed', 'shipped', 'delivered', 'returned')

# Regroupement du libellé brut transporteur (`Order.carrier_status`) en
# "sous-statuts" génériques pour la page "Suivi transporteur" (alignée sur le
# concurrent RiseCart, onglet "Gestion des échecs" dans "Suivi des
# commandes") — mots-clés construits à partir de la liste officielle des
# statuts Yalidine et des libellés Noest observés ; volontairement basé sur
# des mots-clés (insensible accents/casse) plutôt qu'une liste figée par
# transporteur, pour rester valable si d'autres transporteurs utilisent un
# vocabulaire français similaire. Ordre = priorité de classement (le premier
# mot-clé qui matche l'emporte).
CARRIER_STATUS_BUCKETS = [
    ('failed_attempt',     'Tentative échouée',        ['tentative echou', 'echec livraison', 'echoue', 'echouee']),
    ('awaiting_client',    'En attente du client',     ['attente du client', 'sorti en livraison', 'pret pour livreur', 'en attente']),
    ('in_transit',         'En localisation',          ['en localisation', 'en transit', 'recu a wilaya', 'ramasse']),
    ('to_wilaya',          'Vers la wilaya',           ['vers wilaya', 'transfert', 'expedie', 'centre']),
    ('pending_processing', 'En attente de traitement', ['pas encore', 'a verifier', 'preparation', 'pret a expedier', 'passation', 'bloque', 'debloque', 'created']),
]


def _strip_accents(text):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFKD', text) if not unicodedata.combining(c))


def _carrier_status_bucket(carrier_status):
    normalized = _strip_accents((carrier_status or '').lower())
    for key, label, keywords in CARRIER_STATUS_BUCKETS:
        if any(kw in normalized for kw in keywords):
            return key, label
    return 'other', 'Autre'


class CarrierTrackingListView(APIView):
    """Suivi des commandes en cours de livraison (confirmées/expédiées, pas
    encore livrées/retournées/annulées), groupées par sous-statut transporteur
    — vue alignée sur le concurrent RiseCart ("Gestion des échecs" dans
    "Suivi des commandes") : boutons de filtre avec compteur par sous-statut
    (Vers la wilaya, En localisation, En attente du client, Tentative
    échouée, En attente de traitement), pas seulement les échecs. Différent
    de FailureReasonsPage.jsx, qui couvre les échecs d'APPEL (no_answer_1/2/3,
    avant confirmation) — ici ce sont les commandes déjà expédiées, suivies
    chez le transporteur."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        qs = store.orders.filter(status__in=('confirmed', 'shipped')).exclude(carrier_tracking_number='')

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(phone__icontains=search) |
                Q(carrier_tracking_number__icontains=search)
            )

        # Compteurs par sous-statut calculés sur l'ensemble filtré (recherche
        # incluse, avant pagination) — le classement en bucket dépend du texte
        # libre `carrier_status`, impossible à agréger proprement en SQL ici,
        # donc fait en Python (volumes de commandes en transit toujours faibles).
        all_statuses = list(qs.values_list('carrier_status', flat=True))
        counts = {}
        for cs in all_statuses:
            key, label = _carrier_status_bucket(cs)
            counts.setdefault(key, {'key': key, 'label': label, 'count': 0})
            counts[key]['count'] += 1
        buckets = sorted(counts.values(), key=lambda b: -b['count'])

        bucket_filter = request.query_params.get('bucket')
        if bucket_filter:
            matching_ids = [
                o.id for o in qs.only('id', 'carrier_status')
                if _carrier_status_bucket(o.carrier_status)[0] == bucket_filter
            ]
            qs = qs.filter(id__in=matching_ids)

        qs = qs.order_by('-created_at')

        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'buckets':  buckets,
            'results':  OrderSerializer(qs, many=True).data,
        })


class ShipmentListView(APIView):
    """Suivi centralisé des commandes en cours/déjà expédiées (page
    Expéditions du dashboard)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store or not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)

        qs = store.orders.prefetch_related('items').filter(status__in=SHIPMENT_STATUSES)

        status_filter = request.query_params.get('status')
        if status_filter in SHIPMENT_STATUSES:
            qs = qs.filter(status=status_filter)

        carrier = request.query_params.get('carrier')
        if carrier:
            qs = qs.filter(carrier_id=carrier)

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(phone__icontains=search) |
                Q(carrier_tracking_number__icontains=search)
            )

        qs = qs.order_by('-created_at')

        page, per_page = parse_pagination(request, default_per_page=10)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  OrderSerializer(qs, many=True).data,
        })


def _fetch_label_pdf(order):
    """Récupère l'étiquette PDF réelle auprès du transporteur et marque
    `label_generated_at` la première fois — factorisé pour être partagé entre
    le téléchargement unitaire (`OrderLabelView`) et l'impression groupée
    (`LabelsPrintAllView`), qui doivent produire le même effet de bord (faire
    avancer la commande de "en attente d'impression" à "PDF généré")."""
    if not order.carrier_tracking_number:
        raise ValueError("Aucune expédition créée pour cette commande.")
    if not order.carrier:
        raise ValueError('Transporteur introuvable pour cette commande.')

    client = get_carrier_client(order.carrier)
    pdf_bytes = client.get_label(order.carrier_tracking_number)

    if not order.label_generated_at:
        order.label_generated_at = timezone.now()
        order.save(update_fields=['label_generated_at'])

    return pdf_bytes


class OrderLabelView(APIView):
    """Téléchargement de l'étiquette d'expédition officielle du transporteur
    pour une commande donnée (mockée si le compte transporteur n'a pas de
    token réel). Premier téléchargement = passage automatique à l'état "PDF
    généré" dans le pipeline d'impression (voir LabelsListView)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        store = _get_store(request)
        if not store or not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            order = store.orders.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=404)

        try:
            pdf_bytes = _fetch_label_pdf(order)
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        except TrackingNotFoundError:
            return Response({'detail': "Numéro de suivi introuvable auprès du transporteur."}, status=404)
        except NotImplementedError:
            return Response({'detail': "Étiquette non disponible pour ce transporteur."}, status=400)
        except Exception:
            return Response({'detail': "Impossible de récupérer l'étiquette auprès du transporteur."}, status=502)

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="etiquette-{order.id}.pdf"'
        return response


LABEL_STATES = ('pending', 'generated', 'printed')


class LabelsListView(APIView):
    """Pipeline d'impression des étiquettes (US demandée, alignée sur le
    concurrent RiseCart — menu "Expéditions & Retours") : chaque commande
    expédiée passe par 3 états successifs — "pending" (étiquette jamais
    téléchargée), "generated" (PDF déjà téléchargé au moins une fois, pas
    encore marqué imprimé), "printed" (marqué imprimé manuellement). Les deux
    premiers états sont dérivés de `label_generated_at`/`label_printed_at`
    (jamais désynchronisés puisque `_fetch_label_pdf` les renseigne
    automatiquement) — aucun état stocké séparément."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store or not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)

        state = request.query_params.get('state', 'pending')
        if state not in LABEL_STATES:
            return Response({'detail': f'État invalide. Valeurs : {LABEL_STATES}'}, status=400)

        qs = store.orders.exclude(carrier_tracking_number='')
        if state == 'pending':
            qs = qs.filter(label_generated_at__isnull=True)
        elif state == 'generated':
            qs = qs.filter(label_generated_at__isnull=False, label_printed_at__isnull=True)
        else:
            qs = qs.filter(label_printed_at__isnull=False)

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(phone__icontains=search) |
                Q(carrier_tracking_number__icontains=search)
            )

        qs = qs.order_by('-created_at')

        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  OrderSerializer(qs, many=True).data,
        })


class LabelMarkPrintedView(APIView):
    """Marque une commande comme physiquement imprimée (dernier maillon du
    pipeline) — action manuelle, aucune vérification technique possible côté
    serveur qu'une impression a réellement eu lieu."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store or not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            order = store.orders.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=404)
        if not order.label_generated_at:
            return Response({'detail': "L'étiquette doit être générée avant d'être marquée imprimée."}, status=400)

        order.label_printed_at = timezone.now()
        order.save(update_fields=['label_printed_at'])
        return Response(OrderSerializer(order).data)


class LabelsPrintAllView(APIView):
    """Fusionne les étiquettes de plusieurs commandes en un seul PDF
    téléchargeable ("Print All" — imprimer plusieurs tickets d'un coup plutôt
    qu'un par un). Marque chaque commande incluse comme "générée" (même effet
    que le téléchargement unitaire)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store or not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)

        ids = [i for i in request.query_params.get('ids', '').split(',') if i.strip().isdigit()]
        if not ids:
            return Response({'detail': 'Aucune commande sélectionnée.'}, status=400)
        orders = list(store.orders.filter(pk__in=ids))
        if not orders:
            return Response({'detail': 'Commandes introuvables.'}, status=404)

        from pypdf import PdfWriter
        writer = PdfWriter()
        errors = []
        for order in orders:
            try:
                pdf_bytes = _fetch_label_pdf(order)
                writer.append(BytesIO(pdf_bytes))
            except Exception as e:
                errors.append(f"#{order.id} : {e}")

        if not len(writer.pages):
            return Response({'detail': 'Aucune étiquette récupérée.', 'errors': errors}, status=502)

        buf = BytesIO()
        writer.write(buf)
        response = HttpResponse(buf.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = 'attachment; filename="etiquettes.pdf"'
        if errors:
            response['X-Label-Errors'] = str(len(errors))
        return response


class PreparedOrdersListView(APIView):
    """4ᵉ étape du pipeline "Expéditions & Retours" (suite du pipeline
    d'impression) : une commande confirmée/expédiée est physiquement
    "préparée" (emballée) par un employé avant remise au transporteur —
    indépendant de l'impression de l'étiquette (les deux peuvent se faire
    dans n'importe quel ordre)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store or not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)

        state = request.query_params.get('state', 'pending')
        if state not in ('pending', 'prepared'):
            return Response({'detail': "État invalide. Valeurs : ('pending', 'prepared')"}, status=400)

        qs = store.orders.filter(status__in=('confirmed', 'shipped'))
        qs = qs.filter(prepared_at__isnull=(state == 'pending'))

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(phone__icontains=search) |
                Q(carrier_tracking_number__icontains=search)
            )

        qs = qs.order_by('-created_at')
        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  OrderSerializer(qs, many=True).data,
        })


class PreparedOrdersMarkView(APIView):
    """Marque en masse une sélection de commandes comme préparées ("Update
    selected state" côté RiseCart) — bulk plutôt que ligne par ligne, la
    préparation se fait souvent en lot (une tournée d'emballage)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        store = _get_store(request)
        if not store or not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        ids = request.data.get('ids') or []
        updated = store.orders.filter(pk__in=ids, prepared_at__isnull=True).update(prepared_at=timezone.now())
        return Response({'updated': updated})


class PredictiveReturnsListView(APIView):
    """Commandes en transit (confirmées/expédiées, pas encore livrées) qui
    présentent un risque élevé de retour — combine DEUX signaux, pas
    seulement l'historique : le risque CLIENT déjà connu (`CustomerRisk`,
    mêmes seuils que ClientListView/AtRiskCustomersPage, Epic 6.3) ET le
    signal TEMPS RÉEL du transporteur pour CETTE expédition précise
    (`carrier_status` classé dans le bucket "tentative échouée" — voir
    `_carrier_status_bucket`). Lecture seule, aucune action possible."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        settings_obj = getattr(store, 'settings', None)
        threshold = settings_obj.risk_threshold_orders if settings_obj else 3
        period_days = settings_obj.risk_period_days if settings_obj else 90
        cutoff = timezone.now() - timedelta(days=period_days)

        risky_phones = set(
            store.orders.filter(status__in=RISK_STATUSES, created_at__gte=cutoff)
            .values('phone').annotate(n=Count('id')).filter(n__gte=threshold)
            .values_list('phone', flat=True)
        )
        risky_phones |= set(CustomerRisk.objects.filter(store=store, manual_risk=True).values_list('phone', flat=True))

        qs = store.orders.filter(status__in=('confirmed', 'shipped'))

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(phone__icontains=search) |
                Q(carrier_tracking_number__icontains=search)
            )

        matching_ids, reasons = [], {}
        for o in qs.only('id', 'phone', 'carrier_status'):
            carrier_flag = _carrier_status_bucket(o.carrier_status)[0] == 'failed_attempt'
            client_flag = o.phone in risky_phones
            if carrier_flag or client_flag:
                matching_ids.append(o.id)
                reasons[o.id] = (['tentative_echouee'] if carrier_flag else []) + (['client_a_risque'] if client_flag else [])

        qs = qs.filter(id__in=matching_ids).order_by('-created_at')
        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]

        results = OrderSerializer(qs, many=True).data
        for row in results:
            row['risk_reasons'] = reasons.get(row['id'], [])

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  results,
        })


class ReturnValidationListView(APIView):
    """Commandes réellement retournées par un transporteur (`status='returned'`
    avec un vrai tracking — écarte les retours saisis manuellement sans
    expédition réelle), en attente de confirmation physique de réception.
    Filtrable par `tracking_substatus` (même champ que "Suivi transporteur",
    réutilisé ici plutôt que dupliqué)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        qs = store.orders.filter(status='returned').exclude(carrier_tracking_number='')

        substatus = request.query_params.get('substatus')
        if substatus:
            qs = qs.filter(tracking_substatus=substatus)

        validated = request.query_params.get('validated')
        if validated == '1':
            qs = qs.filter(return_validated_at__isnull=False)
        elif validated == '0':
            qs = qs.filter(return_validated_at__isnull=True)

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(phone__icontains=search) |
                Q(carrier_tracking_number__icontains=search)
            )

        qs = qs.order_by('-created_at')
        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  OrderSerializer(qs, many=True).data,
        })


class ReturnValidateView(APIView):
    """Confirme la réception physique d'un colis retourné — et remet les
    articles en stock par défaut (`restock`, décision produit 2026-08-12 :
    case cochée par défaut, décochable si la marchandise revient
    abîmée/invendable). `Order.restocked_at` garde l'idempotence — jamais
    restocké deux fois, y compris si ce même order finit aussi annulé plus
    tard (voir `_transition_order_status`)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store or not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            order = store.orders.get(pk=pk, status='returned')
        except Order.DoesNotExist:
            return Response({'detail': 'Commande retournée introuvable.'}, status=404)

        order.return_validated_at = timezone.now()
        update_fields = ['return_validated_at']

        restock = request.data.get('restock', True)
        if restock and not order.restocked_at:
            _restock_order_items(store, order, reason='order_return', note=f"Retour commande #{order.id}")
            order.restocked_at = timezone.now()
            update_fields.append('restocked_at')

        order.save(update_fields=update_fields)
        return Response(OrderDetailSerializer(order).data)


class OrderRetryShipmentView(APIView):
    """Relance manuellement la création d'expédition pour une commande déjà
    confirmée mais sans tracking (ex: aucun transporteur actif au moment de
    la confirmation, ou échec transitoire de l'API transporteur) — voir
    ShipmentsPage.jsx, bouton "Créer l'expédition"/"Réessayer"."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store or not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            order = store.orders.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=404)

        if order.status not in ('confirmed', 'shipped'):
            return Response({'detail': "Seule une commande confirmée ou expédiée peut avoir une expédition créée."}, status=400)
        if order.carrier_tracking_number:
            return Response({'detail': 'Une expédition existe déjà pour cette commande.'}, status=400)

        carrier_id = request.data.get('carrier_id')
        account = None
        if carrier_id:
            account = store.carrier_accounts.filter(pk=carrier_id, is_active=True).first()
        if not account:
            account = store.carrier_accounts.filter(is_default=True, is_active=True).first()
        if not account:
            return Response({'detail': 'Aucun transporteur actif configuré.'}, status=400)

        try:
            result = get_carrier_client(account).create_shipment(order)
        except Exception as e:
            return Response({'detail': f"Erreur transporteur : {e}"}, status=502)

        order.carrier = account
        order.carrier_tracking_number = result.tracking_number
        order.carrier_status = result.status
        order.carrier_shipment_created_at = timezone.now()
        order.save(update_fields=['carrier', 'carrier_tracking_number', 'carrier_status', 'carrier_shipment_created_at'])
        return Response(OrderSerializer(order).data)


class OrderSyncTrackingView(APIView):
    """Bouton de synchronisation manuelle — interroge le transporteur et
    délègue à `sync_order_from_carrier` (rafraîchit `carrier_status`, et fait
    avancer `Order.status` si l'événement transporteur correspond à une
    transition connue). Même logique que la synchronisation automatique
    périodique (`sync_carrier_tracking`)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store or not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            order = store.orders.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=404)

        if not order.carrier_tracking_number or not order.carrier:
            return Response({'detail': "Aucune expédition à suivre pour cette commande."}, status=400)

        try:
            order = sync_order_from_carrier(store, order)
        except TrackingNotFoundError:
            return Response({'detail': "Numéro de suivi introuvable auprès du transporteur."}, status=404)
        except Exception:
            return Response({'detail': "Impossible de récupérer le statut auprès du transporteur."}, status=502)

        return Response(OrderDetailSerializer(order).data)


class YalidineWebhookView(APIView):
    """Réception temps réel des événements Yalidine (`parcel_status_updated`
    notamment) — voir yalidine.app/app/dev/docs/webhooks. Une seule URL pour
    tous les vendeurs (chaque compte Yalidine configure son propre webhook
    vers cette même URL dans son dashboard) ; le tracking porté par le
    premier événement du payload sert à retrouver la commande, donc la
    boutique, donc le `CarrierAccount.webhook_secret` à utiliser pour vérifier
    la signature — même principe que `shop_domain` pour les webhooks Shopify."""
    permission_classes = [AllowAny]

    def get(self, request):
        # Challenge-Response Check (CRC) — Yalidine valide la propriété de
        # l'URL à la création du webhook et périodiquement ensuite. Doit
        # toujours répondre, sans authentification (pas d'account connu à ce
        # stade), sous peine de désactivation automatique du webhook.
        subscribe = request.query_params.get('subscribe')
        crc_token = request.query_params.get('crc_token')
        if subscribe is not None and crc_token is not None:
            return HttpResponse(crc_token, content_type='text/plain')
        return Response(status=400)

    def post(self, request):
        raw_body = request.body
        try:
            payload = json.loads(raw_body or b'{}')
        except json.JSONDecodeError:
            return Response(status=200)

        events = payload.get('events') or []
        if not events:
            return Response(status=200)

        first_tracking = events[0].get('data', {}).get('tracking')
        order = Order.objects.filter(carrier_tracking_number=first_tracking).select_related('store', 'carrier').first()
        if not order or not order.carrier or not order.carrier.webhook_secret:
            # Commande/compte inconnu de ce côté, ou webhook_secret non
            # configuré — on répond 200 quand même pour ne pas déclencher de
            # retries Yalidine qui n'aboutiront jamais.
            return Response(status=200)

        signature = request.headers.get('X-Yalidine-Signature', '')
        expected = hmac.new(order.carrier.webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return Response(status=403)

        if payload.get('type') == 'parcel_status_updated':
            for event in events:
                data = event.get('data', {})
                tracking = data.get('tracking')
                label = data.get('status')
                if not tracking or not label:
                    continue
                evt_order = Order.objects.filter(carrier_tracking_number=tracking, store=order.store).first()
                if not evt_order:
                    continue
                evt_order.carrier_status = label
                evt_order.save(update_fields=['carrier_status'])
                mapped = YALIDINE_STATUS_MAP.get(label)
                if mapped and mapped != evt_order.status and evt_order.status not in ('delivered', 'returned', 'cancelled'):
                    _transition_order_status(
                        order.store, evt_order, mapped, changed_by=None,
                        note=f"Mise à jour automatique (webhook Yalidine) — statut transporteur : {label}",
                    )

        return Response(status=200)
