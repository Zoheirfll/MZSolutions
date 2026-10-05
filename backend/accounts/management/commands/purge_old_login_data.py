from platform_admin.tasks import track_task
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import FailedLoginAttempt, LoginHistory


class Command(BaseCommand):
    help = "Purge les tentatives de connexion échouées (> 90 jours) et l'historique de connexion (> 1 an) — minimisation des données personnelles."

    @track_task('purge_old_login_data')
    def handle(self, *args, **options):
        now = timezone.now()
        failed, _ = FailedLoginAttempt.objects.filter(created_at__lt=now - timedelta(days=90)).delete()
        history, _ = LoginHistory.objects.filter(created_at__lt=now - timedelta(days=365)).delete()
        self.stdout.write(f'Purge : {failed} tentative(s) échouée(s), {history} entrée(s) d\'historique.')
