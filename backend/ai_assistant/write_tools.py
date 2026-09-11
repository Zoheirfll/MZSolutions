"""Outils d'écriture exposés au chat libre — contrairement à tools.py
(lecture seule), chaque fonction ici ne modifie RIEN directement : elle
résout la cible, calcule le résultat avant/après, et enregistre une
AIPendingAction. Seul l'endpoint de confirmation (views.py,
PendingActionConfirmView) exécute réellement — jamais ces fonctions.

Vérification stricte `is_owner_or_admin` partout, JAMAIS
`OR has_permission(...)` — donner à l'IA un accès en écriture est une
élévation de privilège, non configurable pour confirmateur/dropshipper
(voir docs/superpowers/specs/2026-09-11-agent-ia-ecriture-design.md)."""
import json
from datetime import timedelta

from django.utils import timezone

from core.permissions import is_owner_or_admin, get_store

from .models import AIPendingAction, AIProductDraft

MAX_BULK_TARGETS = 50
PENDING_ACTION_TTL_MINUTES = 15


def _write_forbidden():
    return "Action réservée au propriétaire ou administrateur de la boutique."


def _create_pending_action(conversation, tool_name, summary, payload, target_ids):
    action = AIPendingAction.objects.create(
        conversation=conversation, tool_name=tool_name, summary=summary,
        payload=payload, target_ids=target_ids,
        expires_at=timezone.now() + timedelta(minutes=PENDING_ACTION_TTL_MINUTES),
    )
    return json.dumps({'status': 'en_attente_de_confirmation', 'action_id': action.id, 'summary': summary})


def propose_update_product(request, conversation, name_or_id, price=None, stock=None, is_active=None, category=None):
    if not is_owner_or_admin(request):
        return _write_forbidden()
    store = get_store(request)
    if not store:
        return _write_forbidden()

    product = None
    if str(name_or_id).isdigit():
        product = store.products.filter(pk=int(name_or_id)).first()
    if not product:
        product = store.products.filter(name__icontains=name_or_id).first()
    if not product:
        return f"Produit « {name_or_id} » introuvable."

    before = {
        'price': float(product.price), 'stock': product.stock, 'is_active': product.is_active,
        'categories': [c.name for c in product.categories.all()],
    }
    after = dict(before)
    changes_desc = []
    if price is not None:
        after['price'] = float(price)
        changes_desc.append(f"prix {before['price']} → {after['price']}")
    if stock is not None:
        after['stock'] = int(stock)
        changes_desc.append(f"stock {before['stock']} → {after['stock']}")
    if is_active is not None:
        after['is_active'] = bool(is_active)
        changes_desc.append(f"statut → {'actif' if after['is_active'] else 'inactif'}")
    if category is not None:
        after['categories'] = [category]
        changes_desc.append(f"catégorie → {category}")
    if not changes_desc:
        return "Aucun changement demandé."

    summary = f"Modifier « {product.name} » : {', '.join(changes_desc)}"
    payload = [{'id': product.id, 'name': product.name, 'before': before, 'after': after}]
    return _create_pending_action(conversation, 'propose_update_product', summary, payload, [product.id])


def propose_bulk_update_products(request, conversation, category=None, is_active_filter=None, price=None, stock=None, is_active=None):
    if not is_owner_or_admin(request):
        return _write_forbidden()
    store = get_store(request)
    if not store:
        return _write_forbidden()

    qs = store.products.all()
    if category:
        qs = qs.filter(categories__name__icontains=category)
    if is_active_filter is not None:
        qs = qs.filter(is_active=bool(is_active_filter))
    products = list(qs.distinct()[:MAX_BULK_TARGETS + 1])
    if len(products) > MAX_BULK_TARGETS:
        return f"Plus de {MAX_BULK_TARGETS} produits correspondent à ce filtre — affinez-le (catégorie/statut) avant de proposer une action en masse."
    if not products:
        return "Aucun produit ne correspond à ce filtre."

    changes_desc = []
    if price is not None:
        changes_desc.append(f"prix → {price}")
    if stock is not None:
        changes_desc.append(f"stock → {stock}")
    if is_active is not None:
        changes_desc.append(f"statut → {'actif' if is_active else 'inactif'}")
    if not changes_desc:
        return "Aucun changement demandé."

    payload = []
    for p in products:
        before = {'price': float(p.price), 'stock': p.stock, 'is_active': p.is_active}
        after = dict(before)
        if price is not None:
            after['price'] = float(price)
        if stock is not None:
            after['stock'] = int(stock)
        if is_active is not None:
            after['is_active'] = bool(is_active)
        payload.append({'id': p.id, 'name': p.name, 'before': before, 'after': after})

    summary = f"Modifier {len(products)} produits ({', '.join(changes_desc)})"
    return _create_pending_action(conversation, 'propose_bulk_update_products', summary, payload, [p.id for p in products])


def propose_create_product(request, conversation, name, price, description='', category=None):
    if not is_owner_or_admin(request):
        return _write_forbidden()
    store = get_store(request)
    if not store:
        return _write_forbidden()
    if not name or price is None:
        return "Le nom et le prix sont requis pour créer un produit."

    extracted = {'name': name, 'price': float(price), 'description': description, 'category': category}
    draft = AIProductDraft.objects.create(store=store, source='chat_text', extracted_data=extracted)
    summary = f"Créer le produit « {name} » à {price}"
    payload = [{'id': None, 'name': name, 'before': None, 'after': extracted}]
    return _create_pending_action(conversation, 'propose_create_product', summary, payload, [draft.id])


def propose_update_order_status(request, conversation, order_number, new_status, note=''):
    if not is_owner_or_admin(request):
        return _write_forbidden()
    store = get_store(request)
    if not store:
        return _write_forbidden()

    from orders.models import STATUS_CHOICES
    valid_statuses = dict(STATUS_CHOICES)
    if new_status not in valid_statuses:
        return f"Statut « {new_status} » invalide."

    try:
        order = store.orders.get(pk=int(order_number))
    except (ValueError, TypeError):
        return f"Numéro de commande « {order_number} » invalide."
    except store.orders.model.DoesNotExist:
        return f"Commande #{order_number} introuvable."

    if order.status == new_status:
        return f"La commande #{order.id} est déjà au statut « {valid_statuses[new_status]} »."

    summary = f"Commande #{order.id} : statut « {valid_statuses[order.status]} » → « {valid_statuses[new_status]} »"
    payload = [{
        'id': order.id, 'name': f"Commande #{order.id}",
        'before': {'status': order.status},
        'after': {'status': new_status, 'note': note},
    }]
    return _create_pending_action(conversation, 'propose_update_order_status', summary, payload, [order.id])


WRITE_TOOL_REGISTRY = {
    'propose_update_product': propose_update_product,
    'propose_bulk_update_products': propose_bulk_update_products,
    'propose_create_product': propose_create_product,
    'propose_update_order_status': propose_update_order_status,
}

WRITE_TOOL_DEFINITIONS = [
    {
        'type': 'function',
        'function': {
            'name': 'propose_update_product',
            'description': "Propose de modifier un produit existant (prix, stock, statut actif/inactif, catégorie) — nécessite une confirmation humaine, n'écrit rien directement.",
            'parameters': {
                'type': 'object',
                'properties': {
                    'name_or_id': {'type': 'string', 'description': 'Nom (ou fragment de nom) du produit à modifier'},
                    'price': {'type': 'number', 'description': 'Nouveau prix (optionnel)'},
                    'stock': {'type': 'integer', 'description': 'Nouveau stock (optionnel)'},
                    'is_active': {'type': 'boolean', 'description': 'Nouveau statut actif/inactif (optionnel)'},
                    'category': {'type': 'string', 'description': 'Nouvelle catégorie unique à assigner (optionnel)'},
                },
                'required': ['name_or_id'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'propose_bulk_update_products',
            'description': "Propose de modifier plusieurs produits à la fois, filtrés par catégorie et/ou statut actif (max 50 produits par action) — nécessite une confirmation humaine.",
            'parameters': {
                'type': 'object',
                'properties': {
                    'category': {'type': 'string', 'description': 'Filtrer par nom de catégorie (optionnel)'},
                    'is_active_filter': {'type': 'boolean', 'description': 'Filtrer sur le statut actuel actif/inactif (optionnel)'},
                    'price': {'type': 'number', 'description': 'Nouveau prix à appliquer à tous (optionnel)'},
                    'stock': {'type': 'integer', 'description': 'Nouveau stock à appliquer à tous (optionnel)'},
                    'is_active': {'type': 'boolean', 'description': 'Nouveau statut à appliquer à tous (optionnel)'},
                },
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'propose_create_product',
            'description': "Propose de créer un nouveau produit à partir d'une description texte (sans photo) — nécessite une confirmation humaine.",
            'parameters': {
                'type': 'object',
                'properties': {
                    'name': {'type': 'string', 'description': 'Nom du produit'},
                    'price': {'type': 'number', 'description': 'Prix de vente'},
                    'description': {'type': 'string', 'description': 'Description (optionnel)'},
                    'category': {'type': 'string', 'description': 'Catégorie (optionnel)'},
                },
                'required': ['name', 'price'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'propose_update_order_status',
            'description': "Propose de changer le statut d'UNE commande précise, désignée par son numéro exact (jamais par nom de client) — nécessite une confirmation humaine. Pas d'action en masse sur les commandes.",
            'parameters': {
                'type': 'object',
                'properties': {
                    'order_number': {'type': 'string', 'description': 'Numéro exact de la commande'},
                    'new_status': {'type': 'string', 'description': "Nouveau statut (ex: 'confirmed', 'shipped', 'cancelled')"},
                    'note': {'type': 'string', 'description': 'Note optionnelle à joindre au changement de statut'},
                },
                'required': ['order_number', 'new_status'],
            },
        },
    },
]


def execute_write_tool(request, conversation, name, arguments):
    fn = WRITE_TOOL_REGISTRY.get(name)
    if not fn:
        return f"Outil inconnu : {name}"
    try:
        return fn(request, conversation, **arguments)
    except TypeError:
        return fn(request, conversation)
