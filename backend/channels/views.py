import json
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.http import HttpResponseRedirect
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import is_owner_or_admin, has_permission
from . import shopify_oauth
from .clients import get_channel_client
from .models import ChannelConnection, ChannelSyncLog, CHANNEL_CHOICES
from .serializers import ChannelConnectionSerializer, ChannelSyncLogSerializer


def _get_store(request):
    try:
        return request.user.store
    except Exception:
        pass
    try:
        return request.user.team_membership.store
    except Exception:
        return None


class ChannelConnectionListCreateView(APIView):
    """Liste des connexions + connexion à un nouveau canal (upsert par
    canal — un store ne peut avoir qu'une connexion par canal)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'channels_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        connections = store.channel_connections.all()
        return Response(ChannelConnectionSerializer(connections, many=True).data)

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        channel = request.data.get('channel')
        if channel not in dict(CHANNEL_CHOICES):
            return Response({'detail': f"Canal invalide. Valeurs : {list(dict(CHANNEL_CHOICES))}"}, status=400)

        connection, _ = ChannelConnection.objects.update_or_create(
            store=store, channel=channel,
            defaults={
                'shop_url':   request.data.get('shop_url', ''),
                'api_key':    request.data.get('api_key', ''),
                'api_secret': request.data.get('api_secret', ''),
                'is_active':  True,
            },
        )
        return Response(ChannelConnectionSerializer(connection).data, status=201)


class ChannelConnectionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        if not is_owner_or_admin(request):
            return None, Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        try:
            return store.channel_connections.get(pk=pk), None
        except ChannelConnection.DoesNotExist:
            return None, Response({'detail': 'Connexion introuvable.'}, status=404)

    def put(self, request, pk):
        connection, err = self._get(request, pk)
        if err: return err
        for field in ['shop_url', 'api_key', 'api_secret', 'is_active']:
            if field in request.data:
                setattr(connection, field, request.data[field])
        connection.save()
        return Response(ChannelConnectionSerializer(connection).data)

    def delete(self, request, pk):
        connection, err = self._get(request, pk)
        if err: return err
        connection.delete()
        return Response(status=204)


class ChannelSyncView(APIView):
    """Déclenche une synchronisation manuelle (US-8.2.1) — push du catalogue
    ou pull des commandes distantes, journalisé dans ChannelSyncLog."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            connection = store.channel_connections.get(pk=pk, is_active=True)
        except ChannelConnection.DoesNotExist:
            return Response({'detail': 'Connexion introuvable ou inactive.'}, status=404)

        direction = request.data.get('direction', 'push')
        if direction not in ('push', 'pull', 'pull_products'):
            return Response({'detail': "direction doit être 'push', 'pull' ou 'pull_products'."}, status=400)

        client = get_channel_client(connection)
        try:
            if direction == 'push':
                products = list(store.products.filter(is_active=True))
                result = client.push_products(products)
            elif direction == 'pull_products':
                result = client.pull_products()
            else:
                result = client.pull_orders()
            status_value = 'success' if result.success else 'error'
        except Exception as e:
            result = None
            status_value = 'error'
            message = f"Erreur de synchronisation : {e}"

        log = ChannelSyncLog.objects.create(
            store=store, connection=connection, channel=connection.channel,
            direction=direction, status=status_value,
            items_synced=result.items_synced if result else 0,
            message=result.message if result else message,
        )
        connection.last_synced_at = timezone.now()
        connection.save(update_fields=['last_synced_at'])

        return Response(ChannelSyncLogSerializer(log).data, status=201)


class ChannelSyncLogListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'channels_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        logs = store.channel_sync_logs.all()
        channel = request.query_params.get('channel')
        if channel:
            logs = logs.filter(channel=channel)
        return Response(ChannelSyncLogSerializer(logs[:100], many=True).data)


class ShopifyInstallView(APIView):
    """Démarre le flux OAuth (US demandée : le vendeur connecte sa propre
    boutique Shopify, aucun token saisi manuellement). Renvoie l'URL
    d'autorisation Shopify vers laquelle le frontend doit rediriger le
    navigateur du vendeur."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        if not settings.SHOPIFY_CLIENT_ID or not settings.SHOPIFY_CLIENT_SECRET:
            return Response({'detail': "Intégration Shopify non configurée côté serveur (SHOPIFY_CLIENT_ID/SECRET manquants)."}, status=500)

        try:
            shop = shopify_oauth.normalize_shop_domain(request.data.get('shop'))
        except shopify_oauth.ShopifyOAuthError as e:
            return Response({'detail': str(e)}, status=400)

        state = shopify_oauth.make_state(store.id)
        return Response({'authorize_url': shopify_oauth.build_authorize_url(shop, state)})


class ShopifyCallbackView(APIView):
    """Callback OAuth public — Shopify redirige ici le navigateur du vendeur
    après qu'il a approuvé l'accès sur SA boutique. Pas d'authentification
    JWT possible à ce stade (requête du navigateur, pas de notre frontend) :
    le `state` signé (voir shopify_oauth.make_state) fait office d'identité."""
    permission_classes = [AllowAny]

    def get(self, request):
        from stores.models import Store

        if not shopify_oauth.verify_callback_hmac(request.query_params):
            return Response({'detail': 'Signature de callback invalide.'}, status=403)

        store_id = shopify_oauth.read_state(request.query_params.get('state'))
        if not store_id:
            return Response({'detail': 'Requête expirée ou invalide, relancez la connexion depuis le tableau de bord.'}, status=400)
        try:
            store = Store.objects.get(pk=store_id)
        except Store.DoesNotExist:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        shop = request.query_params.get('shop')
        code = request.query_params.get('code')
        try:
            shop = shopify_oauth.normalize_shop_domain(shop)
            access_token, scope = shopify_oauth.exchange_code_for_token(shop, code)
        except shopify_oauth.ShopifyOAuthError as e:
            return Response({'detail': str(e)}, status=400)

        ChannelConnection.objects.update_or_create(
            store=store, channel='shopify',
            defaults={'shop_url': shop, 'access_token': access_token, 'scope': scope, 'is_active': True},
        )
        shopify_oauth.register_webhooks(shop, access_token)

        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/dashboard/canaux-vente?shopify=connected")


class ShopifyOrderWebhookView(APIView):
    """Réception en temps réel des commandes Shopify (US demandée : les
    commandes passées sur la boutique Shopify du vendeur doivent arriver
    automatiquement dans MZSolutions). Remplace le pull manuel pour ce flux
    précis — le pull manuel (`ChannelSyncView`) reste utilisable en secours."""
    permission_classes = [AllowAny]

    def post(self, request):
        raw_body = request.body
        hmac_header = request.headers.get('X-Shopify-Hmac-Sha256', '')
        if not shopify_oauth.verify_webhook_hmac(raw_body, hmac_header):
            return Response(status=403)

        shop_domain = request.headers.get('X-Shopify-Shop-Domain', '')
        connection = ChannelConnection.objects.filter(channel='shopify', shop_url=shop_domain, is_active=True).first()
        if not connection:
            # Boutique inconnue ou déconnectée depuis — on répond 200 quand
            # même pour que Shopify ne réessaie pas indéfiniment un webhook
            # qui ne trouvera jamais de destinataire.
            return Response(status=200)

        try:
            payload = json.loads(raw_body or b'{}')
        except json.JSONDecodeError:
            return Response(status=200)

        self._import_order(connection.store, payload)
        return Response(status=200)

    @transaction.atomic
    def _import_order(self, store, payload):
        from products.models import Product, VariantOption
        from orders.models import Order, OrderItem, OrderStatusHistory
        from orders.utils import assign_order_round_robin
        from orders.views import _deduct_stock_for_order, _fire_order_webhook

        shopify_order_id = payload.get('id')
        if not shopify_order_id:
            return
        external_ref = f"shopify:{shopify_order_id}"
        if Order.objects.filter(store=store, external_ref=external_ref).exists():
            return  # déjà importée (orders/updated ou retry webhook) — idempotent

        shipping = payload.get('shipping_address') or payload.get('customer', {}) or {}
        customer = payload.get('customer') or {}

        order = Order.objects.create(
            store=store,
            first_name=shipping.get('first_name') or customer.get('first_name') or 'Client',
            last_name=shipping.get('last_name') or customer.get('last_name') or '',
            phone=shipping.get('phone') or customer.get('phone') or payload.get('phone') or '',
            wilaya=shipping.get('province') or '',
            commune=shipping.get('city') or '',
            address=shipping.get('address1') or '',
            customer_email=payload.get('email') or '',
            shipping_cost=Decimal(payload.get('total_shipping_price_set', {}).get('shop_money', {}).get('amount') or 0),
            note=f"Commande importée depuis Shopify (#{payload.get('name', shopify_order_id)}).",
            external_ref=external_ref,
        )

        for line in payload.get('line_items', []):
            sku = (line.get('sku') or '').strip()
            product = None
            variant_option = None
            if sku:
                variant_option = VariantOption.objects.filter(variant__product__store=store, sku=sku).select_related('variant__product').first()
                if variant_option:
                    product = variant_option.variant.product
                else:
                    product = Product.objects.filter(store=store, sku=sku).first()
            OrderItem.objects.create(
                order=order,
                product=product,
                variant_option=variant_option,
                product_name=line.get('title', ''),
                price=line.get('price', 0) or 0,
                quantity=line.get('quantity', 1),
            )

        order.recalculate()
        OrderStatusHistory.objects.create(order=order, status='pending', note='Importée automatiquement depuis Shopify.')
        assign_order_round_robin(order)
        _deduct_stock_for_order(store, order)
        _fire_order_webhook(store, order, 'order.created')


class ShopifyComplianceWebhookView(APIView):
    """Les 3 webhooks de conformité RGPD exigés par Shopify pour toute app en
    distribution publique (obligatoires pour la review) — voir
    https://shopify.dev/docs/apps/build/privacy-law-compliance. Signature
    HMAC vérifiée exactement comme les autres webhooks Shopify."""
    permission_classes = [AllowAny]
    topic = None  # défini par sous-classe

    def post(self, request):
        raw_body = request.body
        hmac_header = request.headers.get('X-Shopify-Hmac-Sha256', '')
        if not shopify_oauth.verify_webhook_hmac(raw_body, hmac_header):
            return Response(status=403)

        try:
            payload = json.loads(raw_body or b'{}')
        except json.JSONDecodeError:
            payload = {}

        getattr(self, f'handle_{self.topic}')(payload)
        return Response(status=200)

    def handle_customers_data_request(self, payload):
        # Demande d'un client de récupérer ses données — nos seules données
        # le concernant sont ses commandes (identifiées par téléphone/email),
        # déjà consultables par le marchand lui-même dans son tableau de bord
        # MZSolutions. Rien à exporter côté plateforme au-delà de ça.
        pass

    def handle_customers_redact(self, payload):
        # Anonymise les commandes de ce client précis, 48h après la demande
        # de suppression — on garde la ligne de commande (historique de
        # vente légitime du marchand) mais on efface les données
        # personnelles identifiantes.
        from orders.models import Order
        shop_domain = payload.get('shop_domain', '')
        customer = payload.get('customer', {}) or {}
        emails = [e for e in [payload.get('customer', {}).get('email')] if e]
        phones = [p for p in [customer.get('phone')] if p]
        connection = ChannelConnection.objects.filter(channel='shopify', shop_url=shop_domain).first()
        if not connection:
            return
        qs = Order.objects.filter(store=connection.store, external_ref__startswith='shopify:')
        if emails:
            qs = qs.filter(customer_email__in=emails)
        elif phones:
            qs = qs.filter(phone__in=phones)
        else:
            return
        qs.update(first_name='Client supprimé', last_name='', phone='', address='', customer_email='')

    def handle_shop_redact(self, payload):
        # Envoyé 48h après la désinstallation de l'app — on supprime les
        # identifiants de connexion stockés (token, secret) puisque nous
        # n'avons plus le droit de les conserver ni de les utiliser.
        shop_domain = payload.get('shop_domain', '')
        ChannelConnection.objects.filter(channel='shopify', shop_url=shop_domain).delete()


class ShopifyCustomersDataRequestView(ShopifyComplianceWebhookView):
    topic = 'customers_data_request'


class ShopifyCustomersRedactView(ShopifyComplianceWebhookView):
    topic = 'customers_redact'


class ShopifyShopRedactView(ShopifyComplianceWebhookView):
    topic = 'shop_redact'
