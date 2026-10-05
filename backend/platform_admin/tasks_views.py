"""Tâches planifiées et sauvegardes (admin plateforme — phase 9)."""
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import tasks
from .account_views import log_platform_audit
from .permissions import is_platform_admin, is_platform_superadmin
from .system_models import TaskRun

BACKUP_EXTENSIONS = ('.sql', '.sql.gz', '.dump')
BACKUP_OK_HOURS, BACKUP_WARN_HOURS = 26, 72
LOCK_SECONDS = 15 * 60


def _forbidden(superadmin=False):
    who = 'au superadmin' if superadmin else 'aux administrateurs de la plateforme'
    return Response({'detail': f'Accès réservé {who}.'}, status=403)


class PlatformTaskListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        runs = {r.name: r for r in TaskRun.objects.all()}
        now = timezone.now()
        rows = []
        for name, (label, interval) in tasks.REGISTRY.items():
            run = runs.get(name)
            rows.append({
                'name': name, 'label': label, 'interval_minutes': interval,
                'status': tasks.task_status(run, interval, now),
                'last_started_at': run.last_started_at if run else None, 'last_finished_at': run.last_finished_at if run else None,
                'last_message': run.last_message if run else '', 'runs_count': run.runs_count if run else 0,
            })
        return Response({'results': rows})


class PlatformTaskRunView(APIView):
    """Lance une tâche à la main (superadmin) : en arrière-plan, jamais deux fois en même temps."""
    permission_classes = [IsAuthenticated]

    def post(self, request, name):
        if not is_platform_superadmin(request):
            return _forbidden(True)
        if name not in tasks.REGISTRY:
            return Response({'detail': 'Tâche inconnue.'}, status=404)
        if not cache.add(f'platform-task-lock:{name}', '1', LOCK_SECONDS):
            return Response({'detail': "Cette tâche vient déjà d'être lancée."}, status=409)
        log_platform_audit(request, 'platform.task_launched', description=f'Tâche « {name} » lancée manuellement', metadata={'task': name})
        tasks.launch(name)
        return Response({'detail': 'Tâche lancée.'}, status=202)


def backup_dir():
    return Path(getattr(settings, 'BACKUP_DIR', '/backups'))


def list_backups():
    """Sauvegardes présentes dans le dossier monté (lecture seule), de la plus récente à la plus
    ancienne. None si le dossier n'existe pas (non configuré)."""
    directory = backup_dir()
    if not directory.is_dir():
        return None
    files = []
    for entry in directory.iterdir():
        if entry.is_file() and entry.name.endswith(BACKUP_EXTENSIONS):
            stat = entry.stat()
            files.append({'name': entry.name, 'size': stat.st_size,
                          'modified_at': datetime.fromtimestamp(stat.st_mtime, tz=timezone.get_current_timezone())})
    files.sort(key=lambda f: f['modified_at'], reverse=True)
    return files


def backup_state(files, now=None):
    """'unconfigured' | 'error' (aucune ou trop ancienne) | 'warning' | 'ok'."""
    now = now or timezone.now()
    if files is None:
        return 'unconfigured'
    if not files:
        return 'error'
    age = now - files[0]['modified_at']
    if age <= timedelta(hours=BACKUP_OK_HOURS):
        return 'ok'
    return 'warning' if age <= timedelta(hours=BACKUP_WARN_HOURS) else 'error'


class PlatformBackupListView(APIView):
    """Sauvegardes de la base (lecture seule : le conteneur web ne peut ni en créer ni en supprimer)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        files = list_backups()
        return Response({'configured': files is not None, 'state': backup_state(files), 'count': len(files or []),
                         'results': (files or [])[:30]})
