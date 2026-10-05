"""Recherche globale et consultation en lecture seule (admin plateforme — phase 8). Niveau admin."""
from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.models import User
from orders.models import Order
from products.models import Product
from stores.models import Store

from .account_views import MAX_REASON, MIN_REASON, log_platform_audit
from .impersonation import clear_view_cookie, set_view_cookie
from .permissions import is_platform_admin

MIN_QUERY = 3
LIMIT = 10


def _forbidden():
    return Response({'detail': 'Accès réservé aux administrateurs de la plateforme.'}, status=403)


class PlatformSearchView(APIView):
    """Recherche à travers toute la plateforme (`?q=`, 3 caractères minimum, 10 résultats par
    type). Lecture seule. ⚠️ Les commandes contiennent des données de clients finaux : la
    recherche est journalisée SANS le terme (seulement sa longueur et les compteurs)."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'platform_search'

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        q = request.query_params.get('q', '').strip()
        if len(q) < MIN_QUERY:
            return Response({'detail': f'Saisissez au moins {MIN_QUERY} caractères.'}, status=400)

        stores = Store.objects.filter(Q(name__icontains=q) | Q(slug__icontains=q) | Q(owner__email__icontains=q)).select_related('owner')[:LIMIT]
        users = User.objects.filter(Q(email__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q))[:LIMIT]
        order_q = Q(phone__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(carrier_tracking_number__icontains=q)
        if q.isdigit():
            order_q |= Q(pk=int(q))
        orders = Order.objects.filter(order_q).select_related('store').order_by('-created_at')[:LIMIT]
        products = Product.objects.filter(Q(name__icontains=q) | Q(sku__icontains=q)).select_related('store')[:LIMIT]

        data = {
            'stores': [{'id': s.id, 'name': s.name, 'slug': s.slug, 'owner_email': s.owner.email, 'is_active': s.is_active} for s in stores],
            'users': [{'id': u.id, 'email': u.email, 'name': f'{u.first_name} {u.last_name}'.strip(), 'is_active': u.is_active} for u in users],
            'orders': [{'id': o.id, 'store_id': o.store_id, 'store_name': o.store.name, 'customer': f'{o.first_name} {o.last_name}'.strip(),
                        'phone': o.phone, 'status': o.status, 'total': o.total, 'tracking': o.carrier_tracking_number, 'created_at': o.created_at}
                       for o in orders],
            'products': [{'id': p.id, 'store_id': p.store_id, 'store_name': p.store.name, 'name': p.name, 'sku': p.sku, 'price': p.price, 'is_active': p.is_active}
                         for p in products],
        }
        log_platform_audit(request, 'platform.global_search', description='Recherche globale',
                           metadata={'query_length': len(q), 'counts': {k: len(v) for k, v in data.items()}})
        return Response(data)


class PlatformViewAsView(APIView):
    """Ouvre le dashboard d'une boutique en LECTURE SEULE (1 h). Motif obligatoire, journalisé.
    Le serveur refuse ensuite toute écriture sur ce dashboard (voir CookieJWTAuthentication)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, store_id):
        if not is_platform_admin(request):
            return _forbidden()
        reason = (request.data.get('reason') or '').strip()
        if not (MIN_REASON <= len(reason) <= MAX_REASON):
            return Response({'detail': f'Le motif est obligatoire ({MIN_REASON} à {MAX_REASON} caractères).'}, status=400)
        store = Store.objects.filter(pk=store_id).first()
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        log_platform_audit(request, 'platform.view_as_started', store=store, target=store,
                           description=f'Consultation en lecture seule — {reason}', metadata={'reason': reason})
        response = Response({'detail': 'Consultation en lecture seule ouverte.', 'store_name': store.name})
        set_view_cookie(response, store.id)
        return response


class PlatformViewAsLeaveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        response = Response({'detail': 'Consultation terminée.'})
        clear_view_cookie(response)
        return response
