from django.db import models
from stores.models import Store


class Product(models.Model):
    store       = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='products')
    name        = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    price       = models.DecimalField(max_digits=10, decimal_places=2)
    stock       = models.PositiveIntegerField(default=0)
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} — {self.store.name}"
