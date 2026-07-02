from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from orders.models import Order, OrderStatusHistory

STALE_DAYS = 3


class Command(BaseCommand):
    help = "Annule automatiquement les commandes bloquées sur 'Non joignable - 3ème tentative' depuis plus de 3 jours."

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=STALE_DAYS)
        cancelled_count = 0

        stale_orders = Order.objects.filter(status='no_answer_3')

        for order in stale_orders:
            last_change = order.history.filter(status='no_answer_3').order_by('-changed_at').first()
            entered_at = last_change.changed_at if last_change else order.updated_at
            if entered_at > cutoff:
                continue

            days_since = (timezone.now() - entered_at).days
            order.status = 'cancelled'
            order.save(update_fields=['status'])
            OrderStatusHistory.objects.create(
                order  = order,
                status = 'cancelled',
                note   = f"Client ne répond pas depuis {days_since} jours (annulation automatique).",
            )
            cancelled_count += 1

        self.stdout.write(self.style.SUCCESS(f"{cancelled_count} commande(s) annulée(s) automatiquement."))
