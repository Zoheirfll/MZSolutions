from django.db import models
from stores.models import Store

CATEGORY_CHOICES = [
    ('order',        'Commande'),
    ('complaint',     'Réclamation'),
    ('exchange',      'Échange'),
    ('cancellation',  'Annulation'),
    ('delivery',      'Livraison'),
    ('payment',       'Paiement'),
    ('stock',         'Stock'),
    ('webhook',       'Webhook'),
    ('review',        'Avis client'),
    ('quota',         'Quota / abonnement'),
    ('risk',          'Client à risque'),
]

LEVEL_CHOICES = [
    ('info',    'Info'),
    ('warning', 'Avertissement'),
    ('danger',  'Critique'),
]


class Notification(models.Model):
    """Boîte de réception unifiée (US demandée le 2026-08-12 : "boîte de
    réception, tout doit y arriver") — un seul endroit pour tout ce que le
    vendeur doit savoir : nouvelles commandes, réclamations, échanges,
    alertes de seuil (stock, taux de retour...), incidents techniques
    (webhook en pause). Générée soit au fil de l'eau depuis les vues
    existantes (`notify()`, best-effort — ne doit jamais faire échouer le
    flux métier), soit par la commande périodique `evaluate_alerts` pour les
    seuils. Volontairement PAS un système de messagerie multi-canaux
    (Messenger/WhatsApp) — cette piste a été analysée puis mise de côté, voir
    docs/superpowers/specs/2026-08-12-messagerie-unifiee-DIFFERE.md."""
    store          = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='notifications')
    category       = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    level          = models.CharField(max_length=10, choices=LEVEL_CHOICES, default='info')
    title          = models.CharField(max_length=200)
    body           = models.TextField(blank=True)
    link           = models.CharField(max_length=255, blank=True, help_text="Chemin relatif dans le dashboard, ex: /dashboard/commandes/56")
    permission     = models.CharField(max_length=50, blank=True, help_text="Clé du PERMISSION_CATALOG requise pour voir cette notification — vide = visible par toute l'équipe")
    target_member  = models.ForeignKey('team.TeamMember', null=True, blank=True, on_delete=models.CASCADE, related_name='notifications', help_text="Notification personnelle (ex: commande qui vient de m'être assignée) — prioritaire sur `permission`")
    dedupe_key     = models.CharField(max_length=100, blank=True, help_text="Empêche la commande evaluate_alerts de recréer la même alerte à chaque passage — vide pour les notifications d'événement (toujours uniques)")
    is_read        = models.BooleanField(default=False)
    read_at        = models.DateTimeField(null=True, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['store', 'dedupe_key'],
                condition=~models.Q(dedupe_key=''),
                name='unique_dedupe_key_per_store',
            )
        ]

    def __str__(self):
        return f"[{self.category}] {self.title} — {self.store.name}"
