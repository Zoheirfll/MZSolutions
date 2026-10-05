"""Modèles « système » de l'admin plateforme (phase 4) : journal d'erreurs 500
groupées et réglages globaux. Importés par platform_admin/models.py pour que
Django les enregistre."""
from django.db import models


class ErrorEvent(models.Model):
    """Erreur serveur (500) groupée par empreinte (type + route normalisée +
    ligne fautive). **Aucune donnée de requête n'est conservée** : ni corps, ni
    cookies, ni en-têtes, ni message d'exception (qui pourrait contenir des
    données personnelles saisies par un utilisateur) — uniquement le type, la
    route normalisée (`/api/orders/<id>/`), la méthode et l'emplacement dans le code."""
    STATUS_CHOICES = [('open', 'Ouverte'), ('resolved', 'Résolue')]

    fingerprint = models.CharField(max_length=40, unique=True)
    exception_type = models.CharField(max_length=120)
    route = models.CharField(max_length=200)
    method = models.CharField(max_length=10)
    location = models.CharField(max_length=300, blank=True)  # fichier:ligne:fonction
    count = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='open')
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField()
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-last_seen']

    def __str__(self):
        return f'{self.exception_type} {self.method} {self.route}'


class PlatformSettings(models.Model):
    """Réglages globaux de la plateforme — **une seule ligne** (`load()`). Les
    secrets (clés API, SECRET_KEY) ne sont JAMAIS stockés ici : ils restent dans
    le `.env`."""
    trial_days = models.PositiveIntegerField(default=30, help_text="Durée de l'essai gratuit des NOUVELLES boutiques")
    allow_registration = models.BooleanField(default=True, help_text="False = inscriptions fermées (incident, maintenance)")
    # Modules coupes pour TOUTE la plateforme (cles de core.features.FEATURES) et plafond d'appels IA
    # par boutique et par jour (0 = illimite)
    disabled_features = models.JSONField(default=list, blank=True)
    ai_daily_limit = models.PositiveIntegerField(default=0)
    ai_weekly_limit = models.PositiveIntegerField(default=0)  # boutiques sans palier (essai)
    ai_quotas = models.JSONField(default=dict, blank=True)  # idem, par fonctionnalité
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return 'Réglages de la plateforme'


class TaskRun(models.Model):
    """Dernier passage d'une tâche planifiée (commande de management), alimenté par le
    décorateur `platform_admin.tasks.track_task`. Une seule ligne par tâche."""
    STATUS_CHOICES = [('running', 'En cours'), ('ok', 'Réussie'), ('error', 'En erreur')]

    name = models.CharField(max_length=60, unique=True)
    last_started_at = models.DateTimeField(null=True, blank=True)
    last_finished_at = models.DateTimeField(null=True, blank=True)
    last_status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='ok')
    last_message = models.CharField(max_length=300, blank=True)  # type d'exception seulement, jamais de données
    runs_count = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.name
