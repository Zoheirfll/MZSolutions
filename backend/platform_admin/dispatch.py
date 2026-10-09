"""Moteur du dispatch des commandes du service de confirmation (spec :
docs/superpowers/specs/2026-10-09-dispatch-confirmation-design.md).

Principe : une commande entre dans le flux en « attente d'assignation ». `fill_slots` classe les
commandes disponibles avec l'algorithme de leur boutique (le plus haut score d'abord) puis donne
chacune au confirmateur le moins chargé qui a de la capacité, en évitant ceux qui l'ont déjà
essayée. Un appel raté renvoie la commande en attente (délai croissant) ; passé `review_after`
appels elle est signalée à l'admin ; passé `review_after + fail_after_review` elle est en échec
définitif. `Order.status` n'est jamais modifié ici."""
import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from .dispatch_algorithms import NEUTRAL, Signals, score
from .dispatch_models import (
    CALL_OUTCOMES, DEFAULT_WAIT_MINUTES, PlatformDispatchConfig, PlatformOrderEvent, PlatformOrderFlow,
)
from .models import PlatformConfirmateurAssignment, PlatformOrderAssignment

logger = logging.getLogger(__name__)

# Statuts où la commande attend encore un traitement : au-delà, le flux est terminé.
OPEN_STATUSES = ('pending', 'scheduled', 'no_answer_1', 'no_answer_2', 'no_answer_3')
CONFIRMED_LIKE = ('confirmed', 'shipped', 'delivered')
LOST_STATUSES = ('cancelled', 'returned')
MIN_RATE_SAMPLE = 10          # en dessous, le taux de la boutique est jugé non significatif
RATE_WINDOW_DAYS = 30
DEFAULT_CALLBACK_MINUTES = 60
OUTCOME_KEYS = {key for key, _ in CALL_OUTCOMES}


class DispatchError(Exception):
    """Action de dispatch refusée (message affichable tel quel)."""


# ─── Configuration ──────────────────────────────────────────────────────────

def resolve_config(store, now=None):
    """Réglage le plus spécifique pour `store` à l'instant `now` : boutique+date, boutique+jour,
    boutique, site+date, site+jour, site. Sans réglage : valeurs par défaut (objet non sauvegardé)."""
    now = timezone.localtime(now or timezone.now())
    rows = (PlatformDispatchConfig.objects
            .filter(Q(store=store) | Q(store__isnull=True))
            .filter(Q(date=now.date()) | Q(date__isnull=True))
            .filter(Q(weekday=now.weekday()) | Q(weekday__isnull=True)))
    best, best_key = None, None
    for row in rows:
        key = (row.store_id is not None, row.date is not None, row.weekday is not None)
        if best is None or key > best_key:
            best, best_key = row, key
    return best or PlatformDispatchConfig()


# ─── Signaux et classement ──────────────────────────────────────────────────

def _minutes(delta):
    return max(delta.total_seconds() / 60.0, 0.0)


def store_confirmation_rate(store_id, now, cache):
    """Taux de confirmation (0-100) de la boutique sur 30 jours ; neutre si trop peu de commandes."""
    if store_id in cache:
        return cache[store_id]
    from orders.models import Order
    qs = Order.objects.filter(store_id=store_id, created_at__gte=now - timedelta(days=RATE_WINDOW_DAYS))
    ok = qs.filter(status__in=CONFIRMED_LIKE).count()
    total = ok + qs.filter(status__in=LOST_STATUSES).count()
    cache[store_id] = NEUTRAL if total < MIN_RATE_SAMPLE else ok / total * 100.0
    return cache[store_id]


def signals_for(flow, now, rate_cache):
    order = flow.order
    last = flow.last_attempt_at or order.created_at
    return Signals(
        age_min=_minutes(now - order.created_at),
        attempts=flow.attempts,
        since_last_min=_minutes(now - last),
        overdue_min=_minutes(now - flow.available_at) if flow.attempts > 0 else 0.0,
        store_rate=store_confirmation_rate(order.store_id, now, rate_cache),
        amount=float(order.total or 0),
        risk=float(order.risk_score) if order.risk_score is not None else NEUTRAL,
    )


def rank_flows(flows, now, config_cache=None, rate_cache=None):
    """[(score, flow, config)] triés du plus prioritaire au moins prioritaire — égalité de note :
    la commande la plus ancienne d'abord."""
    config_cache = {} if config_cache is None else config_cache
    rate_cache = {} if rate_cache is None else rate_cache
    ranked = []
    for flow in flows:
        sid = flow.order.store_id
        if sid not in config_cache:
            config_cache[sid] = resolve_config(flow.order.store, now)
        cfg = config_cache[sid]
        ranked.append((score(cfg.algorithm, signals_for(flow, now, rate_cache), cfg.weights), flow, cfg))
    ranked.sort(key=lambda item: (-item[0], item[1].order.created_at, item[1].id))
    return ranked


# ─── Flux ───────────────────────────────────────────────────────────────────

def _event(flow, kind, confirmateur_id=None, outcome='', note='', **detail):
    PlatformOrderEvent.objects.create(flow=flow, kind=kind, confirmateur_id=confirmateur_id,
                                      outcome=outcome, note=note[:300], detail=detail)


def start_flow(order, now=None):
    """Fait entrer la commande dans le flux (idempotent)."""
    now = now or timezone.now()
    flow, created = PlatformOrderFlow.objects.get_or_create(order=order, defaults={'available_at': now})
    if created:
        _event(flow, 'created')
    return flow


def _eligible_by_store(store_ids):
    rows = (PlatformConfirmateurAssignment.objects
            .filter(account__store_id__in=store_ids, account__is_active=True, is_active=True,
                    confirmateur__is_active=True, confirmateur__user__isnull=False)
            .order_by('confirmateur_id')
            .values_list('account__store_id', 'confirmateur_id'))
    result = {sid: [] for sid in store_ids}
    for sid, cid in rows:
        result[sid].append(cid)
    return result


def _open_counts():
    rows = (PlatformOrderFlow.objects.filter(state='assigned', confirmateur__isnull=False)
            .values('confirmateur_id').annotate(n=Count('id')))
    return {row['confirmateur_id']: row['n'] for row in rows}


def _assign(flow, confirmateur_id, cfg, flow_score, now):
    flow.state = 'assigned'
    flow.confirmateur_id = confirmateur_id
    flow.save(update_fields=['state', 'confirmateur'])
    PlatformOrderAssignment.objects.update_or_create(order=flow.order, defaults={'confirmateur_id': confirmateur_id})
    PlatformOrderAssignment.objects.filter(order=flow.order).update(assigned_at=now)
    _event(flow, 'assigned', confirmateur_id=confirmateur_id,
           algorithm=cfg.algorithm, score=flow_score, attempt=flow.attempts + 1)


@transaction.atomic
def fill_slots(now=None):
    """Distribue les commandes disponibles aux confirmateurs ayant de la capacité. Retourne le
    nombre de commandes assignées. Verrou `skip_locked` : une requête web et la tâche planifiée
    ne peuvent jamais assigner deux fois la même commande."""
    now = now or timezone.now()
    flows = list(
        PlatformOrderFlow.objects.select_for_update(skip_locked=True, of=('self',))
        .select_related('order__store')
        .filter(state='waiting', available_at__lte=now,
                order__store__platform_confirmation_account__is_active=True))
    if not flows:
        return 0
    eligible = _eligible_by_store({f.order.store_id for f in flows})
    open_counts = _open_counts()
    assigned = 0
    for flow_score, flow, cfg in rank_flows(flows, now):
        candidates = [c for c in eligible.get(flow.order.store_id, []) if open_counts.get(c, 0) < cfg.max_open]
        if not candidates:
            continue
        tried = set(flow.events.filter(kind='assigned').values_list('confirmateur_id', flat=True))
        pool = [c for c in candidates if c not in tried] or candidates
        chosen = min(pool, key=lambda c: (open_counts.get(c, 0), c))
        _assign(flow, chosen, cfg, flow_score, now)
        open_counts[chosen] = open_counts.get(chosen, 0) + 1
        assigned += 1
    return assigned


def _wait_minutes(cfg, attempts):
    waits = [int(m) for m in (cfg.wait_minutes or DEFAULT_WAIT_MINUTES)] or DEFAULT_WAIT_MINUTES
    return waits[min(max(attempts - 1, 0), len(waits) - 1)]


@transaction.atomic
def record_attempt(order, confirmateur, outcome, note='', callback_at=None, now=None):
    """Enregistre le résultat d'un appel raté par `confirmateur` et remet la commande en attente
    (ou l'envoie en échec définitif). « Rappeler plus tard » ne compte pas comme un appel raté."""
    now = now or timezone.now()
    if outcome not in OUTCOME_KEYS:
        raise DispatchError('Résultat d\'appel invalide.')
    flow = (PlatformOrderFlow.objects.select_for_update().select_related('order__store')
            .filter(order=order).first())
    if not flow or flow.state != 'assigned' or flow.confirmateur_id != confirmateur.id:
        raise DispatchError('Cette commande n\'est pas assignée à ce confirmateur.')

    cfg = resolve_config(flow.order.store, now)
    is_callback = outcome == 'callback'
    if not is_callback:
        flow.attempts += 1
        flow.last_attempt_at = now
    _event(flow, 'attempt', confirmateur_id=confirmateur.id, outcome=outcome, note=note, attempt=flow.attempts)

    PlatformOrderAssignment.objects.filter(order=flow.order).delete()
    flow.confirmateur = None

    if not is_callback and flow.attempts >= cfg.review_after + cfg.fail_after_review:
        flow.state = 'failed'
        flow.failed_at = now
        flow.save(update_fields=['state', 'confirmateur', 'attempts', 'last_attempt_at', 'failed_at'])
        _event(flow, 'failed', attempts=flow.attempts)
        return flow

    if not is_callback and flow.attempts >= cfg.review_after and not flow.admin_flagged_at:
        flow.admin_flagged_at = now
        _event(flow, 'escalated', attempts=flow.attempts)

    if is_callback:
        wait = DEFAULT_CALLBACK_MINUTES
        available = callback_at if callback_at and callback_at > now else now + timedelta(minutes=wait)
    else:
        wait = _wait_minutes(cfg, flow.attempts)
        available = now + timedelta(minutes=wait)
    flow.state = 'waiting'
    flow.available_at = available
    flow.save(update_fields=['state', 'confirmateur', 'attempts', 'last_attempt_at', 'admin_flagged_at', 'available_at'])
    _event(flow, 'requeued', wait_minutes=round(_minutes(available - now)), available_at=available.isoformat())
    fill_slots(now)
    return flow


def finish_flow(order, new_status, confirmateur_id=None, now=None):
    """Clôt le flux quand la commande quitte les statuts « à traiter » (confirmée, annulée…)."""
    if new_status in OPEN_STATUSES:
        return None
    now = now or timezone.now()
    flow = PlatformOrderFlow.objects.filter(order=order, state__in=('waiting', 'assigned')).first()
    if not flow:
        return None
    flow.state = 'done'
    flow.done_at = now
    flow.save(update_fields=['state', 'done_at'])
    _event(flow, 'done', confirmateur_id=confirmateur_id, status=new_status)
    fill_slots(now)
    return flow


def close_stale_flows(now=None):
    """Clôt les flux dont la commande a été traitée en dehors du flux (statut modifié par le
    vendeur ou un admin). Retourne le nombre de flux clos."""
    now = now or timezone.now()
    stale = list(PlatformOrderFlow.objects.filter(state__in=('waiting', 'assigned'))
                 .exclude(order__status__in=OPEN_STATUSES).select_related('order'))
    for flow in stale:
        flow.state = 'done'
        flow.done_at = now
        flow.save(update_fields=['state', 'done_at'])
        _event(flow, 'done', status=flow.order.status, closed_by='system')
    return len(stale)


def run_cycle(now=None):
    """Un passage complet (tâche planifiée / lancement manuel) : clôture puis distribution."""
    now = now or timezone.now()
    closed = close_stale_flows(now)
    return {'closed': closed, 'assigned': fill_slots(now)}
