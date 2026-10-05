"""Contenu éditable du site (phase 12) : FAQ du dashboard et pages légales publiques.
Texte brut uniquement — jamais de HTML."""
from django.db import models


class FaqItem(models.Model):
    question = models.CharField(max_length=200)
    answer = models.TextField(max_length=3000)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'id']


class LegalPage(models.Model):
    """Page légale publique servie sur /legal/<slug>/. Sans ligne en base (ou vide),
    la page historique codée en dur est servie : rien ne disparaît."""
    SLUG_CHOICES = [('privacy-policy', 'Politique de confidentialité'), ('terms', 'Conditions d’utilisation')]

    slug = models.CharField(max_length=30, choices=SLUG_CHOICES, unique=True)
    title = models.CharField(max_length=150)
    body = models.TextField(max_length=30000)
    updated_at = models.DateTimeField(auto_now=True)
