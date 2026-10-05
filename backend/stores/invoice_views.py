from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import get_store, is_owner_or_admin

from .invoicing import issue_invoice, render_pdf
from .models import Invoice, SubscriptionPayment


def pdf_response(invoice):
    resp = HttpResponse(render_pdf(invoice), content_type='application/pdf')
    resp['Content-Disposition'] = f'attachment; filename="facture-{invoice.number}.pdf"'
    return resp


class VendorInvoiceListView(APIView):
    """Factures de la boutique (propriétaire ou admin uniquement — donnée financière)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = get_store(request)
        if not store or not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        rows = [{'id': i.id, 'number': i.number, 'issued_at': i.issued_at, 'description': i.snapshot.get('description', ''),
                 'total_ttc': i.snapshot.get('total_ttc')} for i in Invoice.objects.filter(store=store)]
        return Response(rows)


class VendorInvoiceDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        store = get_store(request)
        if not store or not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        invoice = Invoice.objects.filter(pk=pk, store=store).first()
        if not invoice:
            return Response({'detail': 'Introuvable.'}, status=404)
        return pdf_response(invoice)


class PlatformPaymentInvoiceView(APIView):
    """Facture PDF d'un paiement (admin plateforme). Émise à la demande si elle
    manque (paiement confirmé avant la mise en place de la facturation)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from platform_admin.permissions import is_platform_admin
        if not is_platform_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        payment = SubscriptionPayment.objects.select_related('store__owner', 'plan').filter(pk=pk).first()
        if not payment:
            return Response({'detail': 'Introuvable.'}, status=404)
        invoice = issue_invoice(payment)
        if not invoice:
            return Response({'detail': 'Aucune facture : le paiement n’est pas confirmé.'}, status=409)
        return pdf_response(invoice)
