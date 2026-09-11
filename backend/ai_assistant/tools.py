"""Tools exposés au chat libre (function calling Ollama). Chaque fonction
réplique EXACTEMENT la formule de permission de l'endpoint REST équivalent —
jamais d'exception : un confirmateur sans `stock_view` ne doit jamais
recevoir cette donnée via l'IA alors qu'il ne l'aurait pas via l'UI normale."""
import json

from core.permissions import is_owner_or_admin, has_permission, get_store


def _forbidden():
    return "Vous n'avez pas la permission de consulter ces données."


def _serialize(obj):
    return json.dumps(obj, default=str, ensure_ascii=False)


def get_orders_summary(request, wilaya=None):
    if not (is_owner_or_admin(request) or has_permission(request, 'orders_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    qs = store.orders.all()
    if wilaya:
        qs = qs.filter(wilaya__icontains=wilaya)
    from django.db.models import Count
    counts = dict(qs.values_list('status').annotate(c=Count('id')).order_by())
    return _serialize({'total': qs.count(), 'by_status': counts})


def get_low_stock(request):
    if not (is_owner_or_admin(request) or has_permission(request, 'stock_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    try:
        threshold = store.settings.low_stock_threshold
    except Exception:
        threshold = 5
    # `Product.stock` reste intentionnellement à 0 pour un produit à
    # variantes (le vrai stock vit sur VariantOption/VariantSubOption) — un
    # filtre direct sur ce champ signalerait à tort ces produits comme
    # épuisés. `total_stock` (propriété du modèle) résout déjà correctement
    # produit simple vs. variantes vs. sous-variantes, comme LowStockView.
    products = []
    qs = store.products.prefetch_related('variants__options__sub_options').filter(is_active=True)
    for p in qs:
        stock = p.total_stock
        if stock <= threshold:
            products.append({'name': p.name, 'stock': stock})
        if len(products) >= 20:
            break
    return _serialize({'threshold': threshold, 'products': products})


def get_inventory(request, search=None):
    """Inventaire complet (pas seulement le stock bas) — mêmes permission et
    résolution de stock (total_stock) que get_low_stock, gate 'stock_view'
    comme InventoryListView (products/views.py)."""
    if not (is_owner_or_admin(request) or has_permission(request, 'stock_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    qs = store.products.prefetch_related('variants__options__sub_options').filter(is_active=True)
    if search:
        qs = qs.filter(name__icontains=search)
    products = [{'name': p.name, 'stock': p.total_stock, 'price': float(p.price), 'is_active': p.is_active} for p in qs[:30]]
    return _serialize({'count': qs.count(), 'products': products})


def get_at_risk_clients(request):
    if not (is_owner_or_admin(request) or has_permission(request, 'clients_risk_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from orders.models import CustomerRisk
    risky = list(CustomerRisk.objects.filter(store=store, manual_risk=True).values('phone', 'note')[:20])
    return _serialize({'manually_flagged': risky})


def get_incomplete_products(request):
    """Réutilise le calcul de l'audit boutique (stores/audit.py) — jamais de
    duplication de la logique de complétude catalogue."""
    if not (is_owner_or_admin(request) or has_permission(request, 'products_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from stores.audit import _catalogue_score
    result = _catalogue_score(store)
    d = result['details']
    if not d.get('active_products'):
        return _serialize({'active_products': 0})
    return _serialize({
        'active_products': d['active_products'],
        'missing_image': [p['name'] for p in d['missing_image'][:15]],
        'missing_description': [p['name'] for p in d['missing_description'][:15]],
        'missing_cost_price': [p['name'] for p in d['missing_cost_price'][:15]],
        'missing_category': [p['name'] for p in d['missing_category'][:15]],
    })


def get_team_summary(request):
    if not (is_owner_or_admin(request) or has_permission(request, 'team_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    members = store.team_members.filter(is_active=True)
    return _serialize({'members': [
        {'name': f"{m.first_name} {m.last_name}".strip(), 'role': m.role, 'online': m.is_currently_online}
        for m in members
    ]})


def get_confirmateur_performance(request, name):
    if not (is_owner_or_admin(request) or has_permission(request, 'confirmateur_monitoring_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    member = store.team_members.filter(role='confirmateur', is_active=True, first_name__icontains=name).first()
    if not member:
        return f"Confirmateur « {name} » introuvable."
    from team.monitoring import compute_confirmateur_detail
    return _serialize(compute_confirmateur_detail(store, member))


class _RequestShim:
    """Fait passer un objet minimal (.user/.query_params) à une vue REST
    existante sans reconstruire une vraie requête HTTP — réutilisé par tous
    les outils qui délèguent leur calcul à une vue déjà en place plutôt que
    de dupliquer sa logique."""
    def __init__(self, user, query_params):
        self.user = user
        self.query_params = query_params


def get_profitability_summary(request, period_start=None, period_end=None):
    if not (is_owner_or_admin(request) or has_permission(request, 'profitability_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from finance.views import ProfitabilitySummaryView
    view = ProfitabilitySummaryView()
    resp = view.get(_RequestShim(request.user, {'period_start': period_start or '', 'period_end': period_end or ''}))
    return _serialize(resp.data if resp.status_code == 200 else {'error': 'indisponible'})


def get_returns_summary(request, period='week'):
    if not (is_owner_or_admin(request) or has_permission(request, 'stats_returns_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from orders.stats_views import ReturnsStatsView
    view = ReturnsStatsView()
    resp = view.get(_RequestShim(request.user, {'period': period}))
    if resp.status_code != 200:
        return _serialize({'error': 'indisponible'})
    return _serialize({'return_rate': resp.data['return_rate'], 'returned_count': resp.data['returned_count'], 'total_orders': resp.data['total_orders']})


def get_pending_exchanges(request):
    if not (is_owner_or_admin(request) or has_permission(request, 'exchanges_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from orders.models import ExchangeRequest
    qs = ExchangeRequest.objects.filter(store=store, status='open')
    items = [{'id': e.id, 'reason': e.reason} for e in qs[:20]]
    return _serialize({'count': qs.count(), 'exchanges': items})


def get_open_complaints(request):
    if not (is_owner_or_admin(request) or has_permission(request, 'inbox_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from inbox.models import Conversation
    qs = Conversation.objects.filter(store=store, status__in=['open', 'in_progress'])
    return _serialize({'count': qs.count()})


def get_costs_summary(request, period_start=None, period_end=None):
    if not (is_owner_or_admin(request) or has_permission(request, 'costs_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from finance.models import Cost
    qs = Cost.objects.filter(store=store)
    if period_start:
        qs = qs.filter(period_end__gte=period_start)
    if period_end:
        qs = qs.filter(period_start__lte=period_end)
    from django.db.models import Sum
    by_category = dict(qs.values_list('category').annotate(s=Sum('amount')).order_by())
    total = sum(by_category.values()) if by_category else 0
    return _serialize({'total': float(total), 'by_category': {k: float(v) for k, v in by_category.items()}})


def get_payments_summary(request, state='ready'):
    if state not in ('ready', 'collected'):
        state = 'ready'
    if not (is_owner_or_admin(request) or has_permission(request, 'payments_ready_view') or has_permission(request, 'payments_collected_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from finance.views import _payments_summary
    return _serialize(_payments_summary(store, None, None, state))


def get_subscription_status(request):
    if not is_owner_or_admin(request):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    quota = store.quota
    return _serialize({
        'orders_used': quota.orders_used, 'orders_limit': quota.orders_limit,
        'orders_remaining': quota.orders_remaining, 'is_trial_active': quota.is_trial_active,
        'plan': quota.plan.name if quota.plan else None,
    })


TOOL_REGISTRY = {
    'get_orders_summary': get_orders_summary,
    'get_low_stock': get_low_stock,
    'get_inventory': get_inventory,
    'get_at_risk_clients': get_at_risk_clients,
    'get_profitability_summary': get_profitability_summary,
    'get_incomplete_products': get_incomplete_products,
    'get_team_summary': get_team_summary,
    'get_confirmateur_performance': get_confirmateur_performance,
    'get_returns_summary': get_returns_summary,
    'get_pending_exchanges': get_pending_exchanges,
    'get_open_complaints': get_open_complaints,
    'get_costs_summary': get_costs_summary,
    'get_payments_summary': get_payments_summary,
    'get_subscription_status': get_subscription_status,
}

TOOL_DEFINITIONS = [
    {
        'type': 'function',
        'function': {
            'name': 'get_orders_summary',
            'description': "Nombre de commandes de la boutique, ventilé par statut. Optionnellement filtré par wilaya.",
            'parameters': {
                'type': 'object',
                'properties': {'wilaya': {'type': 'string', 'description': 'Nom de wilaya (optionnel)'}},
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_low_stock',
            'description': "Liste des produits en stock bas (sous le seuil d'alerte de la boutique).",
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_inventory',
            'description': "Inventaire complet de la boutique (tous les produits actifs et leur stock actuel), pas seulement ceux en stock bas. Utiliser quand on demande le stock total/complet, ou le stock d'un produit précis (via `search`).",
            'parameters': {
                'type': 'object',
                'properties': {'search': {'type': 'string', 'description': 'Filtre par nom de produit (optionnel)'}},
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_at_risk_clients',
            'description': "Clients marqués manuellement à risque.",
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_incomplete_products',
            'description': "Produits actifs dont la fiche est incomplète (sans image, sans description, sans prix d'achat, ou sans catégorie).",
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_team_summary',
            'description': "Liste des membres actifs de l'équipe (nom, rôle, en ligne ou non).",
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_confirmateur_performance',
            'description': "Performance et signaux d'anomalie d'un confirmateur précis, par son prénom.",
            'parameters': {
                'type': 'object',
                'properties': {'name': {'type': 'string', 'description': 'Prénom du confirmateur'}},
                'required': ['name'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_profitability_summary',
            'description': "Résumé de rentabilité (revenus, coûts, profit net) sur une période.",
            'parameters': {
                'type': 'object',
                'properties': {
                    'period_start': {'type': 'string', 'description': 'YYYY-MM-DD'},
                    'period_end': {'type': 'string', 'description': 'YYYY-MM-DD'},
                },
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_returns_summary',
            'description': "Taux de retour et nombre de commandes retournées sur une période (day/week/month).",
            'parameters': {'type': 'object', 'properties': {'period': {'type': 'string', 'description': "'day', 'week' ou 'month'"}}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_pending_exchanges',
            'description': "Demandes d'échange en attente de validation.",
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_open_complaints',
            'description': "Nombre de réclamations ouvertes ou en cours dans la boîte de réception.",
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_costs_summary',
            'description': "Coûts opérationnels/marketing enregistrés, ventilés par catégorie, sur une période.",
            'parameters': {
                'type': 'object',
                'properties': {
                    'period_start': {'type': 'string', 'description': 'YYYY-MM-DD'},
                    'period_end': {'type': 'string', 'description': 'YYYY-MM-DD'},
                },
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_payments_summary',
            'description': "Indicateurs de paiement COD ('ready' = prêt à recevoir, 'collected' = déjà récupéré).",
            'parameters': {'type': 'object', 'properties': {'state': {'type': 'string', 'description': "'ready' ou 'collected'"}}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_subscription_status',
            'description': "Quota de commandes restant et palier d'abonnement actuel de la boutique.",
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
]


def execute_tool(request, name, arguments):
    fn = TOOL_REGISTRY.get(name)
    if not fn:
        return f"Outil inconnu : {name}"
    try:
        return fn(request, **arguments)
    except TypeError:
        return fn(request)


# ─────────────────────────────────────────────────────────────────────────
# Tools du chatbot BOUTIQUE PUBLIQUE (canal anonyme, sans authentification)
# — registre et définitions STRICTEMENT séparés des tools dashboard
# ci-dessus. Chaque fonction reçoit `store` (déjà résolu par la vue
# appelante via le slug de l'URL), jamais `request` : ces tools n'ont
# aucune notion d'utilisateur authentifié ni de permission à vérifier.
# ─────────────────────────────────────────────────────────────────────────

def public_search_products(store, query=''):
    qs = store.products.filter(is_active=True)
    if query:
        qs = qs.filter(name__icontains=query)
    results = []
    for p in qs[:5]:
        promo = p.active_auto_promotion()
        entry = {'name': p.name, 'price': float(p.price), 'stock': p.total_stock}
        if promo:
            entry['promo_price'] = float(p.price) - float(promo.compute_discount(p.price))
        results.append(entry)
    return _serialize({'products': results})


def public_get_order_status(store, phone, order_id):
    generic_not_found = "Aucune commande trouvée avec ces informations."
    if not phone or not order_id:
        return generic_not_found
    try:
        order = store.orders.get(pk=order_id, phone=phone)
    except (store.orders.model.DoesNotExist, ValueError, TypeError):
        return generic_not_found
    return _serialize({
        'status': order.get_status_display(),
        'tracking_number': order.carrier_tracking_number or None,
        'wilaya': order.wilaya,
        'commune': order.commune or None,
        'total': float(order.total),
    })


PUBLIC_TOOL_REGISTRY = {
    'public_search_products': public_search_products,
    'public_get_order_status': public_get_order_status,
}

PUBLIC_TOOL_DEFINITIONS = [
    {
        'type': 'function',
        'function': {
            'name': 'public_search_products',
            'description': "Recherche des produits actifs de la boutique par nom (prix, stock disponible, promotion active si applicable).",
            'parameters': {
                'type': 'object',
                'properties': {'query': {'type': 'string', 'description': 'Terme de recherche (nom de produit, optionnel — vide retourne les 5 premiers produits actifs)'}},
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'public_get_order_status',
            'description': "Statut d'une commande — nécessite OBLIGATOIREMENT le numéro de téléphone ET le numéro de commande, jamais l'un sans l'autre.",
            'parameters': {
                'type': 'object',
                'properties': {
                    'phone': {'type': 'string', 'description': 'Numéro de téléphone utilisé pour la commande'},
                    'order_id': {'type': 'string', 'description': 'Numéro de commande'},
                },
                'required': ['phone', 'order_id'],
            },
        },
    },
]


def execute_public_tool(store, name, arguments):
    fn = PUBLIC_TOOL_REGISTRY.get(name)
    if not fn:
        return f"Outil inconnu : {name}"
    try:
        return fn(store, **arguments)
    except TypeError:
        return fn(store)
