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


def get_page_help(request, page_path):
    """Réutilise EXACTEMENT le même texte que le \"?\" de la page — jamais
    une description inventée par le modèle. Aucune permission spécifique,
    documentation générique du dashboard."""
    from .page_help import PAGE_HELP
    text = PAGE_HELP.get(page_path)
    if not text:
        needle = (page_path or '').strip('/').lower()
        for path, help_text in PAGE_HELP.items():
            if needle and needle in path.lower():
                return help_text
        return f"Aucune aide enregistrée pour « {page_path} »."
    return text


def compare_period(request, metric='orders', period='week'):
    """Compare une métrique à la période précédente équivalente — réutilise
    GlobalStatsView._summary (déjà appelée deux fois par cette vue pour ses
    propres deltas), jamais un chiffre isolé sans point de comparaison."""
    if not (is_owner_or_admin(request) or has_permission(request, 'stats_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    if metric not in ('orders', 'revenue', 'confirmation_rate', 'return_rate'):
        return "metric doit être 'orders', 'revenue', 'confirmation_rate' ou 'return_rate'."

    from datetime import date, timedelta
    from orders.stats_views import GlobalStatsView
    from orders.utils import previous_period

    days = {'day': 1, 'week': 7, 'month': 30}.get(period, 7)
    today = date.today()
    date_from = today - timedelta(days=days)
    prev_from, prev_to = previous_period(date_from, today)

    view = GlobalStatsView()
    current = view._summary(store, date_from, today)
    previous = view._summary(store, prev_from, prev_to)

    def extract(summary):
        if metric == 'orders':
            return summary['total_orders']
        if metric == 'revenue':
            return float(summary['revenue'])
        if metric == 'confirmation_rate':
            return summary['confirmation_rate']
        total = summary['total_orders']
        return round(summary['returned_count'] / total * 100, 1) if total else 0.0

    current_value = extract(current)
    previous_value = extract(previous)
    change_pct = round((current_value - previous_value) / previous_value * 100, 1) if previous_value else None
    return _serialize({
        'metric': metric, 'period': period,
        'current': current_value, 'previous': previous_value, 'change_pct': change_pct,
    })


def assess_product(request, name_or_id):
    """Synthèse d'un produit unique — agrège 3 modules déjà existants
    (jamais de nouveau calcul dupliqué) : marge/prix suggéré, rupture de
    stock estimée, score de mise en avant s'il en a un. Le prix
    d'achat/marge reste masqué sans purchase_prices_view, le reste répond
    quand même (même logique que ProductSerializer.cost_price)."""
    if not (is_owner_or_admin(request) or has_permission(request, 'products_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()

    product = None
    if str(name_or_id).isdigit():
        product = store.products.filter(pk=int(name_or_id)).first()
    if not product:
        product = store.products.filter(name__icontains=name_or_id).first()
    if not product:
        return f"Produit « {name_or_id} » introuvable."

    result = {'product_name': product.name, 'is_active': product.is_active, 'total_stock': product.total_stock}

    from datetime import timedelta
    from django.db.models import Sum
    from django.utils import timezone
    from products.models import StockMovement
    from products.stock_forecast import STOCKOUT_WINDOW_DAYS, days_until_stockout

    since = timezone.now() - timedelta(days=STOCKOUT_WINDOW_DAYS)
    units_sold_14d = abs(StockMovement.objects.filter(
        store=store, product=product, reason='order_sale', created_at__gte=since,
    ).aggregate(s=Sum('quantity'))['s'] or 0)
    result['days_until_stockout'] = days_until_stockout(product.total_stock, units_sold_14d)

    if is_owner_or_admin(request) or has_permission(request, 'purchase_prices_view'):
        from products.pricing import suggest_price
        result['pricing'] = suggest_price(store, product)

    from products.recommendations import products_to_promote
    promote_ids = {r['product'].id: r for r in products_to_promote(store)}
    if product.id in promote_ids:
        r = promote_ids[product.id]
        result['promote_score'] = r['score']
        result['margin_pct'] = r['margin_pct']

    return _serialize(result)


def get_store_audit_summary(request):
    """Renvoie le dernier audit boutique déjà calculé — ne le recalcule
    JAMAIS ici (éviterait un appel IA imbriqué dans un appel IA), invite à
    lancer l'audit depuis la page dédiée s'il n'existe pas encore."""
    if not (is_owner_or_admin(request) or has_permission(request, 'store_audit_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from stores.models import StoreAudit
    audit = StoreAudit.objects.filter(store=store).first()
    if not audit:
        return "Aucun audit n'a encore été calculé pour cette boutique — lancez « Analyser ma boutique » depuis /dashboard/audit-boutique."
    return _serialize({
        'global_score': audit.global_score,
        'catalogue_score': audit.catalogue_score,
        'logistics_score': audit.logistics_score,
        'stock_score': audit.stock_score,
        'returns_risk_score': audit.returns_risk_score,
        'synthesis': audit.synthesis,
        'computed_at': audit.computed_at,
    })


def get_price_suggestion(request, name_or_id):
    """Fourchette de prix suggérée (jamais un chiffre unique) pour un produit
    précis — réutilise products.pricing.suggest_price, même permission que
    l'affichage du prix d'achat (purchase_prices_view) puisque le calcul
    expose la marge/le coût du produit."""
    if not (is_owner_or_admin(request) or has_permission(request, 'purchase_prices_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()

    product = None
    if str(name_or_id).isdigit():
        product = store.products.filter(pk=int(name_or_id)).first()
    if not product:
        product = store.products.filter(name__icontains=name_or_id).first()
    if not product:
        return f"Produit « {name_or_id} » introuvable."

    from products.pricing import suggest_price
    result = suggest_price(store, product)
    result['product_name'] = product.name
    return _serialize(result)


def get_recommendations(request, section=None):
    """Moteur complet de recommandations produit — réutilise products.recommendations
    (aucun calcul dupliqué), même permission que RecommendationsPage.jsx.
    `section` optionnel ('promote'|'trending'|'bundles') pour ne renvoyer
    qu'une partie ; par défaut renvoie les trois."""
    if not (is_owner_or_admin(request) or has_permission(request, 'recommendations_view')):
        return _forbidden()
    store = get_store(request)
    if not store:
        return _forbidden()
    from products.recommendations import products_to_promote, trending_products, bundle_suggestions

    data = {}
    if section in (None, 'promote'):
        data['promote'] = [
            {'product_name': r['product'].name, 'margin_pct': r['margin_pct'],
             'total_stock': r['total_stock'], 'sales_rate_14d': r['sales_rate_14d'], 'score': r['score']}
            for r in products_to_promote(store)
        ]
    if section in (None, 'trending'):
        data['trending'] = [
            {'product_name': r['product'].name, 'recent_rate': r['recent_rate'],
             'prior_rate': r['prior_rate'], 'growth': r['growth']}
            for r in trending_products(store)
        ]
    if section in (None, 'bundles'):
        data['bundles'] = [
            {'product_name_a': r['product_a'].name, 'product_name_b': r['product_b'].name, 'count': r['count']}
            for r in bundle_suggestions(store)
        ]
    return _serialize(data)


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
    'get_recommendations': get_recommendations,
    'get_price_suggestion': get_price_suggestion,
    'compare_period': compare_period,
    'assess_product': assess_product,
    'get_store_audit_summary': get_store_audit_summary,
    'get_page_help': get_page_help,
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
    {
        'type': 'function',
        'function': {
            'name': 'get_page_help',
            'description': "Explique à quoi sert une page précise du dashboard, à partir de son chemin exact (ex: '/dashboard/produits', '/dashboard/stats/retours'). Utiliser quand le vendeur demande \"c'est quoi cette page ?\" ou \"à quoi sert X ?\".",
            'parameters': {
                'type': 'object',
                'properties': {'page_path': {'type': 'string', 'description': "Chemin exact de la page (ex: '/dashboard/produits')"}},
                'required': ['page_path'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'compare_period',
            'description': "Compare une métrique (orders/revenue/confirmation_rate/return_rate) à la période précédente équivalente. TOUJOURS utiliser cet outil avant de juger si un chiffre est \"normal\", \"bon\" ou \"inquiétant\" — jamais de jugement sans point de comparaison.",
            'parameters': {
                'type': 'object',
                'properties': {
                    'metric': {'type': 'string', 'description': "'orders', 'revenue', 'confirmation_rate' ou 'return_rate'"},
                    'period': {'type': 'string', 'description': "'day', 'week' ou 'month'"},
                },
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'assess_product',
            'description': "Synthèse complète d'un produit précis : marge/prix suggéré, rupture de stock estimée, score de mise en avant. Utiliser pour toute question du type \"ce produit est-il bon ?\" ou \"que penses-tu de X ?\" — ne jamais répondre à ce genre de question avec un seul autre outil isolé.",
            'parameters': {
                'type': 'object',
                'properties': {'name_or_id': {'type': 'string', 'description': 'Nom (ou fragment de nom) du produit'}},
                'required': ['name_or_id'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_store_audit_summary',
            'description': "Dernier audit global de la boutique déjà calculé (scores catalogue/logistique/stock/retours + synthèse). Utiliser pour toute question du type \"comment va ma boutique ?\" ou \"est-ce que je peux faire confiance à mes chiffres ?\". Ne recalcule jamais l'audit.",
            'parameters': {'type': 'object', 'properties': {}},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_price_suggestion',
            'description': "Fourchette de prix suggérée pour UN produit précis, basée sur son prix d'achat, sa marge actuelle comparée à la marge moyenne de la boutique, et l'évolution récente de son rythme de vente. Renvoie toujours une fourchette (jamais un chiffre unique) — utiliser pour toute question du type \"quel prix mettre sur X ?\" ou \"est-ce que je devrais changer le prix de X ?\".",
            'parameters': {
                'type': 'object',
                'properties': {'name_or_id': {'type': 'string', 'description': 'Nom (ou fragment de nom) du produit'}},
                'required': ['name_or_id'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_recommendations',
            'description': "Moteur de recommandations produit : produits à mettre en avant (marge/stock/vélocité), produits en tendance (croissance du rythme de vente), et associations de vente croisée (souvent achetés ensemble). Utiliser pour toute question du type \"quels produits dois-je mettre en avant/promouvoir ?\" ou \"quelles sont mes tendances ?\".",
            'parameters': {
                'type': 'object',
                'properties': {'section': {'type': 'string', 'description': "'promote', 'trending' ou 'bundles' (optionnel — vide renvoie les trois)"}},
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
