"""Point d'entrée unique pour créer une notification — même contrat que
`orders/views.py::_fire_order_webhook` : best-effort, ne doit JAMAIS faire
échouer le flux métier qui l'appelle (création de commande, changement de
statut...)."""
from .models import Notification


def notify(store, category, title, body='', link='', level='info',
           permission='', target_member=None, dedupe_key=''):
    try:
        if dedupe_key:
            obj, created = Notification.objects.get_or_create(
                store=store, dedupe_key=dedupe_key,
                defaults=dict(
                    category=category, level=level, title=title, body=body,
                    link=link, permission=permission, target_member=target_member,
                ),
            )
            return obj if created else None
        return Notification.objects.create(
            store=store, category=category, level=level, title=title, body=body,
            link=link, permission=permission, target_member=target_member,
        )
    except Exception:
        return None
