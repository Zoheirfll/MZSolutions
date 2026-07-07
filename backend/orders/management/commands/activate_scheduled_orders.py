from django.core.management.base import BaseCommand
from django.utils import timezone
from orders.models import Order
from orders.views import activate_scheduled_order


class Command(BaseCommand):
    help = "Active automatiquement les commandes programmées ('scheduled') dont l'échéance est passée."

    def handle(self, *args, **options):
        due_orders = Order.objects.filter(status='scheduled', scheduled_at__lte=timezone.now()).select_related('store')
        activated_count = 0

        for order in due_orders:
            activate_scheduled_order(order.store, order)
            activated_count += 1

        self.stdout.write(self.style.SUCCESS(f"{activated_count} commande(s) programmée(s) activée(s)."))
