from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Store, StoreSettings
from .serializers import StoreSerializer, SubscriptionQuotaSerializer, StoreSettingsSerializer
from core.permissions import IsOwnerOrAdminForWrites


class MyStoreView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        try:
            store = request.user.store
        except Store.DoesNotExist:
            return Response({'detail': 'Aucune boutique associée.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(StoreSerializer(store).data)

    def put(self, request):
        store = request.user.store
        serializer = StoreSerializer(store, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class QuotaView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        try:
            quota = request.user.store.quota
        except Exception:
            return Response({'detail': 'Quota introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(SubscriptionQuotaSerializer(quota).data)


class StoreSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _settings(self, request):
        try:
            store = request.user.store
        except Exception:
            return None, Response({'detail': 'Aucune boutique.'}, status=403)
        settings, _ = StoreSettings.objects.get_or_create(store=store)
        return settings, None

    def get(self, request):
        s, err = self._settings(request)
        if err: return err
        return Response(StoreSettingsSerializer(s).data)

    def put(self, request):
        s, err = self._settings(request)
        if err: return err
        ser = StoreSettingsSerializer(s, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)
