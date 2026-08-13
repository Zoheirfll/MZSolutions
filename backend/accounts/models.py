from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from core.validators import validate_image_extension, validate_image_size


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError('Email obligatoire')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        extra.setdefault('is_active', True)
        extra.setdefault('is_email_verified', True)
        return self.create_user(email, password, **extra)


class User(AbstractUser):
    objects = UserManager()
    username = None
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True,
                                validators=[validate_image_extension, validate_image_size])
    google_id = models.CharField(max_length=120, blank=True)
    is_email_verified = models.BooleanField(default=False)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    def __str__(self):
        return self.email


class EmailVerificationCode(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='verification_code')
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Code {self.user.email}"


LOGIN_HISTORY_STATUS_CHOICES = [('login', 'login'), ('logout', 'logout')]


class LoginHistory(models.Model):
    """Journal des connexions/déconnexions réelles (page Paramètres →
    "Historique de connexion récent", équivalent RiseCart) — une ligne par
    appel réel à LoginView/LogoutView, jamais simulée. Pas de géolocalisation
    IP (aucun service configuré) — `location` reste 'Unknown', honnête plutôt
    que d'inventer une position."""
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='login_history')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    status     = models.CharField(max_length=10, choices=LOGIN_HISTORY_STATUS_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.status} — {self.user.email} — {self.created_at}"
