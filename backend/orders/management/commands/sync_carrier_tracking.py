from django.core.management.base import BaseCommand
from orders.models import Order
from orders.views import sync_order_from_carrier


class Command(BaseCommand):
    help = (
        "Interroge le transporteur pour chaque commande expédiée (carrier_tracking_number "
        "renseigné, statut pas encore terminal) et met à jour Order.status automatiquement "
        "si l'événement correspond à une transition connue (expédiée/livrée/retournée) — "
        "voir NOEST_STATUS_MAP. Non planifiée automatiquement — à brancher sur le "
        "Planificateur de tâches Windows / cron, comme cancel_stale_calls."
    )

    def handle(self, *args, **options):
        orders = Order.objects.exclude(status__in=['delivered', 'returned', 'cancelled']) \
            .exclude(carrier_tracking_number='') \
            .filter(carrier__isnull=False) \
            .select_related('store', 'carrier')

        synced, updated, errors = 0, 0, 0
        for order in orders:
            previous_status = order.status
            try:
                sync_order_from_carrier(order.store, order)
            except Exception as e:
                errors += 1
                self.stderr.write(f"Commande #{order.id} : {e}")
                continue
            synced += 1
            if order.status != previous_status:
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f"{synced} commande(s) synchronisée(s), {updated} changement(s) de statut appliqué(s), {errors} erreur(s)."
        ))
