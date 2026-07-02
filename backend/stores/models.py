from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import timedelta


class Store(models.Model):
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='store'
    )
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, max_length=80)
    description = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    logo = models.ImageField(upload_to='store_logos/', blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


def _trial_end():
    return timezone.now() + timedelta(days=30)


class SubscriptionQuota(models.Model):
    store = models.OneToOneField(Store, on_delete=models.CASCADE, related_name='quota')
    orders_limit = models.PositiveIntegerField(default=50)
    orders_used = models.PositiveIntegerField(default=0)
    trial_ends_at = models.DateTimeField(default=_trial_end)

    @property
    def orders_remaining(self):
        return max(0, self.orders_limit - self.orders_used)

    @property
    def is_trial_active(self):
        return timezone.now() < self.trial_ends_at

    def __str__(self):
        return f"Quota {self.store.name}"


class StoreSettings(models.Model):
    store               = models.OneToOneField(Store, on_delete=models.CASCADE, related_name='settings')
    low_stock_threshold = models.PositiveIntegerField(default=5)

    def __str__(self):
        return f"Settings {self.store.name}"
