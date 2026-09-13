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


# Override de permission par assignation (confirmateur × boutique précise) —
# réutilise VOLONTAIREMENT les mêmes clés que team.PERMISSION_CATALOG plutôt
# qu'un catalogue dédié : un confirmateur du superadmin en mode "Gérer cette
# boutique" (impersonation, voir core.permissions) utilise le vrai dashboard
# boutique, exactement comme un confirmateur interne — mêmes pages, mêmes
# vérifications de permission déjà en place partout dans le code (orders_view,
# inbox_view, products_view, failure_reasons_view, clients_view,
# shipping_settings_view, etc.). Contrairement à team.DEFAULT_PERMISSIONS
# (confirmateur interne, quelques permissions vraies par défaut), TOUT est
# désactivé par défaut ici — c'est un intervenant externe, le superadmin
# accorde explicitement boutique par boutique.
class PlatformAssignmentPermission(models.Model):
    """Seuls les overrides explicites sont stockés — mêmes principes que
    team.TeamMemberPermission."""
    assignment = models.ForeignKey('PlatformConfirmateurAssignment', on_delete=models.CASCADE, related_name='permission_overrides')
    permission = models.CharField(max_length=50)
    enabled    = models.BooleanField(default=True)

    class Meta:
        unique_together = [('assignment', 'permission')]

    def __str__(self):
        return f"{self.assignment_id} — {self.permission} = {self.enabled}"


def get_effective_platform_permissions(assignment):
    """Permissions effectives d'une assignation, sur le catalogue team.PERMISSION_CATALOG
    — défaut strict à False partout (voir note ci-dessus), jamais team.DEFAULT_PERMISSIONS."""
    from team.models import PERMISSION_CATALOG
    overrides = {p.permission: p.enabled for p in assignment.permission_overrides.all()}
    return {key: overrides.get(key, False) for key, _ in PERMISSION_CATALOG}


class PlatformOrderAssignment(models.Model):
    """Confirmateur du superadmin responsable d'UNE commande — distinct de
    orders.OrderAssignment (confirmateur interne de la boutique) : les deux
    peuvent coexister sur une même commande en mode 'augment', mais jamais
    en mode 'replace' (le round-robin interne n'est alors jamais déclenché,
    voir platform_admin.routing.route_order)."""
    order        = models.OneToOneField('orders.Order', on_delete=models.CASCADE, related_name='platform_assignment')
    confirmateur = models.ForeignKey(PlatformConfirmateur, on_delete=models.CASCADE, related_name='order_assignments')
    assigned_at  = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Commande #{self.order_id} → {self.confirmateur}"
