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
