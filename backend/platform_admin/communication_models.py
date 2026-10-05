"""Modèles de communication de l'admin plateforme (phase 5). Importés par
platform_admin/models.py pour que Django les enregistre."""
from django.conf import settings
from django.db import models


class PlatformAnnouncement(models.Model):
    """Annonce de l'équipe MZSolutions affichée en bandeau dans le dashboard des
    vendeurs ciblés. **Texte brut uniquement** (jamais de HTML). La cible est
    évaluée à la lecture (état de la boutique au moment de l'affichage) : une
    boutique qui passe d'essai à abonnée cesse de voir une annonce « essai »."""
    AUDIENCE_CHOICES = [('all', 'Tous les vendeurs'), ('trial', 'En essai'), ('subscribed', 'Abonnés'), ('expired', 'Essai ou abonnement expiré')]
    LEVEL_CHOICES = [('info', 'Information'), ('warning', 'Avertissement')]

    title = models.CharField(max_length=120)
    body = models.TextField(max_length=1000)
    audience = models.CharField(max_length=12, choices=AUDIENCE_CHOICES, default='all')
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default='info')
    is_active = models.BooleanField(default=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    emailed_count = models.PositiveIntegerField(default=0)  # emails envoyés à la création (0 = aucun)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class ContactMessage(models.Model):
    """Message d'un vendeur à l'équipe MZSolutions (page « Contactez-nous »).
    Rattaché à sa boutique : l'admin sait toujours de qui il s'agit. Aucune adresse
    IP n'est conservée."""
    STATUS_CHOICES = [('new', 'Nouveau'), ('read', 'Lu'), ('handled', 'Traité')]

    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='contact_messages')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    subject = models.CharField(max_length=120)
    body = models.TextField(max_length=2000)
    status = models.CharField(max_length=8, choices=STATUS_CHOICES, default='new')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.subject} — {self.store_id}'
