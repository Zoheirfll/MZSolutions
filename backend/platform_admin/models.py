import secrets
from datetime import timedelta
from django.conf import settings
from django.db import models
from django.utils import timezone

from stores.models import Store

INVITE_VALIDITY = timedelta(hours=48)

MODE_CHOICES = [
    ('replace', "Remplace les confirmateurs internes de la boutique"),
    ('augment', "Coexiste avec les confirmateurs internes de la boutique"),
]


class PlatformConfirmationAccount(models.Model):
    """Service de confirmation payant activé par le superadmin (pas par le
    vendeur — décision produit explicite) pour une boutique MZSolutions
    existante. `is_active=False` = boutique non gérée par le service, invisible
    du reste de l'espace superadmin (commandes/produits, assignations)."""
    store        = models.OneToOneField(Store, on_delete=models.CASCADE, related_name='platform_confirmation_account')
    is_active    = models.BooleanField(default=False)
    mode         = models.CharField(max_length=10, choices=MODE_CHOICES, default='replace')
    note         = models.TextField(blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.store.name} — {'actif' if self.is_active else 'inactif'} ({self.mode})"


class PlatformConfirmateur(models.Model):
    """Confirmateur employé par le superadmin (pas par une boutique précise,
    contrairement à team.TeamMember) — assigné à une ou plusieurs boutiques via
    PlatformConfirmateurAssignment. Même flux d'invitation par email/token que
    team.TeamMember (compte User créé à l'acceptation)."""
    user         = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='platform_confirmateur_profile'
    )
    first_name   = models.CharField(max_length=150)
    last_name    = models.CharField(max_length=150)
    email        = models.EmailField()
    phone        = models.CharField(max_length=20, blank=True)
    invite_token = models.CharField(max_length=64, unique=True, blank=True)
    is_active    = models.BooleanField(default=True)
    invited_at   = models.DateTimeField(auto_now_add=True)
    activated_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.invite_token:
            self.invite_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    @property
    def invite_expired(self):
        return self.user_id is None and timezone.now() > self.invited_at + INVITE_VALIDITY

    def __str__(self):
        return f"{self.first_name} {self.last_name}"


class PlatformConfirmateurAssignment(models.Model):
    """Un confirmateur du superadmin reçoit les commandes d'UNE boutique
    inscrite au service, tant que ce toggle est actif — indépendant de
    PlatformConfirmateur.is_active (interrupteur global) et de
    PlatformConfirmationAccount.is_active (la boutique elle-même)."""
    confirmateur = models.ForeignKey(PlatformConfirmateur, on_delete=models.CASCADE, related_name='assignments')
    account      = models.ForeignKey(PlatformConfirmationAccount, on_delete=models.CASCADE, related_name='assignments')
    is_active    = models.BooleanField(default=True)
    assigned_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('confirmateur', 'account')]

    def __str__(self):
        return f"{self.confirmateur} → {self.account.store.name} ({'actif' if self.is_active else 'inactif'})"
