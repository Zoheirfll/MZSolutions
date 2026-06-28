from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Store
from .serializers import StoreSerializer, SubscriptionQuotaSerializer


class MyStoreView(APIView):
    permission_classes = [IsAuthenticated]

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
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            quota = request.user.store.quota
        except Exception:
            return Response({'detail': 'Quota introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(SubscriptionQuotaSerializer(quota).data)
