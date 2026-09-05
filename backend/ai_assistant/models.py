from django.db import models

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


class AIMessage(models.Model):
    ROLE_CHOICES = [('user', 'user'), ('assistant', 'assistant'), ('tool', 'tool')]

    conversation = models.ForeignKey(AIConversation, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
