from django.db import models
from django.utils import timezone

from stores.models import Store
from accounts.models import User


class AIConversation(models.Model):
    """Fil de discussion du chat libre — deux canaux distingués par `user`
    XOR `session_id` (jamais les deux, jamais aucun des deux, voir la
    CheckConstraint) : `user` pour l'Assistant vendeur (dashboard,
    authentifié), `session_id` pour le chatbot boutique publique (visiteur
    anonyme, identifiant généré côté client comme le scoping panier
    CartContext). Les 3 autres capacités IA (génération produit, suggestion
    Inbox, résumé dashboard) sont sans état, aucune n'utilise ce modèle."""
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='ai_conversations')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ai_conversations', null=True, blank=True)
    session_id = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    title = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        constraints = [
            models.CheckConstraint(
                check=(
                    (models.Q(user__isnull=False) & models.Q(session_id__isnull=True)) |
                    (models.Q(user__isnull=True) & models.Q(session_id__isnull=False))
                ),
                name='ai_conversation_user_xor_session',
            ),
        ]

    def __str__(self):
        return self.title or f"Conversation #{self.pk}"


class AIPendingAction(models.Model):
    """Proposition d'écriture émise par l'IA — jamais exécutée directement.
    `payload`/`target_ids` sont figés à la création et ne changent jamais,
    seul `status`/`resolved_at` évolue (même philosophie que StockMovement).
    Voir docs/superpowers/specs/2026-09-11-agent-ia-ecriture-design.md."""
    STATUS_CHOICES = [
        ('pending', 'pending'), ('confirmed', 'confirmed'),
        ('rejected', 'rejected'), ('expired', 'expired'),
    ]
    conversation = models.ForeignKey(AIConversation, on_delete=models.CASCADE, related_name='pending_actions')
    tool_name = models.CharField(max_length=60)
    summary = models.CharField(max_length=300)
    payload = models.JSONField(default=list)
    target_ids = models.JSONField(default=list)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    resolved_at = models.DateTimeField(null=True, blank=True)

    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return self.summary


class AIProductDraft(models.Model):
    """Résultat intermédiaire d'un scan (photo/facture) ou d'une création
    texte via le chat — jamais un Product créé directement, toujours validé
    par le vendeur (ProductFormPage pré-remplie, ou ProductDraftsPage pour
    un lot issu d'une facture)."""
    SOURCE_CHOICES = [('photo', 'photo'), ('invoice', 'invoice'), ('chat_text', 'chat_text')]
    STATUS_CHOICES = [('pending_review', 'pending_review'), ('created', 'created'), ('discarded', 'discarded')]
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='ai_product_drafts')
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES)
    source_image = models.ImageField(upload_to='ai_drafts/', null=True, blank=True)
    extracted_data = models.JSONField(default=dict)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending_review')
    created_product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.extracted_data.get('name', f'Brouillon #{self.pk}')


class AIMessage(models.Model):
    ROLE_CHOICES = [('user', 'user'), ('assistant', 'assistant'), ('tool', 'tool')]

    conversation = models.ForeignKey(AIConversation, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    pending_action = models.ForeignKey(AIPendingAction, on_delete=models.SET_NULL, null=True, blank=True, related_name='messages')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
