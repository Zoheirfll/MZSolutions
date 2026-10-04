"""Application du résultat d'un paiement SofizPay (commandes et abonnements).

SofizPay n'a pas de webhook : ces fonctions sont appelées au retour du client,
à la demande, et par `manage.py check_pending_payments`. Idempotentes — la
vérification réseau se fait hors verrou, l'application sous `select_for_update`
avec re-contrôle du statut, donc un double appel ne confirme/crédite jamais deux fois.
"""
from datetime import timedelta

from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from . import sofizpay
from .models import Order, OrderStatusHistory

FAILED_NOTE = "Paiement SofizPay échoué. Commande non confirmée automatiquement."


def verify_order_payment(order_id):
    """Interroge SofizPay pour une commande en attente de paiement et applique le
    résultat. Renvoie 'success' | 'pending' | 'failed'. Une panne SofizPay laisse
    la commande intacte ('pending')."""
    from .views import _fire_order_webhook

    order = Order.objects.select_related('store').filter(pk=order_id).first()
    if not order or order.payment_method != 'sofizpay' or not order.sofizpay_transaction_id:
        return 'pending'
    if order.status != 'pending':
        # Déjà traitée : confirmée par un appel précédent, ou prise en charge à la main.
        return 'failed' if order.status == 'cancelled' else 'success'
    try:
        result = sofizpay.check_status(order.sofizpay_transaction_id, order.total)
    except sofizpay.SofizPayError:
        return 'pending'

    if result == 'success':
        with transaction.atomic():
            locked = Order.objects.select_for_update().get(pk=order.pk)
            if locked.status != 'pending':
                return 'success'
            locked.status = 'confirmed'
            locked.save(update_fields=['status'])
            OrderStatusHistory.objects.create(
                order=locked, status='confirmed', note='Paiement confirmé automatiquement via SofizPay.')
            try:
                quota = locked.store.quota
                quota.orders_used += 1
                quota.save(update_fields=['orders_used'])
            except Exception:
                pass
        _fire_order_webhook(order.store, locked, 'order.paid')
        _fire_order_webhook(order.store, locked, 'order.confirmed')
    elif result == 'failed':
        _, created = OrderStatusHistory.objects.get_or_create(order=order, status=order.status, note=FAILED_NOTE)
        if created and order.store.email:
            send_mail(
                subject=f"MZSolutions — Paiement échoué pour la commande #{order.id}",
                message=(
                    f"Le paiement en ligne (SofizPay) pour la commande #{order.id} "
                    f"({order.first_name} {order.last_name}) a échoué.\n\n"
                    "La commande n'a pas été confirmée automatiquement. "
                    "Vous pouvez la traiter manuellement depuis votre tableau de bord."
                ),
                from_email=None, recipient_list=[order.store.email], fail_silently=True,
            )
    return result


def verify_subscription_payment(payment_id):
    """Même principe pour un abonnement : le quota n'est mis à jour qu'à la
    confirmation réelle du paiement. Renvoie 'success' | 'pending' | 'failed'."""
    from stores.models import SubscriptionPayment

    payment = SubscriptionPayment.objects.select_related('store', 'plan').filter(pk=payment_id).first()
    if not payment:
        return 'pending'
    if payment.status != 'pending':
        return payment.status
    try:
        result = sofizpay.check_status(payment.transaction_id, payment.amount)
    except sofizpay.SofizPayError:
        return 'pending'

    with transaction.atomic():
        locked = SubscriptionPayment.objects.select_for_update().get(pk=payment.pk)
        if locked.status != 'pending':
            return locked.status
        if result == 'success':
            plan = locked.plan
            quota = locked.store.quota
            quota.plan = plan
            quota.billing_cycle = locked.billing_cycle
            quota.orders_limit = plan.orders_limit if plan.orders_limit is not None else 10**9
            quota.orders_used = 0
            quota.period_end = timezone.now() + timedelta(days=365 if locked.billing_cycle == 'yearly' else 30)
            quota.save(update_fields=['plan', 'billing_cycle', 'orders_limit', 'orders_used', 'period_end'])
            locked.status = 'success'
            locked.save(update_fields=['status'])
        elif result == 'failed':
            locked.status = 'failed'
            locked.save(update_fields=['status'])
    return result
