from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Invoice, InvoiceCounter

CENT = Decimal('0.01')


def _snapshot(payment):
    rate = Decimal(str(getattr(settings, 'INVOICE_VAT_RATE', 19)))
    total = Decimal(payment.amount)
    ht = (total / (1 + rate / 100)).quantize(CENT, ROUND_HALF_UP) if rate else total
    store = payment.store
    owner = store.owner
    return {
        'issuer': {
            'name': getattr(settings, 'INVOICE_ISSUER_NAME', 'MZSolutions'),
            'address': getattr(settings, 'INVOICE_ISSUER_ADDRESS', ''),
            'tax_id': getattr(settings, 'INVOICE_ISSUER_TAX_ID', ''),
        },
        'customer': {'store': store.name, 'owner': f'{owner.first_name} {owner.last_name}'.strip(), 'email': owner.email},
        'description': f"Abonnement {payment.plan.name} ({'annuel' if payment.billing_cycle == 'yearly' else 'mensuel'})",
        'transaction_id': payment.transaction_id,
        'vat_rate': str(rate),
        'total_ht': str(ht),
        'vat': str(total - ht),
        'total_ttc': str(total),
        'currency': 'DA',
    }


def issue_invoice(payment):
    """Émet la facture d'un paiement confirmé. Idempotent : un paiement n'a jamais
    deux factures, et un paiement non confirmé n'en a pas (renvoie None)."""
    if payment.status not in ('success', 'refunded'):
        return None
    with transaction.atomic():
        existing = Invoice.objects.filter(payment=payment).first()
        if existing:
            return existing
        year = timezone.now().year
        InvoiceCounter.objects.get_or_create(year=year)
        counter = InvoiceCounter.objects.select_for_update().get(year=year)
        counter.last += 1
        counter.save(update_fields=['last'])
        return Invoice.objects.create(payment=payment, store=payment.store, number=f'{year}-{counter.last:04d}', snapshot=_snapshot(payment))


def render_pdf(invoice):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    s = invoice.snapshot
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    y = h - 60
    c.setFont('Helvetica-Bold', 18)
    c.drawString(50, y, f'FACTURE {invoice.number}')
    c.setFont('Helvetica', 10)
    y -= 22
    c.drawString(50, y, f"Date : {invoice.issued_at:%d/%m/%Y}")
    y -= 30
    for line in (s['issuer']['name'], s['issuer']['address'], f"NIF : {s['issuer']['tax_id']}" if s['issuer']['tax_id'] else ''):
        if line:
            c.drawString(50, y, line)
            y -= 14
    y2 = h - 112
    c.setFont('Helvetica-Bold', 10)
    c.drawString(330, y2, 'Facturé à')
    c.setFont('Helvetica', 10)
    for line in (s['customer']['store'], s['customer']['owner'], s['customer']['email']):
        y2 -= 14
        if line:
            c.drawString(330, y2, line)
    y = min(y, y2) - 40
    c.setFont('Helvetica-Bold', 10)
    c.drawString(50, y, 'Désignation')
    c.drawRightString(w - 50, y, 'Montant HT')
    c.line(50, y - 4, w - 50, y - 4)
    y -= 22
    c.setFont('Helvetica', 10)
    c.drawString(50, y, s['description'])
    c.drawRightString(w - 50, y, f"{s['total_ht']} {s['currency']}")
    y -= 40
    c.drawRightString(w - 50, y, f"Total HT : {s['total_ht']} {s['currency']}")
    y -= 16
    c.drawRightString(w - 50, y, f"TVA ({s['vat_rate']} %) : {s['vat']} {s['currency']}")
    y -= 18
    c.setFont('Helvetica-Bold', 11)
    c.drawRightString(w - 50, y, f"Total TTC : {s['total_ttc']} {s['currency']}")
    if s.get('transaction_id'):
        c.setFont('Helvetica', 8)
        c.drawString(50, 50, f"Transaction de paiement : {s['transaction_id']}")
    c.showPage()
    c.save()
    return buf.getvalue()
