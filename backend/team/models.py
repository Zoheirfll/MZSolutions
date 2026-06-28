import secrets
from django.db import models
from django.conf import settings
from stores.models import Store


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

    def save(self, *args, **kwargs):
        if not self.invite_token:
            self.invite_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.role}) — {self.store.name}"
