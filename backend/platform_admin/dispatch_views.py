"""API du dispatch des commandes du service de confirmation.

Admin du service (`is_service_admin`) : pages « En attente d'assignation », « À traiter » et
« Échecs », fiche d'une commande avec son journal expliqué, réglage des algorithmes, lancement
manuel. Confirmateur du service : résultat d'appel (`MyQueueCallView`)."""
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import parse_pagination
from stores.models import Store

from . import dispatch
from .dispatch_algorithms import ALGORITHMS, DEFAULT_WEIGHTS, catalog
from .dispatch_models import (
    CALL_OUTCOMES, DEFAULT_WAIT_MINUTES, PlatformDispatchConfig, PlatformOrderEvent, PlatformOrderFlow,
)
from .permissions import get_platform_confirmateur, is_service_admin

MAX_RANKED = 500          # plafond de commandes classées par requête (page « En attente »)
OUTCOME_LABELS = dict(CALL_OUTCOMES)


def _forbidden():
    return Response({'detail': "Accès réservé à l'opérateur du service de confirmation."}, status=403)


def _name(person):
    return f'{person.first_name} {person.last_name}'.strip() if person else None


def _customer(order):
    return f'{order.first_name} {order.last_name}'.strip()


def _last_outcomes(flow_ids):
    """Dernier résultat d'appel de chaque flux, en une seule requête."""
    result = {}
    for ev in (PlatformOrderEvent.objects.filter(flow_id__in=flow_ids, kind='attempt')
               .order_by('created_at', 'id')):
        result[ev.flow_id] = ev.outcome
    return result


def _flow_rows(flows, now, scores=None):
    outcomes = _last_outcomes([f.id for f in flows])
    rows = []
    for flow in flows:
        order = flow.order
        left = max(0, round((flow.available_at - now).total_seconds() / 60)) if flow.state == 'waiting' else 0
        row = {
            'order_id': order.id, 'store_id': order.store_id, 'store_name': order.store.name,
            'customer': _customer(order), 'phone': order.phone, 'wilaya': order.wilaya, 'total': str(order.total),
            'state': flow.state, 'attempts': flow.attempts, 'available_at': flow.available_at,
            'minutes_left': left, 'created_at': order.created_at, 'admin_flagged_at': flow.admin_flagged_at,
            'failed_at': flow.failed_at, 'confirmateur': _name(flow.confirmateur),
            'last_outcome': outcomes.get(flow.id), 'last_outcome_label': OUTCOME_LABELS.get(outcomes.get(flow.id)),
        }
        if scores and flow.id in scores:
            row.update(scores[flow.id])
        rows.append(row)
    return rows


def _filtered(qs, request):
    store = request.query_params.get('store')
    if store and store.isdigit():
        qs = qs.filter(order__store_id=int(store))
    search = (request.query_params.get('search') or '').strip()
    if search:
        cond = Q(order__phone__icontains=search) | Q(order__first_name__icontains=search) | Q(order__last_name__icontains=search)
        if search.isdigit():
            cond |= Q(order_id=int(search))
        qs = qs.filter(cond)
    return qs


def _base():
    return PlatformOrderFlow.objects.select_related('order__store', 'confirmateur')


def _paginate(rows_or_qs, request, build):
    page, per_page = parse_pagination(request, default_per_page=20)
    total = len(rows_or_qs) if isinstance(rows_or_qs, list) else rows_or_qs.count()
    chunk = rows_or_qs[(page - 1) * per_page: page * per_page]
    return Response({'count': total, 'page': page, 'per_page': per_page, 'results': build(chunk)})


class DispatchMetaView(APIView):
    """Catalogue des algorithmes + valeurs par défaut — alimente le formulaire de réglage."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_service_admin(request):
            return _forbidden()
        return Response({
            'algorithms': catalog(), 'outcomes': [{'key': k, 'label': v} for k, v in CALL_OUTCOMES],
            'defaults': {'algorithm': 'fifo', 'wait_minutes': DEFAULT_WAIT_MINUTES, 'review_after': 4,
                         'fail_after_review': 4, 'max_open': 5, 'weights': DEFAULT_WEIGHTS},
        })


class DispatchWaitingView(APIView):
    """« En attente d'assignation » : commandes dans le pool, classées comme le moteur les servira."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_service_admin(request):
            return _forbidden()
        now = timezone.now()
        flows = list(_filtered(_base().filter(state='waiting'), request)[:MAX_RANKED])
        ranked = dispatch.rank_flows(flows, now)
        scores = {f.id: {'rank': i + 1, 'score': s, 'algorithm': cfg.algorithm, 'ready': f.available_at <= now}
                  for i, (s, f, cfg) in enumerate(ranked)}
        ordered = [f for _, f, _ in ranked]
        return _paginate(ordered, request, lambda chunk: _flow_rows(chunk, now, scores))


class DispatchReviewView(APIView):
    """« À traiter » : commandes signalées à l'admin (≥ review_after appels ratés), encore dans le flux."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_service_admin(request):
            return _forbidden()
        now = timezone.now()
        qs = _filtered(_base().filter(admin_flagged_at__isnull=False, state__in=('waiting', 'assigned')), request)
        qs = qs.order_by('-attempts', 'admin_flagged_at')
        return _paginate(qs, request, lambda chunk: _flow_rows(list(chunk), now))


class DispatchFailedView(APIView):
    """« Échecs » : état définitif, lecture seule."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_service_admin(request):
            return _forbidden()
        now = timezone.now()
        qs = _filtered(_base().filter(state='failed'), request).order_by('-failed_at')
        return _paginate(qs, request, lambda chunk: _flow_rows(list(chunk), now))


class DispatchCountsView(APIView):
    """Compteurs des trois pages (pastilles de la barre latérale)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_service_admin(request):
            return _forbidden()
        return Response({
            'waiting': PlatformOrderFlow.objects.filter(state='waiting').count(),
            'review': PlatformOrderFlow.objects.filter(admin_flagged_at__isnull=False, state__in=('waiting', 'assigned')).count(),
            'failed': PlatformOrderFlow.objects.filter(state='failed').count(),
        })


def _explain(event, names):
    d = event.detail or {}
    who = names.get(event.confirmateur_id, 'un confirmateur')
    if event.kind == 'created':
        return 'Commande entrée dans le flux de dispatch.'
    if event.kind == 'assigned':
        label = ALGORITHMS.get(d.get('algorithm'), (d.get('algorithm'),))[0]
        return f"Assignée à {who} (algorithme « {label} », note {d.get('score')}), tentative n°{d.get('attempt')}."
    if event.kind == 'attempt':
        text = f"{who} a appelé : {OUTCOME_LABELS.get(event.outcome, event.outcome)}."
        return f'{text} Note : {event.note}' if event.note else text
    if event.kind == 'requeued':
        return f"Remise en attente d'assignation — prochaine tentative dans {d.get('wait_minutes')} min."
    if event.kind == 'escalated':
        return f"Signalée à l'admin après {d.get('attempts')} appels sans réponse."
    if event.kind == 'failed':
        return f"Échec définitif après {d.get('attempts')} appels sans réponse."
    return f"Terminée (statut de la commande : {d.get('status')})."


class DispatchFlowDetailView(APIView):
    """Fiche d'une commande du flux avec tout son historique, expliqué en français."""
    permission_classes = [IsAuthenticated]

    def get(self, request, order_id):
        if not is_service_admin(request):
            return _forbidden()
        flow = _base().filter(order_id=order_id).first()
        if not flow:
            return Response({'detail': 'Commande hors du flux de dispatch.'}, status=404)
        events = list(flow.events.select_related('confirmateur'))
        names = {e.confirmateur_id: _name(e.confirmateur) for e in events if e.confirmateur_id}
        return Response({
            **_flow_rows([flow], timezone.now())[0],
            'events': [{'id': e.id, 'kind': e.kind, 'at': e.created_at, 'confirmateur': names.get(e.confirmateur_id),
                        'outcome': e.outcome, 'note': e.note, 'detail': e.detail, 'explanation': _explain(e, names)}
                       for e in events],
        })


# ─── Réglage des algorithmes ────────────────────────────────────────────────

def _config_row(cfg):
    return {
        'id': cfg.id, 'store': cfg.store_id, 'store_name': cfg.store.name if cfg.store_id else None,
        'date': cfg.date, 'weekday': cfg.weekday, 'algorithm': cfg.algorithm,
        'algorithm_label': ALGORITHMS.get(cfg.algorithm, (cfg.algorithm,))[0],
        'wait_minutes': cfg.wait_minutes, 'review_after': cfg.review_after,
        'fail_after_review': cfg.fail_after_review, 'max_open': cfg.max_open, 'weights': cfg.weights,
    }


def _int_in(value, low, high, label):
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValueError(f'{label} invalide.')
    if not low <= number <= high:
        raise ValueError(f'{label} : entre {low} et {high}.')
    return number


def _clean_config(data, partial=False):
    """(valeurs validées, erreur). En édition, seuls les champs présents sont validés."""
    out = {}
    try:
        if not partial or 'algorithm' in data:
            if data.get('algorithm') not in ALGORITHMS:
                raise ValueError('Algorithme inconnu.')
            out['algorithm'] = data['algorithm']
        if not partial or 'wait_minutes' in data:
            waits = data.get('wait_minutes', DEFAULT_WAIT_MINUTES)
            if not isinstance(waits, list) or not 1 <= len(waits) <= 10:
                raise ValueError('Délais : une liste de 1 à 10 valeurs (minutes).')
            out['wait_minutes'] = [_int_in(w, 1, 1440, 'Délai') for w in waits]
        for field, low, high, label in (('review_after', 1, 20, "Seuil « à traiter »"),
                                        ('fail_after_review', 1, 20, "Seuil d'échec"), ('max_open', 1, 50, 'Capacité')):
            if not partial or field in data:
                out[field] = _int_in(data.get(field, {'review_after': 4, 'fail_after_review': 4, 'max_open': 5}[field]),
                                     low, high, label)
        if 'weights' in data:
            weights = data.get('weights') or {}
            if not isinstance(weights, dict) or any(k not in DEFAULT_WEIGHTS for k in weights):
                raise ValueError('Poids inconnus.')
            out['weights'] = {k: float(_int_in(v, 0, 10, 'Poids')) for k, v in weights.items()}
    except ValueError as exc:
        return None, str(exc)
    return out, None


def _scope(data):
    """(store, date, weekday) validés ou erreur — jamais une date ET un jour en même temps."""
    store = None
    if data.get('store') not in (None, ''):
        store = Store.objects.filter(pk=data.get('store')).first() if str(data.get('store')).isdigit() else None
        if not store:
            return None, 'Boutique introuvable.'
    day = parse_date(str(data['date'])) if data.get('date') else None
    if data.get('date') and not day:
        return None, 'Date invalide.'
    weekday = None
    if data.get('weekday') not in (None, ''):
        try:
            weekday = _int_in(data.get('weekday'), 0, 6, 'Jour de la semaine')
        except ValueError as exc:
            return None, str(exc)
    if day and weekday is not None:
        return None, 'Choisissez une date OU un jour de la semaine, pas les deux.'
    return (store, day, weekday), None


class DispatchConfigListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_service_admin(request):
            return _forbidden()
        rows = PlatformDispatchConfig.objects.select_related('store').order_by('store_id', 'date', 'weekday', 'id')
        return Response([_config_row(r) for r in rows])

    def post(self, request):
        if not is_service_admin(request):
            return _forbidden()
        scope, err = _scope(request.data)
        values, verr = _clean_config(request.data)
        if err or verr:
            return Response({'detail': err or verr}, status=400)
        store, day, weekday = scope
        if PlatformDispatchConfig.objects.filter(store=store, date=day, weekday=weekday).exists():
            return Response({'detail': 'Un réglage existe déjà pour cette portée : modifiez-le.'}, status=409)
        cfg = PlatformDispatchConfig.objects.create(store=store, date=day, weekday=weekday, **values)
        return Response(_config_row(cfg), status=201)


class DispatchConfigDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        if not is_service_admin(request):
            return _forbidden()
        cfg = PlatformDispatchConfig.objects.select_related('store').filter(pk=pk).first()
        if not cfg:
            return Response({'detail': 'Réglage introuvable.'}, status=404)
        values, err = _clean_config(request.data, partial=True)
        if err:
            return Response({'detail': err}, status=400)
        for field, value in values.items():
            setattr(cfg, field, value)
        cfg.save()
        return Response(_config_row(cfg))

    def delete(self, request, pk):
        if not is_service_admin(request):
            return _forbidden()
        deleted, _ = PlatformDispatchConfig.objects.filter(pk=pk).delete()
        if not deleted:
            return Response({'detail': 'Réglage introuvable.'}, status=404)
        return Response(status=204)


class DispatchRunView(APIView):
    """Lance un passage du moteur à la demande (en plus de la tâche planifiée)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_service_admin(request):
            return _forbidden()
        return Response(dispatch.run_cycle())


# ─── Côté confirmateur ──────────────────────────────────────────────────────

class MyQueueCallView(APIView):
    """Le confirmateur déclare le résultat d'un appel raté : la commande repart en attente
    d'assignation (ou en échec définitif au bout du dernier essai)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, order_id):
        confirmateur = get_platform_confirmateur(request)
        if not confirmateur:
            return Response({'detail': 'Réservé aux confirmateurs du service de confirmation.'}, status=403)
        from orders.models import Order
        order = Order.objects.filter(pk=order_id, platform_assignment__confirmateur=confirmateur).first()
        if not order:
            return Response({'detail': 'Commande introuvable ou non assignée.'}, status=404)
        callback_at = None
        if request.data.get('callback_at'):
            callback_at = parse_datetime(str(request.data['callback_at']))
            if callback_at is None:
                return Response({'detail': 'Date de rappel invalide.'}, status=400)
            if timezone.is_naive(callback_at):
                callback_at = timezone.make_aware(callback_at)
        try:
            flow = dispatch.record_attempt(order, confirmateur, request.data.get('outcome'),
                                           note=str(request.data.get('note') or ''), callback_at=callback_at)
        except dispatch.DispatchError as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response({'order_id': order.id, 'state': flow.state, 'attempts': flow.attempts,
                         'available_at': flow.available_at})
