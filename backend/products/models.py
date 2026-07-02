from django.db import models
from django.utils import timezone
from stores.models import Store


def _today():
    return timezone.now().date()


class Category(models.Model):
    store      = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='categories')
    name       = models.CharField(max_length=100)
    image      = models.ImageField(upload_to='categories/', blank=True, null=True)
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
    is_active          = models.BooleanField(default=True)
    created_at         = models.DateTimeField(auto_now_add=True)

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
        if variants.exists():
            return sum(opt.stock for v in variants for opt in v.options.all())
        return self.stock

    def __str__(self):
        return f"{self.name} — {self.store.name}"


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image   = models.ImageField(upload_to='products/')
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
    image              = models.ImageField(upload_to='variants/', null=True, blank=True)
    allow_out_of_stock = models.BooleanField(default=False)
    is_active          = models.BooleanField(default=True)
    order              = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.variant.name}: {self.value}"


class ProductReview(models.Model):
    product     = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reviews')
    first_name  = models.CharField(max_length=100)
    last_name   = models.CharField(max_length=100, blank=True)
    email       = models.EmailField(blank=True)
    rating      = models.PositiveSmallIntegerField()   # 1-5
    comment     = models.TextField(blank=True)
    image       = models.ImageField(upload_to='reviews/', null=True, blank=True)
    is_approved = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Avis {self.first_name} {self.last_name} — {self.product.name}"
