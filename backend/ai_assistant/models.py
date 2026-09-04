from django.db import models

from stores.models import Store
from accounts.models import User


class AIConversation(models.Model):
    """Fil de discussion du chat libre (capacité 4) — seule capacité IA avec
    un historique persisté ; les 3 autres (génération produit, suggestion
    Inbox, résumé dashboard) sont sans état."""
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='ai_conversations')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ai_conversations')
    title = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

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
