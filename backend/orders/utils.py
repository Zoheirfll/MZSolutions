def parse_period(request):
    """Plage de dates à partir de `?period=day|week|month|custom` (+ date_from/
    date_to pour custom) — même contrat que ConfirmationRateView, réutilisé
    par toutes les vues de statistiques (Epic 8.1) pour un comportement
    cohérent. Retourne (date_from, date_to, error_response|None)."""
    from datetime import date, timedelta
    from rest_framework.response import Response

    period = request.query_params.get('period', 'week')
    today  = date.today()
    if period == 'day':
        return today, today, None
    if period == 'month':
        return today - timedelta(days=30), today, None
    if period == 'custom':
        try:
            date_from = date.fromisoformat(request.query_params.get('date_from', str(today - timedelta(days=7))))
            date_to   = date.fromisoformat(request.query_params.get('date_to', str(today)))
        except ValueError:
            return None, None, Response({'detail': 'Format de date invalide (YYYY-MM-DD).'}, status=400)
        return date_from, date_to, None
    return today - timedelta(days=7), today, None  # week (défaut)


def order_channel(order):
    """Canal de vente déduit des données existantes (pas de champ dédié) :
    dropshipper si Order.dropshipper renseigné, sinon boutique en ligne si la
    première entrée d'historique n'a pas d'auteur (créée par PublicOrderView,
    système), sinon vente manuelle (créée par un membre authentifié). Requiert
    `order.dropshipper` et `order.history` déjà chargés/select_related pour
    éviter le N+1 (voir appelants)."""
    if order.dropshipper_id:
        name = f"{order.dropshipper.first_name} {order.dropshipper.last_name}".strip()
        return f"Dropshipper — {name}" if name else "Dropshipper"
    history = list(order.history.all())
    first_entry = history[0] if history else None
    if first_entry and first_entry.changed_by_id is None:
        return "Boutique en ligne"
    return "Vente manuelle"


def assign_order_round_robin(order):
    from team.models import TeamMember
    from .models import OrderAssignment

    confirmateurs = list(
        TeamMember.objects.filter(
            store=order.store,
            role='confirmateur',
            is_active=True,
            user__isnull=False,
        ).order_by('id')
    )

    if not confirmateurs:
        return None

    # Dernier assigné dans cette boutique
    last = (
        OrderAssignment.objects
        .filter(order__store=order.store, confirmateur__isnull=False)
        .order_by('-assigned_at')
        .select_related('confirmateur')
        .first()
    )

    if last and last.confirmateur:
        ids = [c.id for c in confirmateurs]
        try:
            idx = ids.index(last.confirmateur.id)
            next_idx = (idx + 1) % len(confirmateurs)
        except ValueError:
            next_idx = 0
    else:
        next_idx = 0

    assignment = OrderAssignment.objects.create(
        order        = order,
        confirmateur = confirmateurs[next_idx],
        assigned_by  = None,
    )
    return assignment
