from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import is_owner_or_admin
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
        if not is_owner_or_admin(request):
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
        if direction not in ('push', 'pull'):
            return Response({'detail': "direction doit être 'push' ou 'pull'."}, status=400)

        client = get_channel_client(connection)
        try:
            if direction == 'push':
                products = list(store.products.filter(is_active=True))
                result = client.push_products(products)
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
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        logs = store.channel_sync_logs.all()
        channel = request.query_params.get('channel')
        if channel:
            logs = logs.filter(channel=channel)
        return Response(ChannelSyncLogSerializer(logs[:100], many=True).data)
