"""Routing automatique des commandes vers les confirmateurs du superadmin
(V2) — appelé depuis orders.utils.dispatch_confirmateur_for_order_with_platform,
jamais directement depuis orders/views.py (évite tout import circulaire au
niveau module entre orders et platform_admin)."""


def route_order(order):
    """Si la boutique de `order` a activé le service de confirmation
    (PlatformConfirmationAccount.is_active=True), assigne round-robin un
    confirmateur du superadmin parmi ceux actifs pour cette boutique
    (PlatformConfirmateurAssignment.is_active=True). Retourne True si le
    round-robin INTERNE (team.TeamMember) doit être sauté — uniquement en
    mode 'replace' ; en mode 'augment' les deux coexistent, chacun avec sa
    propre assignation (OrderAssignment vs PlatformOrderAssignment)."""
    from .models import PlatformConfirmationAccount, PlatformConfirmateurAssignment, PlatformOrderAssignment

    try:
        account = order.store.platform_confirmation_account
    except PlatformConfirmationAccount.DoesNotExist:
        return False
    if not account.is_active:
        return False

    candidates = list(
        PlatformConfirmateurAssignment.objects
        .filter(account=account, is_active=True, confirmateur__is_active=True, confirmateur__user__isnull=False)
        .select_related('confirmateur')
        .order_by('id')
    )
    if candidates:
        last = (
            PlatformOrderAssignment.objects
            .filter(order__store=order.store)
            .order_by('-assigned_at')
            .first()
        )
        ids = [a.confirmateur_id for a in candidates]
        if last and last.confirmateur_id in ids:
            next_idx = (ids.index(last.confirmateur_id) + 1) % len(ids)
        else:
            next_idx = 0
        chosen = candidates[next_idx].confirmateur
        PlatformOrderAssignment.objects.create(order=order, confirmateur=chosen)
    # Si aucun candidat actif : la commande reste non assignée côté
    # superadmin, comme le fallback documenté pour le round-robin interne
    # (team.online_confirmateurs_queryset) — pas de repli automatique sur
    # le round-robin classique en mode 'replace'.

    return account.mode == 'replace'
