from decimal import Decimal
from django.db import models
from stores.models import Store
from products.models import Product
from team.models import TeamMember

COMMISSION_TYPE_CHOICES = [
    ('percentage', 'Pourcentage'),
    ('fixed',      'Montant fixe'),
]


class DropshipperProduct(models.Model):
    """Produit du catalogue du vendeur principal choisi par un dropshipper
    pour la revente. Le dropshipper ne gère pas de stock propre — c'est
    uniquement une sélection, le stock reste celui du produit du vendeur."""
    store       = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='dropshipper_products')
    dropshipper = models.ForeignKey(TeamMember, on_delete=models.CASCADE, related_name='selected_products')
    product     = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='dropshipper_selections')
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('dropshipper', 'product')]

    def __str__(self):
        return f"{self.dropshipper} → {self.product.name}"


class Commission(models.Model):
    """Commission configurée par le vendeur pour une combinaison produit × dropshipper."""
    store            = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='commissions')
    dropshipper      = models.ForeignKey(TeamMember, on_delete=models.CASCADE, related_name='commissions')
    product          = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='commissions')
    commission_type  = models.CharField(max_length=20, choices=COMMISSION_TYPE_CHOICES, default='percentage')
    value            = models.DecimalField(max_digits=10, decimal_places=2)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('dropshipper', 'product')]

    def __str__(self):
        return f"{self.dropshipper} × {self.product.name} — {self.value}{'%' if self.commission_type == 'percentage' else ' DA/u'}"

    def compute_amount(self, unit_price, quantity):
        """Montant de commission pour une ligne de commande.
        percentage : % du montant de la ligne (prix unitaire × quantité)
        fixed      : montant fixe par unité vendue"""
        if self.commission_type == 'percentage':
            return (Decimal(unit_price) * quantity * self.value / Decimal('100')).quantize(Decimal('0.01'))
        return (self.value * quantity).quantize(Decimal('0.01'))


class CommissionEntry(models.Model):
    """Commission calculée pour un article de commande livré — immuable,
    créée uniquement quand la commande passe au statut 'delivered', et
    supprimée si la commande repasse en 'returned'/'cancelled' (pour ne
    jamais rémunérer une commande annulée ou retournée)."""
    store       = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='commission_entries')
    dropshipper = models.ForeignKey(TeamMember, on_delete=models.CASCADE, related_name='commission_entries')
    order_item  = models.OneToOneField('orders.OrderItem', on_delete=models.CASCADE, related_name='commission_entry')
    product     = models.ForeignKey(Product, null=True, blank=True, on_delete=models.SET_NULL)
    amount      = models.DecimalField(max_digits=12, decimal_places=2)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"#{self.order_item.order_id} — {self.dropshipper} — {self.amount}"


class CommissionPayment(models.Model):
    """Paiement du solde de commission d'un dropshipper — remet son solde
    à zéro et historise le versement (jamais modifié/supprimé)."""
    store       = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='commission_payments')
    dropshipper = models.ForeignKey(TeamMember, on_delete=models.CASCADE, related_name='commission_payments')
    amount      = models.DecimalField(max_digits=12, decimal_places=2)
    note        = models.TextField(blank=True)
    paid_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-paid_at']

    def __str__(self):
        return f"{self.dropshipper} — {self.amount} ({self.paid_at:%Y-%m-%d})"
