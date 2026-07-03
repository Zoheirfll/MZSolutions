from django.db import models
from stores.models import Store

COST_CATEGORY_CHOICES = [
    ('operational', 'Opérationnel'),
    ('marketing',   'Marketing'),
]


class Cost(models.Model):
    """Coût saisi manuellement par le vendeur (US-7.4.1), rattaché à une
    période et une catégorie fixe. `label` est un sous-type libre
    (ex: "Facebook Ads", "Loyer local") — pas de CRUD de catégories séparé,
    même compromis simplicité que Supplier/FailureReason."""
    store        = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='costs')
    category     = models.CharField(max_length=20, choices=COST_CATEGORY_CHOICES)
    label        = models.CharField(max_length=150)
    amount       = models.DecimalField(max_digits=12, decimal_places=2)
    period_start = models.DateField()
    period_end   = models.DateField()
    note         = models.TextField(blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-period_start']

    def __str__(self):
        return f"{self.label} — {self.amount} ({self.period_start} → {self.period_end})"
