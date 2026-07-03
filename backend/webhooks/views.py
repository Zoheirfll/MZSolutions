import secrets
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import is_owner_or_admin, has_permission
from .models import WebhookEndpoint, WebhookLog, IncomingWebhookKey, WEBHOOK_EVENT_CHOICES
from .serializers import WebhookEndpointSerializer, WebhookLogSerializer, IncomingWebhookKeySerializer


def _get_store(request):
    try:
        return request.user.store
    except Exception:
        pass
    try:
        return request.user.team_membership.store
    except Exception:
        return None


class WebhookEventCatalogView(APIView):
    """Catalogue des événements disponibles, pour peupler les cases à cocher
    du formulaire d'ajout côté frontend."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response([{'key': k, 'label': v} for k, v in WEBHOOK_EVENT_CHOICES])


class WebhookEndpointListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'webhooks_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        return Response(WebhookEndpointSerializer(store.webhook_endpoints.all(), many=True).data)

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        serializer = WebhookEndpointSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(store=store)
        return Response(serializer.data, status=201)


class WebhookEndpointDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        if not is_owner_or_admin(request):
            return None, Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        try:
            return store.webhook_endpoints.get(pk=pk), None
        except WebhookEndpoint.DoesNotExist:
            return None, Response({'detail': 'Endpoint introuvable.'}, status=404)

    def put(self, request, pk):
        endpoint, err = self._get(request, pk)
        if err: return err
        serializer = WebhookEndpointSerializer(endpoint, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # réactiver une pause automatique remet le compteur d'échecs à zéro
        if request.data.get('is_active') and endpoint.consecutive_failures:
            endpoint.consecutive_failures = 0
            endpoint.save(update_fields=['consecutive_failures'])
        return Response(WebhookEndpointSerializer(endpoint).data)

    def delete(self, request, pk):
        endpoint, err = self._get(request, pk)
        if err: return err
        endpoint.delete()
        return Response(status=204)


class WebhookLogListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'webhooks_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        logs = store.webhook_logs.all()
        direction = request.query_params.get('direction')
        if direction:
            logs = logs.filter(direction=direction)
        return Response(WebhookLogSerializer(logs[:100], many=True).data)


class IncomingWebhookKeyView(APIView):
    """Clé secrète d'authentification des webhooks entrants (US-8.4.2 AC)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'webhooks_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        key, _ = IncomingWebhookKey.objects.get_or_create(store=store)
        return Response(IncomingWebhookKeySerializer(key).data)

    def post(self, request):
        """Régénère la clé (rotation)."""
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        key, _ = IncomingWebhookKey.objects.get_or_create(store=store)
        key.key = secrets.token_urlsafe(32)
        key.is_active = True
        key.save(update_fields=['key', 'is_active'])
        return Response(IncomingWebhookKeySerializer(key).data)


class PublicIncomingWebhookView(APIView):
    """Point d'entrée public pour les webhooks entrants (US-8.4.2) — un outil
    externe (Zapier, Make, n8n...) poste vers cette URL, authentifiée par la
    clé secrète dans le chemin (même principe qu'un webhook entrant Slack).
    Journalise systématiquement, même en cas de clé invalide, pour visibilité."""
    permission_classes = [AllowAny]

    def post(self, request, key):
        try:
            incoming_key = IncomingWebhookKey.objects.select_related('store').get(key=key, is_active=True)
        except IncomingWebhookKey.DoesNotExist:
            return Response({'detail': 'Clé invalide.'}, status=403)

        WebhookLog.objects.create(
            store=incoming_key.store, direction='inbound', event=request.data.get('event', ''),
            payload=request.data if isinstance(request.data, dict) else {'raw': str(request.data)},
            status='success',
        )
        return Response({'detail': 'Reçu.'}, status=200)
