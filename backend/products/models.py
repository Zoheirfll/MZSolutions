from django.db import models
from django.utils import timezone
from stores.models import Store
from core.validators import validate_image_extension, validate_image_size


def _today():
    return timezone.now().date()


class Category(models.Model):
    store      = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='categories')
    name       = models.CharField(max_length=100)
    image      = models.ImageField(upload_to='categories/', blank=True, null=True,
                                    validators=[validate_image_extension, validate_image_size])
    parent     = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children')
    is_active  = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} — {self.store.name}"


class Supplier(models.Model):
    store      = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='suppliers')
    first_name = models.CharField(max_length=150)
    last_name  = models.CharField(max_length=150)
    email      = models.EmailField(blank=True)
    phone      = models.CharField(max_length=20, blank=True)
    address    = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name} — {self.store.name}"


class SupplierCredit(models.Model):
    supplier   = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='credits')
    amount     = models.DecimalField(max_digits=12, decimal_places=2)
    note       = models.TextField(blank=True)
    date       = models.DateField(default=_today)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Crédit {self.amount} DZD — {self.supplier}"


class SupplierPayment(models.Model):
    supplier   = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='payments')
    amount     = models.DecimalField(max_digits=12, decimal_places=2)
    note       = models.TextField(blank=True)
    date       = models.DateField(default=_today)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Versement {self.amount} DZD — {self.supplier}"


class Product(models.Model):
    store              = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='products')
    name               = models.CharField(max_length=200)
    description        = models.TextField(blank=True)
    price              = models.DecimalField(max_digits=10, decimal_places=2)
    compare_price      = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cost_price         = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stock              = models.PositiveIntegerField(default=0)
    sku                = models.CharField(max_length=100, blank=True)
    weight             = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    categories         = models.ManyToManyField(Category, blank=True, related_name='products')
    supplier           = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    free_shipping      = models.BooleanField(default=False)
    allow_out_of_stock = models.BooleanField(default=False)
    drop_shipping      = models.BooleanField(default=False)
    # Offre quantité (2026-08) — ex: 2 unités facturées 2500 DA au lieu de 2×1500
    offer_enabled  = models.BooleanField(default=False)
    offer_quantity = models.PositiveIntegerField(null=True, blank=True, help_text="Nombre d'unités du palier (ex: 2)")
    offer_price    = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Prix total facturé pour ce palier de quantité")
    # Prix de livraison spécifique (2026-08) — écrase la grille wilaya/commune
    # et le tarif transporteur en temps réel pour toute commande contenant ce produit
    specific_shipping_enabled    = models.BooleanField(default=False)
    specific_shipping_home_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    specific_shipping_desk_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Dropshipping (2026-08) — remplace le calcul %/fixe de dropshipping.Commission
    # pour les produits où ces deux champs sont renseignés : le dropshipper choisit
    # son propre prix de vente (>= minimum_selling_price) à la commande manuelle,
    # sa marge = prix de vente choisi − dropshipping_price.
    dropshipping_price    = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Prix « coûtant » facturé au dropshipper — sa marge = prix de vente qu'il choisit moins ce prix")
    minimum_selling_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Prix plancher que le dropshipper doit respecter en revendant ce produit")
    is_active          = models.BooleanField(default=True)
    meta_title         = models.CharField(max_length=70, blank=True, help_text="Balise <title> de la fiche produit publique — retombe sur le nom du produit si vide")
    meta_description   = models.CharField(max_length=160, blank=True, help_text="Balise <meta name=\"description\"> — retombe sur un extrait de la description si vide")
    meta_keywords      = models.CharField(max_length=255, blank=True, help_text="Mots-clés séparés par des virgules")
    meta_robots        = models.CharField(max_length=20, blank=True, choices=[
        ('index,follow', 'Indexer, suivre les liens (défaut)'),
        ('noindex,follow', 'Ne pas indexer, suivre les liens'),
        ('index,nofollow', 'Indexer, ne pas suivre les liens'),
        ('noindex,nofollow', 'Ne pas indexer, ne pas suivre les liens'),
    ], help_text="Balise <meta name=\"robots\"> — vide = index,follow (comportement par défaut)")
    og_image           = models.ImageField(upload_to='products/seo/', null=True, blank=True,
                                            validators=[validate_image_extension, validate_image_size],
                                            help_text="Image de partage Facebook/WhatsApp (Open Graph) — retombe sur la 1ère image du produit si vide")
    twitter_image      = models.ImageField(upload_to='products/seo/', null=True, blank=True,
                                            validators=[validate_image_extension, validate_image_size],
                                            help_text="Image de la carte Twitter — retombe sur og_image puis la 1ère image du produit si vide")
    # Onglet "Autres" (2026-08, aligné sur RiseCart)
    # Alerte de stock à 3 paliers — surcharge StoreSettings.low_stock_threshold
    # (global) pour CE produit précis si renseignés (ex: seuil "faible" à 10,
    # "très faible" à 5, "critique" à 3).
    stock_alert_1 = models.PositiveIntegerField(null=True, blank=True, help_text="Seuil d'alerte stock faible (remplace le seuil global de la boutique pour ce produit)")
    stock_alert_2 = models.PositiveIntegerField(null=True, blank=True, help_text="Seuil d'alerte stock très faible")
    stock_alert_3 = models.PositiveIntegerField(null=True, blank=True, help_text="Seuil d'alerte stock critique")
    # Position d'entrepôt — purement informatif (organisation interne), aucun
    # effet sur le stock/la vente.
    has_position   = models.BooleanField(default=False)
    position_range = models.CharField(max_length=50, blank=True, help_text="Ex: allée/rayon")
    position_stage = models.CharField(max_length=50, blank=True, help_text="Ex: étage/niveau")
    position_slot  = models.CharField(max_length=50, blank=True, help_text="Ex: emplacement précis")
    # Visibilité sur la boutique publique
    show_title             = models.BooleanField(default=True)
    show_images             = models.BooleanField(default=True)
    show_full_price         = models.BooleanField(default=True, help_text="Afficher le prix hors remise (barré) quand une réduction s'applique")
    show_discounted_price   = models.BooleanField(default=True, help_text="Afficher le prix réduit — si désactivé avec show_full_price actif, seul le prix plein est visible")
    show_countdown          = models.BooleanField(default=False, help_text="Affiche un compte à rebours jusqu'à countdown_end sur la fiche produit publique")
    countdown_end           = models.DateTimeField(null=True, blank=True)
    created_at         = models.DateTimeField(auto_now_add=True)

    @property
    def effective_stock_alerts(self):
        """(seuil_faible, seuil_tres_faible, seuil_critique) — retombe sur
        StoreSettings.low_stock_threshold (unique) pour les paliers non
        renseignés sur ce produit précis."""
        try:
            default = self.store.settings.low_stock_threshold
        except Exception:
            default = 5
        return (
            self.stock_alert_1 if self.stock_alert_1 is not None else default,
            self.stock_alert_2,
            self.stock_alert_3,
        )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['store', 'sku'],
                condition=models.Q(sku__gt=''),
                name='unique_sku_per_store'
            )
        ]

    @property
    def total_stock(self):
        variants = self.variants.all()
        if not variants.exists():
            return self.stock
        total = 0
        for v in variants:
            for opt in v.options.all():
                sub_options = list(opt.sub_options.all())
                total += sum(s.stock for s in sub_options) if sub_options else opt.stock
        return total

    def active_auto_promotion(self):
        """Première offre automatique valide ciblant ce produit (directement ou via une de ses catégories)."""
        category_ids = list(self.categories.values_list('id', flat=True))
        promos = self.store.promotions.filter(kind='auto', is_active=True).filter(
            models.Q(products=self) | models.Q(categories__in=category_ids)
        ).distinct()
        for promo in promos:
            if promo.is_valid_now():
                return promo
        return None

    def __str__(self):
        return f"{self.name} — {self.store.name}"


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image   = models.ImageField(upload_to='products/', validators=[validate_image_extension, validate_image_size])
    order   = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order']


class ProductVariant(models.Model):
    product         = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='variants')
    name            = models.CharField(max_length=100)        # ex: "Couleur"
    sub_option_name = models.CharField(max_length=100, blank=True)  # ex: "Tailles"
    order           = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.name} — {self.product.name}"


class VariantOption(models.Model):
    variant            = models.ForeignKey(ProductVariant, on_delete=models.CASCADE, related_name='options')
    value              = models.CharField(max_length=100)      # ex: "Rouge"
    price              = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cost_price         = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stock              = models.PositiveIntegerField(default=0)
    sku                = models.CharField(max_length=100, blank=True)
    image              = models.ImageField(upload_to='variants/', null=True, blank=True,
                                            validators=[validate_image_extension, validate_image_size])
    allow_out_of_stock = models.BooleanField(default=False)
    is_active          = models.BooleanField(default=True)
    order              = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.variant.name}: {self.value}"


class VariantSubOption(models.Model):
    """Second niveau de variante — ex: l'option "Noir" (VariantOption) d'une
    variante "Couleur" (ProductVariant.sub_option_name = "Taille") a ses
    propres sous-options 41/42/43, chacune avec son propre stock/prix.
    `ProductVariant.sub_option_name` existait déjà pour nommer ce 2e niveau
    mais restait purement décoratif jusqu'ici — aucun modèle ne le portait."""
    option              = models.ForeignKey(VariantOption, on_delete=models.CASCADE, related_name='sub_options')
    value               = models.CharField(max_length=100)     # ex: "41"
    price               = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cost_price          = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stock               = models.PositiveIntegerField(default=0)
    sku                 = models.CharField(max_length=100, blank=True)
    dropshipping_price    = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    minimum_selling_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    allow_out_of_stock  = models.BooleanField(default=False)
    is_active           = models.BooleanField(default=True)
    order               = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.option}: {self.value}"


class ProductReview(models.Model):
    product     = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reviews')
    first_name  = models.CharField(max_length=100)
    last_name   = models.CharField(max_length=100, blank=True)
    email       = models.EmailField(blank=True)
    rating      = models.PositiveSmallIntegerField()   # 1-5
    comment     = models.TextField(blank=True)
    image       = models.ImageField(upload_to='reviews/', null=True, blank=True,
                                     validators=[validate_image_extension, validate_image_size])
    is_approved = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Avis {self.first_name} {self.last_name} — {self.product.name}"


class Promotion(models.Model):
    KIND_CHOICES = [('code', 'Code promo'), ('auto', 'Automatique')]
    DISCOUNT_TYPES = [('percentage', 'Pourcentage'), ('fixed', 'Montant fixe')]

    store          = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='promotions')
    name           = models.CharField(max_length=100)
    kind           = models.CharField(max_length=10, choices=KIND_CHOICES)
    code           = models.CharField(max_length=30, blank=True)  # requis si kind='code'
    discount_type  = models.CharField(max_length=10, choices=DISCOUNT_TYPES)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    starts_at      = models.DateTimeField(null=True, blank=True)
    ends_at        = models.DateTimeField(null=True, blank=True)
    max_uses       = models.PositiveIntegerField(null=True, blank=True)  # kind='code' uniquement
    uses_count     = models.PositiveIntegerField(default=0)
    is_active      = models.BooleanField(default=True)
    products       = models.ManyToManyField(Product, blank=True, related_name='promotions')
    categories     = models.ManyToManyField(Category, blank=True, related_name='promotions')
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['store', 'code'],
                condition=models.Q(kind='code'),
                name='unique_store_promo_code',
            )
        ]

    def is_valid_now(self):
        now = timezone.now()
        if not self.is_active:
            return False
        if self.starts_at and now < self.starts_at:
            return False
        if self.ends_at and now > self.ends_at:
            return False
        if self.kind == 'code' and self.max_uses is not None and self.uses_count >= self.max_uses:
            return False
        return True

    def compute_discount(self, base_amount):
        base_amount = max(base_amount, 0)
        if self.discount_type == 'percentage':
            discount = base_amount * self.discount_value / 100
        else:
            discount = self.discount_value
        return min(discount, base_amount)

    def compute_discount_for_items(self, items):
        """items : itérable de dicts {'product': id, 'price': ..., 'quantity': ...} (panier/lignes de commande).
        Si des produits/catégories ciblent la promo, seuls les articles éligibles comptent dans la base de calcul —
        sinon la réduction s'applique au panier entier."""
        from decimal import Decimal
        promo_product_ids  = set(self.products.values_list('id', flat=True))
        promo_category_ids = set(self.categories.values_list('id', flat=True))
        scoped = bool(promo_product_ids or promo_category_ids)

        if scoped:
            item_product_ids = [i.get('product') for i in items if i.get('product')]
            product_categories = {}
            for pid, cid in Product.objects.filter(id__in=item_product_ids).values_list('id', 'categories__id'):
                product_categories.setdefault(pid, set()).add(cid)

            def _eligible(i):
                pid = i.get('product')
                if pid in promo_product_ids:
                    return True
                return bool(product_categories.get(pid, set()) & promo_category_ids)

            base_amount = sum(
                Decimal(str(i.get('price', 0))) * int(i.get('quantity', 1)) for i in items if _eligible(i)
            )
        else:
            base_amount = sum(Decimal(str(i.get('price', 0))) * int(i.get('quantity', 1)) for i in items)
        return self.compute_discount(base_amount)

    def __str__(self):
        return f"{self.name} — {self.store.name}"


STOCK_MOVEMENT_REASONS = [
    ('exchange_return', 'Retour échange'), ('exchange_issue', 'Sortie échange'),
    ('order_sale', 'Vente (commande)'), ('manual_adjustment', 'Ajustement manuel'),
    ('order_return', 'Retour commande'), ('order_cancelled', 'Annulation commande'),
]


class StockMovement(models.Model):
    store          = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='stock_movements')
    product        = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='stock_movements')
    variant_option = models.ForeignKey(VariantOption, null=True, blank=True, on_delete=models.SET_NULL, related_name='stock_movements')
    variant_sub_option = models.ForeignKey(VariantSubOption, null=True, blank=True, on_delete=models.SET_NULL, related_name='stock_movements')
    quantity       = models.IntegerField()  # signé : positif = entrée, négatif = sortie
    stock_before   = models.IntegerField(null=True, blank=True, help_text="Stock juste avant ce mouvement — null pour l'historique antérieur au chantier 2026-08 (aucun instantané passé disponible)")
    stock_after    = models.IntegerField(null=True, blank=True)
    reason         = models.CharField(max_length=30, choices=STOCK_MOVEMENT_REASONS)
    note           = models.CharField(max_length=200, blank=True)
    batch_id       = models.UUIDField(null=True, blank=True, db_index=True, help_text="Regroupe les mouvements créés par une même sauvegarde produit (plusieurs variantes modifiées en une fois) — voir StockMovementListView, qui les affiche comme une seule ligne avec détail dépliable")
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_reason_display()} {self.quantity:+d} — {self.product.name}"
