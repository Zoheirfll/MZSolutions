from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from orders import payments
from orders.models import Order


class Command(BaseCommand):
    help = (
        "Vérifie auprès de SofizPay les paiements en ligne restés en attente "
        "(SofizPay n'a pas de webhook). À planifier toutes les ~10 min."
    )

    def handle(self, *args, **options):
        from stores.models import SubscriptionPayment

        since = timezone.now() - timedelta(days=2)
        counts = {'success': 0, 'failed': 0, 'pending': 0}
        order_ids = Order.objects.filter(
            payment_method='sofizpay', status='pending', created_at__gte=since,
        ).exclude(sofizpay_transaction_id='').values_list('id', flat=True)
        for oid in order_ids:
            counts[payments.verify_order_payment(oid)] += 1
        sub_ids = SubscriptionPayment.objects.filter(status='pending', created_at__gte=since).values_list('id', flat=True)
        for sid in sub_ids:
            counts[payments.verify_subscription_payment(sid)] += 1
        self.stdout.write(f"Paiements vérifiés — payés: {counts['success']}, échoués: {counts['failed']}, en attente: {counts['pending']}")
