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
    import logging
    from .dispatch import fill_slots, start_flow
    from .models import PlatformConfirmationAccount

    try:
        account = order.store.platform_confirmation_account
    except PlatformConfirmationAccount.DoesNotExist:
        return False
    if not account.is_active:
        return False

    # Dispatch par flux (spec 2026-10-09) : la commande entre en « attente d'assignation », puis
    # l'algorithme de la boutique la distribue selon la capacité des confirmateurs. Si personne
    # n'est disponible elle reste en attente (page dédiée côté admin du service), sans repli
    # automatique sur le round-robin interne en mode 'replace'. Best-effort : une panne du
    # moteur ne doit jamais faire échouer la création de commande — la tâche planifiée
    # `dispatch_waiting_orders` rattrape.
    try:
        start_flow(order)
        fill_slots()
    except Exception:
        logging.getLogger(__name__).exception('Dispatch de la commande #%s en erreur', order.pk)

    return account.mode == 'replace'
