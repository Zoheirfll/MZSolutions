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
    products = [{'name': p.name, 'stock': p.total_stock} for p in qs[:30]]
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


def get_profitability_summary(request, period_start=None, period_end=None):
    if not (is_owner_or_admin(request) or has_permission(request, 'profitability_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from finance.views import ProfitabilitySummaryView

    class _Shim:
        def __init__(self, user, period_start, period_end):
            self.user = user
            self.query_params = {'period_start': period_start or '', 'period_end': period_end or ''}

    view = ProfitabilitySummaryView()
    resp = view.get(_Shim(request.user, period_start, period_end))
    return _serialize(resp.data if resp.status_code == 200 else {'error': 'indisponible'})


TOOL_REGISTRY = {
    'get_orders_summary': get_orders_summary,
    'get_low_stock': get_low_stock,
    'get_inventory': get_inventory,
    'get_at_risk_clients': get_at_risk_clients,
    'get_profitability_summary': get_profitability_summary,
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
]


def execute_tool(request, name, arguments):
    fn = TOOL_REGISTRY.get(name)
    if not fn:
        return f"Outil inconnu : {name}"
    try:
        return fn(request, **arguments)
    except TypeError:
        return fn(request)
