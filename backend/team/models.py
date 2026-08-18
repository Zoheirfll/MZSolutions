import secrets
from datetime import timedelta
from django.db import models
from django.conf import settings
from django.utils import timezone
from stores.models import Store

INVITE_VALIDITY = timedelta(hours=48)

# Fenêtre de grâce du heartbeat — au-delà, un confirmateur qui a coché
# "Disponible" mais dont l'onglet est fermé/le PC éteint (heartbeat arrêté
# sans qu'il ait pensé à repasser hors-ligne) est traité comme hors-ligne
# par le round-robin, sans action manuelle nécessaire.
ONLINE_HEARTBEAT_TIMEOUT = timedelta(minutes=3)


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

    # Présence en ligne — toggle manuel ("Disponible"/"Indisponible") combiné
    # à un heartbeat périodique du frontend (last_seen_at). Sert uniquement à
    # décider qui reçoit une nouvelle commande en round-robin ; n'affecte pas
    # is_active (compte désactivé/activé par le vendeur).
    is_online    = models.BooleanField(default=False)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.invite_token:
            self.invite_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    @property
    def invite_expired(self):
        """L'email d'invitation annonce "48h" mais rien ne le vérifiait avant
        cette passe — un lien resterait valide indéfiniment."""
        return self.user_id is None and timezone.now() > self.invited_at + INVITE_VALIDITY

    @property
    def is_currently_online(self):
        """Vrai statut "en ligne" utilisé par le round-robin : le toggle
        manuel doit être actif ET un heartbeat doit être arrivé récemment."""
        if not self.is_online or not self.last_seen_at:
            return False
        return timezone.now() - self.last_seen_at <= ONLINE_HEARTBEAT_TIMEOUT

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.role}) — {self.store.name}"


# Catalogue fixe de permissions (Epic 7.5) — contrôle par rôle, pas par membre
# individuel (décision produit : plus simple à gérer, correspond à "chaque
# rôle a son layout"). N'affecte que la visibilité/lecture ; les actions
# d'écriture (créer/modifier/supprimer) restent réservées owner/admin comme
# avant (core.permissions.is_owner_or_admin), inchangé par ce système.
## Catalogue granulaire — une permission par page dashboard (2026-08, sur
## demande explicite : "chaque page devait avoir son propre permission mais
## qui appartient à une catégorie qu'on peut tout sélectionner"). Remplace
## l'ancien catalogue à 17-20 entrées groupant plusieurs pages sous un même
## toggle (ex: `orders_manage` couvrait Nouvelle commande + Programmées +
## Taux de confirmation + Paniers abandonnés + Annulations + Raisons d'échec
## d'un coup — désormais chacune a sa propre clé). `orders_manage` reste seul
## exception : ce n'est pas une page mais une CAPACITÉ d'écriture (créer/
## modifier une commande), déjà utilisée ailleurs dans le code (voir
## `OrderDetailView.put`, `OrderListCreateView.post`) — la retirer casserait
## la création/modification de commande par un confirmateur/dropshipper.
PERMISSION_CATALOG = [
    ('dashboard_view',            'Tableau de bord'),
    ('inbox_view',                'Boîte de réception'),
    ('orders_view',                'Toutes les commandes'),
    ('orders_manage',              "Gérer les commandes (créer/modifier — capacité d'écriture, pas juste une page)"),
    ('orders_create_view',         'Nouvelle commande'),
    ('orders_scheduled_view',      'Commandes programmées'),
    ('confirmation_rate_view',     'Taux de confirmation'),
    ('abandoned_carts_view',       'Paniers abandonnés'),
    ('cancellation_requests_view', "Demande d'annulation"),
    ('cancellation_confirmed_view', 'Annulation confirmée'),
    ('dispatch_confirmateur_view', 'Dispatch — par confirmateur'),
    ('dispatch_carrier_view',      'Dispatch — par société de livraison'),
    ('dispatch_wilaya_view',       'Dispatch — par wilaya'),
    ('failure_reasons_view',       'Gestion des échecs'),
    ('exchanges_view',             'Gestion échanges'),
    ('products_view',              'Produits (liste, ajout, modification)'),
    ('categories_view',            'Catégories'),
    ('suppliers_view',             'Fournisseur (liste)'),
    ('supplier_credits_view',      'Crédit Fournisseur'),
    ('supplier_payments_view',     'Versement fournisseur'),
    ('purchase_prices_view',       "Prix d'achat / coûts (cost_price)"),
    ('reviews_view',               'Avis'),
    ('coupons_view',               'Coupons'),
    ('auto_promotions_view',       'Réductions automatiques'),
    ('clients_view',               'Clients'),
    ('clients_risk_view',          'Clients à risque'),
    ('blacklist_view',             'Liste noire'),
    ('dropshipping_view',          'Dropshipping (vue vendeur — liste des dropshippers, soldes)'),
    ('channels_view',              'Canaux de vente (Shopify, Google Sheets, Meta Commerce)'),
    ('marketing_view',             'Marketing (pixels)'),
    ('webhooks_view',              'Webhooks'),
    ('profitability_view',         'Rentabilité'),
    ('costs_view',                 'Coûts'),
    ('payments_ready_view',        'Paiement prêt'),
    ('payments_collected_view',    'Paiement récupéré'),
    ('payments_import_view',       'Importer un fichier Excel (paiements)'),
    ('shipments_view',             'Expéditions'),
    ('labels_view',                'Étiquettes'),
    ('prepared_orders_view',       'Commandes préparées'),
    ('predictive_returns_view',    'Retour prédictif'),
    ('return_validation_view',     'Validation des retours'),
    ('stock_view',                 'Stock & Inventaire'),
    ('stock_movements_view',       'Mouvement des stocks'),
    ('stock_return_view',          'Retour au vendeur'),
    ('shipping_settings_view',     'Paramètres livraison (comptes transporteurs, tarifs)'),
    ('stats_global_view',          'Statistiques globales'),
    ('stats_orders_view',          'Statistiques commandes'),
    ('stats_returns_view',         'Statistique retours'),
    ('stats_failures_view',        'Statistique des échecs'),
    ('stats_stock_sales_view',     'Statistique vente de stock'),
    ('stats_products_view',        'Statistiques des produits'),
    ('stats_confirmateurs_view',   'Statistique par confirmateur'),
    ('stats_wilayas_view',         'Statistiques par wilaya'),
    ('stats_sources_view',         'Statistiques des sources'),
    ('store_view',                 'Ma boutique'),
    ('store_theme_view',           'Thème & Apparence'),
    ('store_pages_view',           'Pages (boutique)'),
    ('store_menu_view',            'Menu (boutique)'),
    ('store_files_view',           'Fichiers (boutique)'),
    ('team_view',                  "Équipe"),
    ('audit_view',                 "Journal d'audit"),
    ('subscription_view',          'Abonnement'),
]

# Regroupement des permissions par catégorie/sous-catégorie — purement
# présentationnel (la matrice à plat ci-dessus reste la source de vérité
# pour has_permission()), sert à structurer PermissionsPage.jsx en accordéon
# avec un toggle "tout sélectionner" par catégorie plutôt qu'un tableau à
# ~60 lignes illisible d'un coup.
PERMISSION_CATEGORIES = {
    'dashboard_view':              ('Tableau de bord', 'Tableau de bord'),
    'inbox_view':                   ('Boîte de réception', 'Boîte de réception'),
    'orders_view':                  ('Commandes', 'Consultation'),
    'orders_manage':                ('Commandes', 'Consultation'),
    'orders_create_view':           ('Commandes', 'Gestion'),
    'orders_scheduled_view':        ('Commandes', 'Gestion'),
    'confirmation_rate_view':       ('Commandes', 'Gestion'),
    'abandoned_carts_view':         ('Commandes', 'Gestion'),
    'cancellation_requests_view':   ('Commandes', 'Gestion'),
    'cancellation_confirmed_view':  ('Commandes', 'Gestion'),
    'dispatch_confirmateur_view':   ('Commandes', 'Dispatch automatique'),
    'dispatch_carrier_view':        ('Commandes', 'Dispatch automatique'),
    'dispatch_wilaya_view':         ('Commandes', 'Dispatch automatique'),
    'failure_reasons_view':         ('Commandes', 'Suivi'),
    'exchanges_view':               ('Commandes', 'Suivi'),
    'products_view':                ('Catalogue', 'Produits & catégories'),
    'categories_view':              ('Catalogue', 'Produits & catégories'),
    'reviews_view':                 ('Catalogue', 'Produits & catégories'),
    'coupons_view':                 ('Catalogue', 'Produits & catégories'),
    'auto_promotions_view':         ('Catalogue', 'Produits & catégories'),
    'suppliers_view':               ('Catalogue', 'Achat & fournisseurs'),
    'supplier_credits_view':        ('Catalogue', 'Achat & fournisseurs'),
    'supplier_payments_view':       ('Catalogue', 'Achat & fournisseurs'),
    'purchase_prices_view':         ('Catalogue', 'Achat & fournisseurs'),
    'clients_view':                 ('Clients', 'Consultation'),
    'clients_risk_view':            ('Clients', 'Consultation'),
    'blacklist_view':               ('Clients', 'Consultation'),
    'shipments_view':               ('Logistique', 'Expéditions & retours'),
    'labels_view':                  ('Logistique', 'Expéditions & retours'),
    'prepared_orders_view':         ('Logistique', 'Expéditions & retours'),
    'predictive_returns_view':      ('Logistique', 'Expéditions & retours'),
    'return_validation_view':       ('Logistique', 'Expéditions & retours'),
    'stock_view':                   ('Logistique', 'Stock & inventaire'),
    'stock_movements_view':         ('Logistique', 'Stock & inventaire'),
    'stock_return_view':            ('Logistique', 'Stock & inventaire'),
    'shipping_settings_view':       ('Logistique', 'Paramètres livraison'),
    'store_view':                   ('Boutique & équipe', 'Boutique'),
    'store_theme_view':             ('Boutique & équipe', 'Boutique'),
    'store_pages_view':             ('Boutique & équipe', 'Boutique'),
    'store_menu_view':              ('Boutique & équipe', 'Boutique'),
    'store_files_view':             ('Boutique & équipe', 'Boutique'),
    'team_view':                    ('Boutique & équipe', 'Équipe'),
    'dropshipping_view':            ('Ventes & finances', 'Dropshipping'),
    'profitability_view':           ('Ventes & finances', 'Finances'),
    'costs_view':                   ('Ventes & finances', 'Finances'),
    'payments_ready_view':          ('Ventes & finances', 'Paiements'),
    'payments_collected_view':      ('Ventes & finances', 'Paiements'),
    'payments_import_view':         ('Ventes & finances', 'Paiements'),
    'stats_global_view':            ('Ventes & finances', 'Statistiques'),
    'stats_orders_view':            ('Ventes & finances', 'Statistiques'),
    'stats_returns_view':           ('Ventes & finances', 'Statistiques'),
    'stats_failures_view':          ('Ventes & finances', 'Statistiques'),
    'stats_stock_sales_view':       ('Ventes & finances', 'Statistiques'),
    'stats_products_view':          ('Ventes & finances', 'Statistiques'),
    'stats_confirmateurs_view':     ('Ventes & finances', 'Statistiques'),
    'stats_wilayas_view':           ('Ventes & finances', 'Statistiques'),
    'stats_sources_view':           ('Ventes & finances', 'Statistiques'),
    'channels_view':                ('Intégrations', 'Canaux de vente'),
    'marketing_view':               ('Intégrations', 'Marketing'),
    'webhooks_view':                ('Intégrations', 'Webhooks'),
    'audit_view':                   ('Administration', "Journal d'audit"),
    'subscription_view':            ('Administration', 'Abonnement'),
}

ROLES_WITH_PERMISSIONS = ['admin', 'confirmateur', 'dropshipper']

# Reflète le comportement effectif d'avant ce découpage (chaque nouvelle clé
# hérite de la valeur par défaut qu'avait la permission "bundle" dont elle
# est issue, pour ne rien changer silencieusement à une boutique déjà
# configurée) : `orders_manage` → toutes les pages Gestion/Dispatch/Suivi ;
# `products_view` → Catégories/Avis/Coupons/Réductions auto ;
# `purchase_prices_view` → Crédits/Versements fournisseurs ;
# `clients_view` → Clients à risque/Liste noire ; `finances_view` →
# Rentabilité/Coûts/Paiements ; `shipping_settings_view` → Expéditions/
# Étiquettes/Commandes préparées/Retour prédictif/Validation retours (le
# réglage "Paramètres livraison" lui-même garde sa propre clé, désormais
# distincte du suivi opérationnel) ; `stock_view` → Mouvements/Retour
# vendeur ; `store_view` → Thème/Pages/Menu/Fichiers ; `stats_view` → les 9
# pages de statistiques. `dispatch_*_view` et `dashboard_view` sont de
# vraies nouveautés : Dispatch reste désactivé par défaut même avec
# `orders_manage` accordé (US explicite : "le dispatch devrait être
# réservé à l'admin"), `dashboard_view` reflète l'ancienne condition
# `stats_view OU rôle=confirmateur` de la sidebar.
DEFAULT_PERMISSIONS = {
    'admin': {key: True for key, _ in PERMISSION_CATALOG},
    'confirmateur': {
        'dashboard_view': True, 'inbox_view': True,
        'orders_view': True, 'orders_manage': False,
        'orders_create_view': False, 'orders_scheduled_view': False,
        'confirmation_rate_view': False, 'abandoned_carts_view': False,
        'cancellation_requests_view': False, 'cancellation_confirmed_view': False,
        'dispatch_confirmateur_view': False, 'dispatch_carrier_view': False, 'dispatch_wilaya_view': False,
        'failure_reasons_view': False, 'exchanges_view': True,
        'products_view': False, 'categories_view': False, 'reviews_view': False,
        'coupons_view': False, 'auto_promotions_view': False,
        'suppliers_view': False, 'supplier_credits_view': False, 'supplier_payments_view': False,
        'purchase_prices_view': False,
        'clients_view': False, 'clients_risk_view': False, 'blacklist_view': False,
        'shipments_view': False, 'labels_view': False, 'prepared_orders_view': False,
        'predictive_returns_view': False, 'return_validation_view': False,
        'stock_view': False, 'stock_movements_view': False, 'stock_return_view': False,
        'shipping_settings_view': False,
        'store_view': False, 'store_theme_view': False, 'store_pages_view': False,
        'store_menu_view': False, 'store_files_view': False, 'team_view': False,
        'dropshipping_view': False,
        'profitability_view': False, 'costs_view': False,
        'payments_ready_view': False, 'payments_collected_view': False, 'payments_import_view': False,
        'stats_global_view': False, 'stats_orders_view': False, 'stats_returns_view': False,
        'stats_failures_view': False, 'stats_stock_sales_view': False, 'stats_products_view': False,
        'stats_confirmateurs_view': False, 'stats_wilayas_view': False, 'stats_sources_view': False,
        'channels_view': False, 'marketing_view': False, 'webhooks_view': False,
        'audit_view': False, 'subscription_view': False,
    },
    'dropshipper': {
        'dashboard_view': False, 'inbox_view': True,
        'orders_view': True, 'orders_manage': True,
        'orders_create_view': True, 'orders_scheduled_view': True,
        'confirmation_rate_view': True, 'abandoned_carts_view': True,
        'cancellation_requests_view': True, 'cancellation_confirmed_view': True,
        'dispatch_confirmateur_view': False, 'dispatch_carrier_view': False, 'dispatch_wilaya_view': False,
        'failure_reasons_view': True, 'exchanges_view': True,
        'products_view': True, 'categories_view': True, 'reviews_view': True,
        'coupons_view': True, 'auto_promotions_view': True,
        'suppliers_view': True, 'supplier_credits_view': False, 'supplier_payments_view': False,
        'purchase_prices_view': False,
        'clients_view': True, 'clients_risk_view': True, 'blacklist_view': True,
        'shipments_view': True, 'labels_view': True, 'prepared_orders_view': True,
        'predictive_returns_view': True, 'return_validation_view': True,
        'stock_view': True, 'stock_movements_view': True, 'stock_return_view': True,
        'shipping_settings_view': True,
        'store_view': True, 'store_theme_view': True, 'store_pages_view': True,
        'store_menu_view': True, 'store_files_view': True, 'team_view': False,
        'dropshipping_view': False,
        'profitability_view': False, 'costs_view': False,
        'payments_ready_view': False, 'payments_collected_view': False, 'payments_import_view': False,
        'stats_global_view': False, 'stats_orders_view': False, 'stats_returns_view': False,
        'stats_failures_view': False, 'stats_stock_sales_view': False, 'stats_products_view': False,
        'stats_confirmateurs_view': False, 'stats_wilayas_view': False, 'stats_sources_view': False,
        'channels_view': False, 'marketing_view': False, 'webhooks_view': False,
        'audit_view': False, 'subscription_view': False,
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


def online_confirmateurs_queryset(store):
    """Confirmateurs actifs ET actuellement en ligne (toggle + heartbeat
    récent) — source unique utilisée par tous les round-robin automatiques
    (commandes, réclamations, boîte de réception). Ne concerne jamais
    l'assignation manuelle par le vendeur, qui reste libre de choisir
    n'importe quel confirmateur actif."""
    return TeamMember.objects.filter(
        store=store,
        role='confirmateur',
        is_active=True,
        user__isnull=False,
        is_online=True,
        last_seen_at__gte=timezone.now() - ONLINE_HEARTBEAT_TIMEOUT,
    )


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
