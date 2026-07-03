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


THEME_CHOICES = [('violet', 'Violet'), ('midnight', 'Midnight'), ('sahara', 'Sahara')]
FONT_CHOICES  = [('inter', 'Inter'), ('poppins', 'Poppins'), ('cairo', 'Cairo')]


class StoreSettings(models.Model):
    store               = models.OneToOneField(Store, on_delete=models.CASCADE, related_name='settings')
    low_stock_threshold        = models.PositiveIntegerField(default=5)
    abandoned_cart_delay_hours = models.PositiveIntegerField(default=1)
    theme_template  = models.CharField(max_length=20, choices=THEME_CHOICES, default='violet')
    theme_primary   = models.CharField(max_length=7, blank=True)
    theme_secondary = models.CharField(max_length=7, blank=True)
    theme_font      = models.CharField(max_length=20, choices=FONT_CHOICES, default='inter')
    menu_items      = models.JSONField(default=list)

    def __str__(self):
        return f"Settings {self.store.name}"


PAGE_TYPE_CHOICES = [
    ('about', 'À propos'),
    ('faq',   'FAQ'),
    ('terms', 'Conditions'),
    ('custom','Page libre'),
]


class StorePage(models.Model):
    store        = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='pages')
    title        = models.CharField(max_length=200)
    slug         = models.SlugField(max_length=100)
    content      = models.TextField(blank=True)
    page_type    = models.CharField(max_length=20, choices=PAGE_TYPE_CHOICES, default='custom')
    is_published = models.BooleanField(default=True)
    order        = models.PositiveIntegerField(default=0)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'created_at']
        unique_together = [('store', 'slug')]

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            self.slug = slugify(self.title) or 'page'
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} — {self.store.name}"


class MediaFolder(models.Model):
    store      = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='media_folders')
    name       = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        unique_together = [('store', 'name')]

    def __str__(self):
        return f"{self.name} — {self.store.name}"


class MediaFile(models.Model):
    store         = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='media_files')
    folder        = models.ForeignKey(MediaFolder, on_delete=models.SET_NULL, null=True, blank=True, related_name='files')
    file          = models.FileField(upload_to='media_manager/')
    original_name = models.CharField(max_length=255)
    size          = models.PositiveIntegerField(default=0)
    mime_type     = models.CharField(max_length=100, blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.original_name} — {self.store.name}"
