from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from orders.models import AbandonedCart
from orders.utils import send_abandoned_cart_email
from stores.models import Store


class Command(BaseCommand):
    help = "Envoie des relances email pour les paniers abandonnés non récupérés."

    def handle(self, *args, **options):
        now = timezone.now()
        sent = 0
        skipped = 0

        for store in Store.objects.select_related('settings').all():
            try:
                delay_hours = store.settings.abandoned_cart_delay_hours
            except Exception:
                delay_hours = 1

            cutoff = now - timedelta(hours=delay_hours)
            carts = AbandonedCart.objects.filter(
                store=store,
                is_recovered=False,
                reminder_sent=False,
                updated_at__lte=cutoff,
            )

            for cart in carts:
                if cart.email:
                    try:
                        send_abandoned_cart_email(store, cart)
                        sent += 1
                    except Exception as e:
                        self.stderr.write(f"  [ERREUR EMAIL] Panier #{cart.pk} : {e}")
                        continue
                else:
                    # SMS : TBD — provider non défini (Sprint 6)
                    self.stdout.write(f"  [SMS TBD] Panier #{cart.pk} — {cart.phone}")
                    skipped += 1

                cart.reminder_sent = True
                cart.reminder_sent_at = now
                cart.save(update_fields=['reminder_sent', 'reminder_sent_at'])

        self.stdout.write(self.style.SUCCESS(
            f"Relances envoyées : {sent} email(s), {skipped} sans email (SMS TBD)."
        ))
