from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .overview import compute_overview
from .permissions import is_platform_admin


class PlatformOverviewView(APIView):
    """KPI de la plateforme — niveau admin (lecture seule)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return Response({'detail': 'Accès réservé aux administrateurs de la plateforme.'}, status=403)
        return Response(compute_overview())
