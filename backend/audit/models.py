from django.conf import settings
from django.db import models
from stores.models import Store


# Catalogue des actions journalisées — sert uniquement à peupler le filtre
# côté frontend (AuditPage.jsx), pas une contrainte stricte côté serveur
# (log_audit() accepte n'importe quelle clé, pour ne jamais bloquer un
# appelant qui voudrait journaliser une action pas encore cataloguée ici).
ACTION_CATALOG = [
    ('order.created',            'Commande créée'),
    ('order.updated',            'Commande modifiée (correction)'),
    ('order.deleted',            'Commande supprimée'),
    ('order.status_changed',     'Statut de commande changé'),
    ('order.assigned',           'Commande assignée à un confirmateur'),
    ('order.note_added',         'Note ajoutée à une commande'),
    ('order.carrier_assigned',   'Transporteur attribué à une commande'),
    ('order.cancellation_rejected', "Demande d'annulation rejetée"),
    ('order.label_printed',      'Étiquette marquée imprimée'),
    ('order.prepared',           'Commande(s) marquée(s) préparée(s)'),
    ('order.return_validated',   'Retour de commande validé'),
    ('order.shipment_retried',   "Expédition relancée"),
    ('order.tracking_synced',    'Suivi transporteur synchronisé manuellement'),
    ('abandoned_cart.reminded',  'Relance panier abandonné envoyée'),
    ('call_attempt.created',     "Tentative d'appel enregistrée"),
    ('call_attempt.deleted',     "Tentative d'appel supprimée"),
    ('failure_reason.created',   "Motif d'échec créé"),
    ('failure_reason.updated',   "Motif d'échec modifié"),
    ('failure_reason.deleted',   "Motif d'échec supprimé"),
    ('carrier_account.created',  'Compte transporteur connecté'),
    ('carrier_account.updated',  'Compte transporteur modifié'),
    ('carrier_account.deleted',  'Compte transporteur déconnecté'),
    ('wilaya_rate.updated',      'Tarif wilaya mis à jour'),
    ('wilaya_rate.deleted',      'Tarif wilaya supprimé'),
    ('wilaya_rate.synced',       'Grille tarifaire par wilaya synchronisée'),
    ('commune_rate.updated',     'Tarif commune mis à jour'),
    ('commune_rate.deleted',     'Tarif commune supprimé'),
    ('commune_rate.synced',      'Grille tarifaire par commune synchronisée'),
    ('dispatch_rule.created',    'Règle de dispatch créée'),
    ('dispatch_rule.updated',    'Règle de dispatch modifiée'),
    ('dispatch_rule.deleted',    'Règle de dispatch supprimée'),
    ('category.created',         'Catégorie créée'),
    ('category.updated',         'Catégorie modifiée'),
    ('category.trashed',         'Catégorie envoyée à la corbeille'),
    ('category.restored',        'Catégorie restaurée'),
    ('category.deleted',         'Catégorie supprimée définitivement'),
    ('product.created',          'Produit créé'),
    ('product.updated',          'Produit modifié'),
    ('product.deleted',          'Produit supprimé'),
    ('stock.manual_adjustment',  'Ajustement manuel de stock'),
    ('supplier.created',         'Fournisseur créé'),
    ('supplier.updated',         'Fournisseur modifié'),
    ('supplier.deleted',         'Fournisseur supprimé'),
    ('supplier_credit.created',  'Crédit fournisseur ajouté'),
    ('supplier_credit.deleted',  'Crédit fournisseur supprimé'),
    ('supplier_payment.created', 'Versement fournisseur ajouté'),
    ('supplier_payment.deleted', 'Versement fournisseur supprimé'),
    ('promotion.created',        'Promotion créée'),
    ('promotion.updated',        'Promotion modifiée'),
    ('promotion.deleted',        'Promotion supprimée'),
    ('review.moderated',         'Avis modéré (approuvé/rejeté)'),
    ('review.deleted',           'Avis supprimé'),
    ('store.updated',            'Boutique modifiée'),
    ('store_settings.updated',   'Paramètres généraux modifiés'),
    ('store_page.created',       'Page créée'),
    ('store_page.updated',       'Page modifiée'),
    ('store_page.deleted',       'Page supprimée'),
    ('pixel.created',            'Pixel marketing ajouté'),
    ('pixel.updated',            'Pixel marketing modifié'),
    ('pixel.deleted',            'Pixel marketing supprimé'),
    ('subscription.checkout_started', "Checkout d'abonnement démarré"),
    ('channel.connected',        'Canal de vente connecté'),
    ('channel.updated',          'Canal de vente modifié'),
    ('channel.disconnected',     'Canal de vente déconnecté'),
    ('channel.synced',           'Canal de vente synchronisé'),
    ('webhook_endpoint.created', 'Endpoint webhook créé'),
    ('webhook_endpoint.updated', 'Endpoint webhook modifié'),
    ('webhook_endpoint.deleted', 'Endpoint webhook supprimé'),
    ('webhook_incoming_key.rotated', 'Clé de webhook entrant régénérée'),
    ('cost.created',             'Coût ajouté'),
    ('cost.updated',             'Coût modifié'),
    ('cost.deleted',             'Coût supprimé'),
    ('payment.marked_collected', 'Paiement(s) COD pointé(s) comme reversé(s)'),
    ('payment.excel_imported',   'Import Excel de rapprochement paiements'),
    ('commission.configured',    'Commission dropshipper configurée'),
    ('commission.deleted',       'Commission dropshipper supprimée'),
    ('commission_payment.created', 'Solde dropshipper payé'),
    ('exchange.status_changed',  "Statut d'échange changé (approuvé/rejeté)"),
    ('conversation.status_changed', 'Statut de conversation changé (réclamation/échange/boîte de réception)'),
    ('conversation.message_sent',   'Message envoyé dans une conversation'),
    ('conversation.assigned',       'Conversation réassignée'),
    ('confirmateur.online',      'Confirmateur passé disponible'),
    ('confirmateur.offline',     'Confirmateur passé indisponible'),
    ('customer_risk.toggled',    'Flag de risque client basculé manuellement'),
    ('blacklist.added',          'Numéro ajouté à la liste noire'),
    ('blacklist.updated',        'Entrée de liste noire modifiée'),
    ('blacklist.removed',        'Numéro retiré de la liste noire'),
    ('team.member_invited',      'Membre invité'),
    ('team.member_updated',      'Membre modifié'),
    ('team.member_deactivated',  'Membre désactivé'),
    ('team.member_reactivated',  'Membre réactivé'),
    ('team.invite_resent',       "Invitation renvoyée"),
    ('team.permission_changed',  'Permission de rôle modifiée'),
    ('team.member_permission_changed', 'Permission individuelle modifiée'),
]


class AuditLog(models.Model):
    """Journal d'audit transversal — chaque action d'un membre d'équipe
    (admin/confirmateur/dropshipper) ou de l'owner qui modifie un état de la
    boutique. Immuable une fois créé (jamais modifié/supprimé), même
    philosophie que OrderStatusHistory/StockMovement. Volontairement générique
    (target_type/target_id en texte libre, pas de FK par type de cible) pour
    pouvoir journaliser n'importe quelle entité sans coupler cette app à
    orders/inbox/team/products."""
    store       = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='audit_logs')
    actor       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    actor_name  = models.CharField(max_length=200, blank=True)   # figé au moment de l'action (survit à la suppression du compte)
    actor_role  = models.CharField(max_length=20, blank=True)    # 'owner' | 'admin' | 'confirmateur' | 'dropshipper'
    action      = models.CharField(max_length=60)
    target_type = models.CharField(max_length=40, blank=True)    # ex: 'order', 'conversation', 'team_member'
    target_id   = models.IntegerField(null=True, blank=True)
    target_repr = models.CharField(max_length=200, blank=True)   # ex: "Commande #123"
    description = models.TextField(blank=True)                  # phrase lisible, ex: "Statut changé de En attente à Confirmée"
    metadata    = models.JSONField(default=dict, blank=True)     # détail structuré (avant/après, note, etc.)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['store', '-created_at']),
            models.Index(fields=['store', 'action']),
            models.Index(fields=['store', 'target_type', 'target_id']),
        ]

    def __str__(self):
        return f"{self.store_id} — {self.actor_name} — {self.action} — {self.created_at}"
