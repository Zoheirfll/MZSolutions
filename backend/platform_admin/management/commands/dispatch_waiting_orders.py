from django.core.management.base import BaseCommand

from platform_admin import dispatch
from platform_admin.tasks import track_task


class Command(BaseCommand):
    help = ("Dispatch du service de confirmation : redistribue les commandes en attente d'assignation "
            "dont le délai est écoulé et clôt les flux déjà traités. À planifier chaque minute.")

    @track_task('dispatch_waiting_orders')
    def handle(self, *args, **options):
        result = dispatch.run_cycle()
        self.stdout.write(self.style.SUCCESS(
            f"{result['assigned']} commande(s) assignée(s), {result['closed']} flux clos."))
