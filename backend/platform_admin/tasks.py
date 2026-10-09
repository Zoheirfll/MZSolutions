"""Suivi des tâches planifiées (commandes de management) et lancement manuel.

Chaque commande suivie est décorée `@track_task('nom')` : son dernier passage (début, fin, statut)
est écrit en base (`TaskRun`), ce qui permet à l'admin de voir si elle tourne toujours — y compris
de repérer une tâche JAMAIS planifiée sur le serveur. Le message d'erreur ne contient que le TYPE
de l'exception (jamais de données)."""
import functools
import logging
import threading
from datetime import timedelta

from django.core.management import call_command
from django.utils import timezone

logger = logging.getLogger(__name__)

# nom de commande -> (libellé, intervalle attendu en minutes). Au-delà de 2 intervalles sans
# passage réussi, la tâche est signalée « en retard ».
REGISTRY = {
    'check_pending_payments': ('Vérification des paiements SofizPay en attente', 10),
    'sync_carrier_tracking': ('Synchronisation du suivi des transporteurs', 15),
    'activate_scheduled_orders': ('Activation des commandes programmées', 5),
    'dispatch_waiting_orders': ('Dispatch des commandes en attente (service de confirmation)', 1),
    'cancel_stale_calls': ('Annulation des commandes sans réponse (3 jours)', 1440),
    'send_abandoned_cart_reminders': ('Relance des paniers abandonnés', 60),
    'purge_old_login_data': ('Purge des anciennes données de connexion', 1440),
}
RUNNING_STALE_MINUTES = 30  # un « en cours » plus vieux que ça est considéré comme interrompu


def track_task(name):
    """Décorateur de `Command.handle`. Ne masque jamais l'exception d'origine."""
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            from .system_models import TaskRun
            run = None
            try:
                run, _ = TaskRun.objects.get_or_create(name=name)
                TaskRun.objects.filter(pk=run.pk).update(last_started_at=timezone.now(), last_status='running', last_message='')
            except Exception:
                logger.exception('track_task: début non enregistré (%s)', name)
            try:
                result = fn(*args, **kwargs)
            except Exception as exc:
                _finish(run, 'error', type(exc).__name__)
                raise
            _finish(run, 'ok', '')
            return result
        return wrapper
    return decorator


def _finish(run, status, message):
    if run is None:
        return
    try:
        from django.db.models import F
        from .system_models import TaskRun
        TaskRun.objects.filter(pk=run.pk).update(
            last_finished_at=timezone.now(), last_status=status, last_message=message[:300], runs_count=F('runs_count') + 1)
    except Exception:
        logger.exception('track_task: fin non enregistrée')


def task_status(run, interval_minutes, now=None):
    """'never' | 'running' | 'error' | 'overdue' | 'ok'."""
    now = now or timezone.now()
    if run is None or run.last_started_at is None:
        return 'never'
    if run.last_status == 'running':
        return 'running' if now - run.last_started_at < timedelta(minutes=RUNNING_STALE_MINUTES) else 'error'
    if run.last_status == 'error':
        return 'error'
    if run.last_finished_at and now - run.last_finished_at > timedelta(minutes=2 * interval_minutes):
        return 'overdue'
    return 'ok'


def _execute(name):
    try:
        call_command(name)
    except Exception:
        logger.exception('Lancement manuel de %s en erreur', name)
    finally:
        # Un thread d'arrière-plan ouvre sa propre connexion : on la ferme à la fin. Jamais la
        # connexion du thread principal (appel direct, ex. tests).
        if threading.current_thread() is not threading.main_thread():
            from django.db import connection
            connection.close()


def launch(name):
    """Lance la tâche en arrière-plan (jamais dans la requête web : certaines sont longues)."""
    threading.Thread(target=_execute, args=(name,), daemon=True).start()
