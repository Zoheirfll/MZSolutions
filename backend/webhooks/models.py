import secrets
from django.db import models
from stores.models import Store

WEBHOOK_EVENT_CHOICES = [
    ('order.created',    'Nouvelle commande'),
    ('order.confirmed',  'Commande confirmée'),
    ('order.paid',       'Commande payée'),
    ('order.shipped',    'Commande expédiée'),
    ('order.delivered',  'Commande livrée'),
    ('order.cancelled',  'Commande annulée'),
    ('order.returned',   'Commande retournée'),
]

DIRECTION_CHOICES = [
    ('outbound', 'Sortant'),
    ('inbound',  'Entrant'),
]

LOG_STATUS_CHOICES = [
    ('success', 'Succès'),
    ('error',   'Erreur'),
]

MAX_CONSECUTIVE_FAILURES = 20


class WebhookEndpoint(models.Model):
    """Webhook sortant configuré par le vendeur (US-8.4.1) — notifie une URL
    externe (Zapier, Make, n8n, ERP maison...) à chaque événement choisi."""
    store       = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='webhook_endpoints')
    name        = models.CharField(max_length=100, blank=True)
    url         = models.URLField(max_length=500)
    events      = models.JSONField(default=list, help_text="Liste de clés WEBHOOK_EVENT_CHOICES — vide = tous les événements")
    secret      = models.CharField(max_length=64, blank=True)
    is_active   = models.BooleanField(default=True)
    consecutive_failures = models.PositiveIntegerField(default=0)
    last_triggered_at     = models.DateTimeField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.secret:
            self.secret = secrets.token_hex(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name or self.url} — {self.store.name}"


class WebhookLog(models.Model):
    """Journal des envois sortants et réceptions entrantes (AC US-8.4.1 :
    'Journal des envois avec statut de succès/échec') — immuable, jamais
    modifié/supprimé, même philosophie que ChannelSyncLog."""
    store       = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='webhook_logs')
    endpoint    = models.ForeignKey(WebhookEndpoint, null=True, blank=True, on_delete=models.SET_NULL, related_name='logs')
    direction   = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    event       = models.CharField(max_length=50, blank=True)
    payload     = models.JSONField(default=dict)
    status_code = models.PositiveIntegerField(null=True, blank=True)
    status      = models.CharField(max_length=10, choices=LOG_STATUS_CHOICES)
    message     = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_direction_display()} — {self.event or '—'} — {self.status}"


class IncomingWebhookKey(models.Model):
    """Clé secrète par boutique pour authentifier les webhooks entrants
    (US-8.4.2 AC) — un outil externe poste vers une URL contenant cette clé,
    même principe qu'un webhook entrant Slack/Stripe simplifié."""
    store      = models.OneToOneField(Store, on_delete=models.CASCADE, related_name='incoming_webhook_key')
    key        = models.CharField(max_length=64, unique=True, blank=True)
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.key:
            self.key = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Clé entrante — {self.store.name}"
