from django.db import models
from stores.models import Store

CHANNEL_CHOICES = [
    ('shopify',       'Shopify'),
    ('google_sheets', 'Google Sheets'),
]

DIRECTION_CHOICES = [
    ('push', 'Push (MZSolutions → canal)'),
    ('pull', 'Pull (canal → MZSolutions)'),
]

SYNC_STATUS_CHOICES = [
    ('success', 'Succès'),
    ('error',   'Erreur'),
]


class ChannelConnection(models.Model):
    """Connexion d'une boutique à un canal de vente externe (Epic 8.2).
    Identifiants stockés tels quels — aucun appel réseau réel tant que les
    accès API (Shopify Partners, compte de service Google) ne sont pas
    obtenus, même situation que les transporteurs (orders/carriers/) avant
    leurs accès : architecture complète construite, client mocké en attendant."""
    store          = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='channel_connections')
    channel        = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    shop_url       = models.CharField(max_length=200, blank=True, help_text="Ex: monshop.myshopify.com, ou URL du Google Sheet")
    api_key        = models.CharField(max_length=200, blank=True)
    api_secret     = models.CharField(max_length=200, blank=True)
    is_active      = models.BooleanField(default=True)
    connected_at   = models.DateTimeField(auto_now_add=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [('store', 'channel')]
        ordering = ['channel']

    def __str__(self):
        return f"{self.get_channel_display()} — {self.store.name}"


class ChannelSyncLog(models.Model):
    """Journal de synchronisation (US-8.2.1 AC) — immuable, jamais modifié/
    supprimé, même philosophie que StockMovement/OrderStatusHistory."""
    store       = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='channel_sync_logs')
    connection  = models.ForeignKey(ChannelConnection, null=True, blank=True, on_delete=models.SET_NULL, related_name='logs')
    channel     = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    direction   = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    status      = models.CharField(max_length=10, choices=SYNC_STATUS_CHOICES)
    items_synced = models.PositiveIntegerField(default=0)
    message     = models.TextField(blank=True)
    started_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"{self.get_channel_display()} — {self.get_direction_display()} — {self.status}"
