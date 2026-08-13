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


def previous_period(date_from, date_to):
    """Période précédente de même durée, immédiatement avant `date_from` —
    utilisé par les vues de statistiques (Epic 8.1) pour calculer une
    tendance (+X%/-X%) par rapport à la période comparable précédente."""
    from datetime import timedelta

    span = (date_to - date_from).days
    prev_to = date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=span)
    return prev_from, prev_to


def send_abandoned_cart_email(store, cart):
    """Envoie l'email de relance panier abandonné — factorisé pour être appelé
    aussi bien par la relance automatique (management command
    send_abandoned_cart_reminders) que par une relance manuelle immédiate
    depuis AbandonedCartsPage.jsx (bouton "Relancer" → "Par email")."""
    from django.core.mail import send_mail
    from django.conf import settings

    # item['price'] est stocké tel quel dans le JSONField, potentiellement en
    # chaîne (ex. '3600.0000', reçu du frontend) — jamais faire confiance au
    # type, toujours forcer la conversion avant le formatage numérique.
    def _price(item):
        try:
            return float(item.get('price', 0) or 0)
        except (TypeError, ValueError):
            return 0.0

    items_lines = "\n".join(
        f"  - {item.get('product_name', '?')} x{item.get('quantity', 1)} — {_price(item):,.0f} DA"
        for item in (cart.items or [])
    )
    store_url = f"{settings.FRONTEND_URL}/store/{store.slug}"
    subject = f"Vous avez oublié des articles dans votre panier — {store.name}"
    message = (
        f"Bonjour {cart.first_name or 'client'},\n\n"
        f"Vous avez laissé des articles dans votre panier sur {store.name} :\n\n"
        f"{items_lines}\n\n"
        f"Total : {cart.total:,.0f} DA\n\n"
        f"Finalisez votre commande ici : {store_url}\n\n"
        f"— L'équipe {store.name}"
    )
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[cart.email],
        fail_silently=False,
    )


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


def _matching_dispatch_rule(order, field):
    """Première règle active correspondant à cette commande (produit d'abord,
    puis wilaya), avec `field` ('confirmateur' ou 'carrier') renseigné. None
    si aucune règle ne matche — l'appelant retombe sur le comportement par
    défaut (round-robin / transporteur par défaut)."""
    from .models import DispatchRule
    rules = (DispatchRule.objects
             .filter(store=order.store, is_active=True)
             .exclude(**{f'{field}__isnull': True})
             .select_related(field))
    product_rules = [r for r in rules if r.match_type == 'product']
    wilaya_rules  = [r for r in rules if r.match_type == 'wilaya']

    if product_rules:
        item_names = [i.product_name.lower() for i in order.items.all()]
        for rule in product_rules:
            needle = rule.match_value.lower().strip()
            if any(needle in name for name in item_names):
                return getattr(rule, field)

    if wilaya_rules and order.wilaya:
        for rule in wilaya_rules:
            if rule.match_value.strip().lower() == order.wilaya.strip().lower():
                return getattr(rule, field)

    return None


def dispatch_confirmateur_for_order(order):
    """Assigne un confirmateur — priorité à une règle de dispatch active
    (produit puis wilaya) correspondant à la commande, sinon round-robin
    classique (comportement inchangé)."""
    from .models import OrderAssignment
    confirmateur = _matching_dispatch_rule(order, 'confirmateur')
    if confirmateur and confirmateur.is_active:
        return OrderAssignment.objects.create(order=order, confirmateur=confirmateur, assigned_by=None)
    return assign_order_round_robin(order)


def dispatch_carrier_for_order(order, default_account):
    """Transporteur à utiliser pour l'expédition — priorité à une règle de
    dispatch active correspondant à la commande, sinon `default_account`
    (transporteur par défaut de la boutique, comportement inchangé)."""
    carrier = _matching_dispatch_rule(order, 'carrier')
    if carrier and carrier.is_active:
        return carrier
    return default_account


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


def assign_complaint_round_robin(complaint):
    """Même logique round-robin que assign_order_round_robin, mais avec son
    propre curseur (ComplaintAssignment) — un confirmateur très sollicité sur
    les commandes ne doit pas être systématiquement écarté des réclamations."""
    from team.models import TeamMember
    from .models import ComplaintAssignment

    confirmateurs = list(
        TeamMember.objects.filter(
            store=complaint.store,
            role='confirmateur',
            is_active=True,
            user__isnull=False,
        ).order_by('id')
    )

    if not confirmateurs:
        return None

    last = (
        ComplaintAssignment.objects
        .filter(complaint__store=complaint.store, confirmateur__isnull=False)
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

    return ComplaintAssignment.objects.create(
        complaint    = complaint,
        confirmateur = confirmateurs[next_idx],
        assigned_by  = None,
    )
