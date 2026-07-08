import secrets
from django.db import models
from django.conf import settings
from stores.models import Store


class TeamMember(models.Model):
    ROLES = [
        ('admin',        'Admin'),
        ('confirmateur', 'Confirmateur'),
        ('dropshipper',  'Dropshipper'),
    ]

    store        = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='team_members')
    user         = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='team_membership'
    )
    role         = models.CharField(max_length=20, choices=ROLES)
    first_name   = models.CharField(max_length=150)
    last_name    = models.CharField(max_length=150)
    email        = models.EmailField()
    phone        = models.CharField(max_length=20, blank=True)
    invite_token = models.CharField(max_length=64, unique=True, blank=True)
    is_active    = models.BooleanField(default=False)
    invited_at   = models.DateTimeField(auto_now_add=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    wilaya       = models.CharField(max_length=60, blank=True)
    commune      = models.CharField(max_length=60, blank=True)
    address      = models.TextField(blank=True)

    def save(self, *args, **kwargs):
        if not self.invite_token:
            self.invite_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.role}) — {self.store.name}"


# Catalogue fixe de permissions (Epic 7.5) — contrôle par rôle, pas par membre
# individuel (décision produit : plus simple à gérer, correspond à "chaque
# rôle a son layout"). N'affecte que la visibilité/lecture ; les actions
# d'écriture (créer/modifier/supprimer) restent réservées owner/admin comme
# avant (core.permissions.is_owner_or_admin), inchangé par ce système.
PERMISSION_CATALOG = [
    ('orders_view',            'Voir les commandes'),
    ('orders_manage',          "Gérer les commandes (nouvelle commande, annulations, statistiques)"),
    ('complaints_view',        'Voir les réclamations'),
    ('exchanges_view',         'Voir les échanges'),
    ('products_view',          'Voir les produits & catégories'),
    ('purchase_prices_view',   "Voir les prix d'achat / coûts (cost_price)"),
    ('clients_view',           'Voir les clients'),
    ('stock_view',             'Voir le stock & inventaire'),
    ('store_view',             'Voir Ma boutique (thème, pages, menu, fichiers)'),
    ('shipping_settings_view', 'Voir les paramètres de livraison'),
    ('dropshipping_view',      'Voir le dropshipping (vue vendeur — liste des dropshippers, soldes)'),
    ('finances_view',          'Voir les finances (coûts, rentabilité)'),
    ('team_view',               "Voir la gestion d'équipe"),
    ('stats_view',             'Voir les statistiques complètes'),
    ('channels_view',          'Voir les canaux de vente (Shopify, Google Sheets, Meta Commerce)'),
    ('marketing_view',         'Voir la configuration marketing (pixels)'),
    ('webhooks_view',          'Voir les webhooks'),
]

ROLES_WITH_PERMISSIONS = ['admin', 'confirmateur', 'dropshipper']

# Reflète le comportement précédent (avant Epic 7.5), codé en dur dans
# DashboardLayout.jsx — sert de valeur par défaut tant que le vendeur n'a
# rien personnalisé. purchase_prices_view est une nouveauté : caché par
# défaut pour confirmateur/dropshipper (donnée sensible jamais gatée avant).
DEFAULT_PERMISSIONS = {
    'admin': {key: True for key, _ in PERMISSION_CATALOG},
    'confirmateur': {
        'orders_view': True, 'orders_manage': False,
        'complaints_view': True, 'exchanges_view': True,
        'products_view': False, 'purchase_prices_view': False,
        'clients_view': False, 'stock_view': False, 'store_view': False,
        'shipping_settings_view': False, 'dropshipping_view': False,
        'finances_view': False, 'team_view': False, 'stats_view': False,
        'channels_view': False, 'marketing_view': False, 'webhooks_view': False,
    },
    'dropshipper': {
        'orders_view': True, 'orders_manage': True,
        'complaints_view': True, 'exchanges_view': True,
        'products_view': True, 'purchase_prices_view': False,
        'clients_view': True, 'stock_view': True, 'store_view': True,
        'shipping_settings_view': True, 'dropshipping_view': False,
        'finances_view': False, 'team_view': False, 'stats_view': False,
        'channels_view': False, 'marketing_view': False, 'webhooks_view': False,
    },
}


class RolePermission(models.Model):
    """Override d'une permission du catalogue pour un rôle donné, dans une
    boutique donnée. Seuls les overrides explicites sont stockés — pas de
    ligne = valeur par défaut de DEFAULT_PERMISSIONS."""
    store      = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='role_permissions')
    role       = models.CharField(max_length=20, choices=[(r, r) for r in ROLES_WITH_PERMISSIONS])
    permission = models.CharField(max_length=50)
    enabled    = models.BooleanField(default=True)

    class Meta:
        unique_together = [('store', 'role', 'permission')]

    def __str__(self):
        return f"{self.store_id} — {self.role} — {self.permission} = {self.enabled}"


class TeamMemberPermission(models.Model):
    """Override d'une permission du catalogue pour un membre précis — a
    priorité sur RolePermission (override de rôle) qui a lui-même priorité
    sur DEFAULT_PERMISSIONS (défaut du rôle). Seuls les overrides explicites
    sont stockés, même philosophie que RolePermission."""
    member     = models.ForeignKey(TeamMember, on_delete=models.CASCADE, related_name='permission_overrides')
    permission = models.CharField(max_length=50)
    enabled    = models.BooleanField(default=True)

    class Meta:
        unique_together = [('member', 'permission')]

    def __str__(self):
        return f"{self.member_id} — {self.permission} = {self.enabled}"


def get_effective_permissions(store, role, member=None):
    """Permissions effectives d'un rôle (et, si `member` est fourni, d'un
    membre précis) dans une boutique : override membre si présent, sinon
    override de rôle si présent, sinon valeur par défaut du rôle. `role=None`
    (owner) n'appelle jamais cette fonction — l'owner a un accès total géré
    séparément."""
    defaults = DEFAULT_PERMISSIONS.get(role, {})
    role_overrides = {
        p.permission: p.enabled
        for p in RolePermission.objects.filter(store=store, role=role)
    }
    member_overrides = {}
    if member is not None:
        member_overrides = {
            p.permission: p.enabled
            for p in TeamMemberPermission.objects.filter(member=member)
        }
    return {
        key: member_overrides.get(key, role_overrides.get(key, defaults.get(key, False)))
        for key, _ in PERMISSION_CATALOG
    }
