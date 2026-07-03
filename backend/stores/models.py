from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from core.validators import validate_image_extension, validate_image_size


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
    logo = models.ImageField(upload_to='store_logos/', blank=True, null=True,
                              validators=[validate_image_extension, validate_image_size])
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


def _trial_end():
    return timezone.now() + timedelta(days=30)


BILLING_CYCLE_CHOICES = [('monthly', 'Mensuel'), ('yearly', 'Annuel')]


class SubscriptionPlan(models.Model):
    """Palier d'abonnement (Epic 8.5 US-8.5.1) — catalogue global, pas par
    boutique. Limites/prix volontairement en base (pas codés en dur) pour
    rester ajustables sans déploiement, l'AC précisant explicitement que les
    valeurs exactes sont TBD."""
    name           = models.CharField(max_length=50)
    orders_limit   = models.PositiveIntegerField(null=True, blank=True, help_text="Vide = illimité")
    price_monthly  = models.DecimalField(max_digits=10, decimal_places=2)
    price_yearly   = models.DecimalField(max_digits=10, decimal_places=2)
    features       = models.JSONField(default=list, help_text="Liste de textes affichés sous le palier")
    is_active      = models.BooleanField(default=True)
    order          = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def price_for(self, billing_cycle):
        return self.price_yearly if billing_cycle == 'yearly' else self.price_monthly

    def __str__(self):
        return self.name


class SubscriptionQuota(models.Model):
    store = models.OneToOneField(Store, on_delete=models.CASCADE, related_name='quota')
    orders_limit = models.PositiveIntegerField(default=50)
    orders_used = models.PositiveIntegerField(default=0)
    trial_ends_at = models.DateTimeField(default=_trial_end)
    plan           = models.ForeignKey(SubscriptionPlan, null=True, blank=True, on_delete=models.SET_NULL, related_name='subscribers')
    billing_cycle  = models.CharField(max_length=10, choices=BILLING_CYCLE_CHOICES, blank=True)
    period_end     = models.DateTimeField(null=True, blank=True, help_text="Fin de la période payée en cours (abonnement actif seulement)")

    @property
    def orders_remaining(self):
        return max(0, self.orders_limit - self.orders_used)

    @property
    def is_trial_active(self):
        return self.plan_id is None and timezone.now() < self.trial_ends_at

    @property
    def is_subscription_active(self):
        return self.plan_id is not None and self.period_end and timezone.now() < self.period_end

    def __str__(self):
        return f"Quota {self.store.name}"


THEME_CHOICES = [('violet', 'Violet'), ('midnight', 'Midnight'), ('sahara', 'Sahara')]
FONT_CHOICES  = [('inter', 'Inter'), ('poppins', 'Poppins'), ('cairo', 'Cairo')]


class StoreSettings(models.Model):
    store               = models.OneToOneField(Store, on_delete=models.CASCADE, related_name='settings')
    low_stock_threshold        = models.PositiveIntegerField(default=5)
    abandoned_cart_delay_hours = models.PositiveIntegerField(default=1)
    risk_threshold_orders      = models.PositiveIntegerField(default=3)
    risk_period_days           = models.PositiveIntegerField(default=90)
    theme_template  = models.CharField(max_length=20, choices=THEME_CHOICES, default='violet')
    theme_primary   = models.CharField(max_length=7, blank=True)
    theme_secondary = models.CharField(max_length=7, blank=True)
    theme_font      = models.CharField(max_length=20, choices=FONT_CHOICES, default='inter')
    menu_items      = models.JSONField(default=list)

    def __str__(self):
        return f"Settings {self.store.name}"


PIXEL_TYPE_CHOICES = [
    ('facebook',            'Facebook Pixel'),
    ('tiktok',              'TikTok Pixel'),
    ('google_analytics',    'Google Analytics'),
    ('google_tag_manager',  'Google Tag Manager'),
]


class PixelConfig(models.Model):
    """Identifiant de pixel marketing configuré par le vendeur (Epic 8.3
    US-8.3.1). Plusieurs entrées possibles par type (ex: deux comptes
    publicitaires Facebook différents), même souplesse que les comptes
    transporteurs. Le catalogue Facebook (Meta Commerce) n'a pas d'entrée
    ici — c'est le flux `/api/public/store/<slug>/catalog.xml` de l'Epic 8.2,
    aucun identifiant à saisir."""
    store      = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='pixels')
    pixel_type = models.CharField(max_length=30, choices=PIXEL_TYPE_CHOICES)
    pixel_id   = models.CharField(max_length=150)
    label      = models.CharField(max_length=100, blank=True)
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['pixel_type', '-created_at']

    def __str__(self):
        return f"{self.get_pixel_type_display()} — {self.pixel_id} ({self.store.name})"


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
