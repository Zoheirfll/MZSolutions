import uuid
from django.db import models
from django.conf import settings
from stores.models import Store
from orders.models import Order
from core.validators import validate_image_extension, validate_image_size

CHANNEL_CHOICES = [
    ('complaint',  'Réclamation'),
    ('exchange',   'Échange'),
    ('messenger',  'Messenger'),
    ('whatsapp',   'WhatsApp'),
    ('instagram',  'Instagram'),
]

CONVERSATION_STATUS_CHOICES = [
    ('open', 'Ouverte'), ('in_progress', 'En cours'), ('resolved', 'Résolue'),
]


def conversation_attachment_path(instance, filename):
    # Nom aléatoire (pas le nom original) — évite qu'une pièce jointe
    # (potentiellement sensible) soit accessible via une URL devinable,
    # même politique que orders.models.complaint_attachment_path avant fusion.
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    name = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex
    return f"inbox/{name}"


class Conversation(models.Model):
    """Boîte de réception unifiée (US demandée le 2026-08-12 : "boîte de
    réception, tout doit y arriver") — remplace orders.Complaint (fusionné
    par migration de données, voir 0002_migrate_complaints). Chaque canal
    externe (Messenger/WhatsApp/Instagram) est un simple adaptateur au-dessus
    de ce même modèle, comme orders/carriers/ ou channels/clients/ — le canal
    n'est qu'un CharField, pas une architecture séparée par canal."""
    store        = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='conversations')
    channel      = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    order        = models.ForeignKey(Order, null=True, blank=True, on_delete=models.CASCADE, related_name='conversations')
    subject      = models.CharField(max_length=200, blank=True)
    status       = models.CharField(max_length=20, choices=CONVERSATION_STATUS_CHOICES, default='open')

    customer_name  = models.CharField(max_length=200, blank=True)
    customer_phone = models.CharField(max_length=30, blank=True)
    external_user_id = models.CharField(max_length=100, blank=True, help_text="Identifiant du client côté canal externe (PSID Messenger, numéro WhatsApp...)")
    external_id       = models.CharField(max_length=100, blank=True, help_text="Identifiant de la conversation côté canal externe")

    assigned_to  = models.ForeignKey('team.TeamMember', null=True, blank=True, on_delete=models.SET_NULL, related_name='assigned_conversations')
    assigned_at  = models.DateTimeField(null=True, blank=True)
    assigned_by  = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    last_message_at          = models.DateTimeField(null=True, blank=True)
    last_customer_message_at = models.DateTimeField(null=True, blank=True, help_text="Sert la fenêtre de 24h imposée par Meta pour Messenger/WhatsApp — pas encore appliqué tant que ces canaux ne sont pas branchés")
    unread_count = models.PositiveIntegerField(default=0)

    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-last_message_at', '-created_at']

    def __str__(self):
        return f"[{self.channel}] {self.subject or self.customer_name} — {self.store.name}"


class Message(models.Model):
    conversation  = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    direction     = models.CharField(max_length=10, choices=[('inbound', 'Entrant'), ('outbound', 'Sortant')])
    body          = models.TextField(blank=True)
    status_change = models.CharField(max_length=20, blank=True, help_text="Renseigné si ce message accompagne un changement de statut (repris de ComplaintMessage.status)")
    attachment    = models.ImageField(upload_to=conversation_attachment_path, null=True, blank=True,
                                       validators=[validate_image_extension, validate_image_size])
    author        = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, help_text="null = message du client")
    external_id   = models.CharField(max_length=100, blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Message conversation #{self.conversation_id}"
