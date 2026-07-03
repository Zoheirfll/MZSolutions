from django.db import transaction
from django.db.models import Sum
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import is_owner_or_admin, has_permission
from products.models import Product
from team.models import TeamMember
from .models import DropshipperProduct, Commission, CommissionEntry, CommissionPayment
from .serializers import (
    DropshipperProductSerializer, CommissionSerializer, CommissionEntrySerializer,
    CommissionPaymentSerializer, DropshipperSummarySerializer,
)


def _get_store(request):
    try:
        return request.user.store
    except Exception:
        pass
    try:
        return request.user.team_membership.store
    except Exception:
        return None


def _get_membership(request):
    try:
        return request.user.team_membership
    except Exception:
        return None


def _balance(store, dropshipper):
    earned = CommissionEntry.objects.filter(store=store, dropshipper=dropshipper).aggregate(s=Sum('amount'))['s'] or 0
    paid   = CommissionPayment.objects.filter(store=store, dropshipper=dropshipper).aggregate(s=Sum('amount'))['s'] or 0
    return earned, paid, earned - paid


class DropshipperProductListCreateView(APIView):
    """Sélection de produits par un dropshipper (US-7.3.1).
    Le dropshipper gère sa propre sélection ; owner/admin peuvent consulter
    celle d'un dropshipper précis via ?dropshipper=<id>."""
    permission_classes = [IsAuthenticated]

    def _resolve_dropshipper(self, request):
        membership = _get_membership(request)
        if membership and membership.role == 'dropshipper':
            return membership, None
        if is_owner_or_admin(request):
            dropshipper_id = request.query_params.get('dropshipper') or request.data.get('dropshipper')
            if not dropshipper_id:
                return None, Response({'detail': 'Paramètre dropshipper requis.'}, status=400)
            store = _get_store(request)
            try:
                return store.team_members.get(pk=dropshipper_id, role='dropshipper'), None
            except TeamMember.DoesNotExist:
                return None, Response({'detail': 'Dropshipper introuvable.'}, status=404)
        return None, Response({'detail': 'Accès refusé.'}, status=403)

    def get(self, request):
        dropshipper, err = self._resolve_dropshipper(request)
        if err: return err
        qs = DropshipperProduct.objects.filter(dropshipper=dropshipper).select_related('product')
        return Response(DropshipperProductSerializer(qs, many=True).data)

    def post(self, request):
        dropshipper, err = self._resolve_dropshipper(request)
        if err: return err
        store = _get_store(request)
        product_id = request.data.get('product')
        try:
            product = store.products.get(pk=product_id)
        except Product.DoesNotExist:
            return Response({'detail': 'Produit introuvable.'}, status=404)

        obj, created = DropshipperProduct.objects.get_or_create(
            store=store, dropshipper=dropshipper, product=product,
        )
        return Response(DropshipperProductSerializer(obj).data, status=201 if created else 200)


class DropshipperProductDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        store = _get_store(request)
        membership = _get_membership(request)
        qs = DropshipperProduct.objects.filter(store=store, pk=pk)
        if membership and membership.role == 'dropshipper':
            qs = qs.filter(dropshipper=membership)
        elif not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        deleted, _ = qs.delete()
        if not deleted:
            return Response({'detail': 'Sélection introuvable.'}, status=404)
        return Response(status=204)


class CommissionListCreateView(APIView):
    """Configuration des commissions produit × dropshipper par le vendeur (US-7.3.2)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        qs = Commission.objects.filter(store=store).select_related('product', 'dropshipper')
        dropshipper_id = request.query_params.get('dropshipper')
        if dropshipper_id:
            qs = qs.filter(dropshipper_id=dropshipper_id)
        return Response(CommissionSerializer(qs, many=True).data)

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        dropshipper_id = request.data.get('dropshipper')
        product_id     = request.data.get('product')
        try:
            dropshipper = store.team_members.get(pk=dropshipper_id, role='dropshipper')
        except TeamMember.DoesNotExist:
            return Response({'detail': 'Dropshipper introuvable.'}, status=404)
        try:
            product = store.products.get(pk=product_id)
        except Product.DoesNotExist:
            return Response({'detail': 'Produit introuvable.'}, status=404)

        commission, _ = Commission.objects.update_or_create(
            store=store, dropshipper=dropshipper, product=product,
            defaults={
                'commission_type': request.data.get('commission_type', 'percentage'),
                'value': request.data.get('value', 0),
            },
        )
        return Response(CommissionSerializer(commission).data, status=201)


class CommissionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        if not is_owner_or_admin(request):
            return None, Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        try:
            return Commission.objects.get(store=store, pk=pk), None
        except Commission.DoesNotExist:
            return None, Response({'detail': 'Commission introuvable.'}, status=404)

    def put(self, request, pk):
        commission, err = self._get(request, pk)
        if err: return err
        for field in ['commission_type', 'value']:
            if field in request.data:
                setattr(commission, field, request.data[field])
        commission.save()
        return Response(CommissionSerializer(commission).data)

    def delete(self, request, pk):
        commission, err = self._get(request, pk)
        if err: return err
        commission.delete()
        return Response(status=204)


class DropshipperListView(APIView):
    """Liste des dropshippers avec solde de commission (owner/admin) — US-7.3.4."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'dropshipping_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        members = store.team_members.filter(role='dropshipper', is_active=True)
        data = []
        for m in members:
            earned, paid, balance = _balance(store, m)
            data.append({
                'id': m.id, 'first_name': m.first_name, 'last_name': m.last_name, 'email': m.email,
                'products_count': DropshipperProduct.objects.filter(dropshipper=m).count(),
                'total_earned': earned, 'total_paid': paid, 'balance': balance,
            })
        return Response(DropshipperSummarySerializer(data, many=True).data)


class DropshipperDetailView(APIView):
    """Détail solde + historique commissions/paiements d'un dropshipper.
    Accessible au vendeur (owner/admin) pour n'importe quel dropshipper,
    et au dropshipper lui-même pour ses propres données."""
    permission_classes = [IsAuthenticated]

    def _resolve(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, None, Response({'detail': 'Accès refusé.'}, status=403)
        membership = _get_membership(request)
        if membership and membership.role == 'dropshipper':
            if str(membership.pk) != str(pk):
                return None, None, Response({'detail': 'Accès refusé.'}, status=403)
            return store, membership, None
        if is_owner_or_admin(request) or has_permission(request, 'dropshipping_view'):
            try:
                return store, store.team_members.get(pk=pk, role='dropshipper'), None
            except TeamMember.DoesNotExist:
                return None, None, Response({'detail': 'Dropshipper introuvable.'}, status=404)
        return None, None, Response({'detail': 'Accès refusé.'}, status=403)

    def get(self, request, pk):
        store, dropshipper, err = self._resolve(request, pk)
        if err: return err
        earned, paid, balance = _balance(store, dropshipper)
        entries  = CommissionEntry.objects.filter(store=store, dropshipper=dropshipper).select_related('order_item', 'product')[:200]
        payments = CommissionPayment.objects.filter(store=store, dropshipper=dropshipper)
        return Response({
            'id': dropshipper.id, 'first_name': dropshipper.first_name, 'last_name': dropshipper.last_name,
            'total_earned': earned, 'total_paid': paid, 'balance': balance,
            'entries':  CommissionEntrySerializer(entries, many=True).data,
            'payments': CommissionPaymentSerializer(payments, many=True).data,
        })


class DropshipperPayView(APIView):
    """Marque le solde d'un dropshipper comme payé (US-7.3.4) — owner/admin uniquement."""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        try:
            dropshipper = store.team_members.get(pk=pk, role='dropshipper')
        except TeamMember.DoesNotExist:
            return Response({'detail': 'Dropshipper introuvable.'}, status=404)

        _, _, balance = _balance(store, dropshipper)
        if balance <= 0:
            return Response({'detail': 'Aucun solde à payer.'}, status=400)

        payment = CommissionPayment.objects.create(
            store=store, dropshipper=dropshipper, amount=balance, note=request.data.get('note', ''),
        )
        return Response(CommissionPaymentSerializer(payment).data, status=201)
