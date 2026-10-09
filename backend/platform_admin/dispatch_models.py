"""Modèles du dispatch des commandes du service de confirmation (voir
docs/superpowers/specs/2026-10-09-dispatch-confirmation-design.md).

`Order.status` n'est JAMAIS modifié par ce flux : l'état du dispatch (en attente
d'assignation, à traiter, échec) vit uniquement ici, visible de l'admin du service."""
from django.db import models

FLOW_STATES = [
    ('waiting', "En attente d'assignation"),
    ('assigned', 'Assignée'),
    ('failed', 'Échec'),
    ('done', 'Terminée'),
]

EVENT_KINDS = [
    ('created', 'Commande entrée dans le flux'),
    ('assigned', 'Assignée à un confirmateur'),
    ('attempt', "Résultat d'appel"),
    ('requeued', "Remise en attente d'assignation"),
    ('escalated', "Signalée à l'admin"),
    ('failed', 'Échec définitif'),
    ('done', 'Terminée'),
]

CALL_OUTCOMES = [
    ('no_answer', 'Ne répond pas'),
    ('unreachable', 'Injoignable'),
    ('busy', 'Occupé'),
    ('callback', 'Rappeler plus tard'),
]

ALGORITHM_KEYS = [
    'fifo', 'newest', 'overdue', 'persistence', 'longest_idle',
    'low_rate_stores', 'high_rate_stores', 'high_value', 'quick_wins', 'balanced',
]
ALGORITHM_CHOICES = [(k, k) for k in ALGORITHM_KEYS]

DEFAULT_WAIT_MINUTES = [30, 40, 50, 60]


def default_wait_minutes():
    return list(DEFAULT_WAIT_MINUTES)


class PlatformDispatchConfig(models.Model):
    """Réglage du dispatch. Portée : `store` (null = tout le site), `date` (null) et
    `weekday` 0-6 (null). Résolution la plus spécifique d'abord : boutique+date,
    boutique+jour, boutique, site+date, site+jour, site, puis valeurs par défaut."""
    store = models.ForeignKey('stores.Store', null=True, blank=True, on_delete=models.CASCADE, related_name='dispatch_configs')
    date = models.DateField(null=True, blank=True)
    weekday = models.PositiveSmallIntegerField(null=True, blank=True)
    algorithm = models.CharField(max_length=30, choices=ALGORITHM_CHOICES, default='fifo')
    wait_minutes = models.JSONField(default=default_wait_minutes)
    review_after = models.PositiveSmallIntegerField(default=4)
    fail_after_review = models.PositiveSmallIntegerField(default=4)
    max_open = models.PositiveSmallIntegerField(default=5)
    weights = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        scope = self.store.name if self.store_id else 'site'
        return f'{scope} — {self.algorithm}'


class PlatformOrderFlow(models.Model):
    order = models.OneToOneField('orders.Order', on_delete=models.CASCADE, related_name='platform_flow')
    state = models.CharField(max_length=10, choices=FLOW_STATES, default='waiting', db_index=True)
    confirmateur = models.ForeignKey('platform_admin.PlatformConfirmateur', null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='flows')
    attempts = models.PositiveSmallIntegerField(default=0)
    available_at = models.DateTimeField()
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    admin_flagged_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    done_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Commande #{self.order_id} — {self.state} ({self.attempts} appel(s))'


class PlatformOrderEvent(models.Model):
    flow = models.ForeignKey(PlatformOrderFlow, on_delete=models.CASCADE, related_name='events')
    kind = models.CharField(max_length=12, choices=EVENT_KINDS)
    confirmateur = models.ForeignKey('platform_admin.PlatformConfirmateur', null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='+')
    outcome = models.CharField(max_length=12, blank=True)
    note = models.CharField(max_length=300, blank=True)
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
