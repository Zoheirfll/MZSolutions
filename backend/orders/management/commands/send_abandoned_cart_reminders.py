from django.core.management.base import BaseCommand
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from datetime import timedelta

from orders.models import AbandonedCart
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
                    self._send_email(store, cart)
                    sent += 1
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

    def _send_email(self, store, cart):
        items_lines = "\n".join(
            f"  - {item.get('product_name', '?')} x{item.get('quantity', 1)} — {item.get('price', 0):,.0f} DA"
            for item in (cart.items or [])
        )
        store_url = f"{settings.FRONTEND_URL}/store/{store.slug}"
        subject = f"Vous avez oublié des articles dans votre panier — {store.name}"
        message = (
            f"Bonjour {cart.first_name or 'client'},\n\n"
            f"Vous avez laissé des articles dans votre panier sur {store.name} :\n\n"
            f"{items_lines}\n\n"
            f"Total : {cart.total:,.0f} DA\n\n"
            f"Finalisez votre commande ici : {store_url}\n\n"
            f"— L'équipe {store.name}"
        )
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[cart.email],
                fail_silently=False,
            )
        except Exception as e:
            self.stderr.write(f"  [ERREUR EMAIL] Panier #{cart.pk} : {e}")
