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


def propose_toggle_team_member(request, conversation, name_or_email, is_active):
    """Active/désactive un membre d'équipe DÉJÀ EXISTANT — jamais d'invitation
    directe par l'IA (créer un compte envoie un email réel à un tiers,
    action trop lourde pour être déléguée sans qu'un humain choisisse
    explicitement le destinataire sur TeamPage.jsx)."""
    if not is_owner_or_admin(request):
        return _write_forbidden()
    store = get_store(request)
    if not store:
        return _write_forbidden()

    member = store.team_members.filter(email__iexact=name_or_email).first()
    if not member:
        member = store.team_members.filter(first_name__icontains=name_or_email).first()
    if not member:
        return f"Membre d'équipe « {name_or_email} » introuvable."

    before = {'is_active': member.is_active}
    after = {'is_active': bool(is_active)}
    if before == after:
        return f"{member.first_name} {member.last_name} est déjà {'actif' if is_active else 'inactif'}."

    summary = f"{'Activer' if is_active else 'Désactiver'} {member.first_name} {member.last_name} ({member.role})"
    payload = [{'id': member.id, 'name': f"{member.first_name} {member.last_name}", 'before': before, 'after': after}]
    return _create_pending_action(conversation, 'propose_toggle_team_member', summary, payload, [member.id])


def propose_update_carrier_default(request, conversation, carrier_name):
    """Change le transporteur par défaut parmi les comptes DÉJÀ CONNECTÉS et
    actifs — ne crée jamais de nouveau compte transporteur (clé API trop
    sensible pour être saisie via un chat)."""
    if not is_owner_or_admin(request):
        return _write_forbidden()
    store = get_store(request)
    if not store:
        return _write_forbidden()

    account = store.carrier_accounts.filter(carrier__icontains=carrier_name, is_active=True).first()
    if not account:
        account = store.carrier_accounts.filter(name__icontains=carrier_name, is_active=True).first()
    if not account:
        return f"Aucun compte transporteur actif correspondant à « {carrier_name} » — il doit d'abord être connecté depuis Paramètres livraison."
    if account.is_default:
        return f"{account.get_carrier_display()} est déjà le transporteur par défaut."

    current_default = store.carrier_accounts.filter(is_default=True).first()
    summary = f"Transporteur par défaut → {account.get_carrier_display()}"
    payload = [{
        'id': account.id, 'name': account.get_carrier_display(),
        'before': {'default_carrier': current_default.get_carrier_display() if current_default else None},
        'after': {'default_carrier': account.get_carrier_display()},
    }]
    return _create_pending_action(conversation, 'propose_update_carrier_default', summary, payload, [account.id])


def _resolve_wilaya(wilaya_name_input):
    from orders.wilaya_codes import WILAYA_CODES
    needle = (wilaya_name_input or '').strip().lower()
    for name, code in WILAYA_CODES.items():
        if name.lower() == needle:
            return name, code
    for name, code in WILAYA_CODES.items():
        if needle in name.lower():
            return name, code
    return None, None


def propose_update_wilaya_rate(request, conversation, wilaya_name, home_price=None, desk_price=None):
    if not is_owner_or_admin(request):
        return _write_forbidden()
    store = get_store(request)
    if not store:
        return _write_forbidden()
    if home_price is None and desk_price is None:
        return "Indiquez au moins un tarif (domicile ou point relais) à mettre à jour."

    resolved_name, wilaya_id = _resolve_wilaya(wilaya_name)
    if not resolved_name:
        return f"Wilaya « {wilaya_name} » introuvable."

    from orders.models import WilayaRate
    existing = store.wilaya_rates.filter(wilaya_id=wilaya_id).first()
    before = {
        'home_price': float(existing.home_price) if existing else None,
        'desk_price': float(existing.desk_price) if existing and existing.desk_price is not None else None,
    }
    after = dict(before)
    if home_price is not None:
        after['home_price'] = float(home_price)
    if desk_price is not None:
        after['desk_price'] = float(desk_price)

    summary = f"Tarif de livraison {resolved_name} : {before} → {after}"
    payload = [{'id': existing.id if existing else None, 'name': resolved_name, 'before': before, 'after': after}]
    return _create_pending_action(conversation, 'propose_update_wilaya_rate', summary, payload, [wilaya_id])


def propose_toggle_client_risk(request, conversation, phone, manual_risk):
    if not is_owner_or_admin(request):
        return _write_forbidden()
    store = get_store(request)
    if not store:
        return _write_forbidden()
    phone = (phone or '').strip()
    if not phone:
        return "Le numéro de téléphone est requis."

    from orders.models import CustomerRisk
    existing = CustomerRisk.objects.filter(store=store, phone=phone).first()
    before = {'manual_risk': existing.manual_risk if existing else False}
    after = {'manual_risk': bool(manual_risk)}
    if before == after:
        return f"Le client {phone} est déjà {'marqué à risque' if manual_risk else 'non marqué à risque'}."

    summary = f"Client {phone} : {'marquer à risque' if manual_risk else 'retirer le marquage à risque'}"
    payload = [{'id': None, 'name': phone, 'before': before, 'after': after}]
    return _create_pending_action(conversation, 'propose_toggle_client_risk', summary, payload, [phone])


def propose_blacklist_phone(request, conversation, phone, message=''):
    if not is_owner_or_admin(request):
        return _write_forbidden()
    store = get_store(request)
    if not store:
        return _write_forbidden()
    phone = (phone or '').strip()
    if not phone:
        return "Le numéro de téléphone est requis."

    from orders.models import BlacklistedPhone
    if store.blacklisted_phones.filter(phone=phone).exists():
        return f"Le numéro {phone} est déjà sur liste noire."

    summary = f"Bloquer le numéro {phone}"
    payload = [{'id': None, 'name': phone, 'before': {'blacklisted': False}, 'after': {'blacklisted': True, 'message': message}}]
    return _create_pending_action(conversation, 'propose_blacklist_phone', summary, payload, [phone])


def propose_unblacklist_phone(request, conversation, phone):
    if not is_owner_or_admin(request):
        return _write_forbidden()
    store = get_store(request)
    if not store:
        return _write_forbidden()
    phone = (phone or '').strip()

    from orders.models import BlacklistedPhone
    entry = store.blacklisted_phones.filter(phone=phone).first()
    if not entry:
        return f"Le numéro {phone} n'est pas sur liste noire."

    summary = f"Débloquer le numéro {phone}"
    payload = [{'id': entry.id, 'name': phone, 'before': {'blacklisted': True}, 'after': {'blacklisted': False}}]
    return _create_pending_action(conversation, 'propose_unblacklist_phone', summary, payload, [entry.id])


def propose_update_store_settings(request, conversation, low_stock_threshold=None, risk_threshold_orders=None, risk_period_days=None, insurance_fee=None):
    """Sous-ensemble volontairement limité de StoreSettings — champs
    numériques simples à formuler en langage naturel. Les toggles de
    comportement (deduct_stock_on_order_create, etc.) restent réservés à la
    page Paramètres (plus grand risque de malentendu en une phrase)."""
    if not is_owner_or_admin(request):
        return _write_forbidden()
    store = get_store(request)
    if not store:
        return _write_forbidden()
    fields = {
        'low_stock_threshold': low_stock_threshold,
        'risk_threshold_orders': risk_threshold_orders,
        'risk_period_days': risk_period_days,
        'insurance_fee': insurance_fee,
    }
    changes = {k: v for k, v in fields.items() if v is not None}
    if not changes:
        return "Indiquez au moins un réglage à modifier (seuil de stock bas, seuil/période de risque client, frais d'assurance)."

    settings = store.settings
    after = {}
    for k, v in changes.items():
        after[k] = float(v) if k == 'insurance_fee' else int(v)
    before = {k: (float(getattr(settings, k)) if k == 'insurance_fee' else getattr(settings, k)) for k in changes}
    if before == after:
        return "Ces réglages ont déjà ces valeurs."

    summary = f"Paramètres boutique : {before} → {after}"
    payload = [{'id': settings.id, 'name': 'Paramètres boutique', 'before': before, 'after': after}]
    return _create_pending_action(conversation, 'propose_update_store_settings', summary, payload, [settings.id])


WRITE_TOOL_REGISTRY = {
    'propose_update_product': propose_update_product,
    'propose_bulk_update_products': propose_bulk_update_products,
    'propose_create_product': propose_create_product,
    'propose_update_order_status': propose_update_order_status,
    'propose_toggle_team_member': propose_toggle_team_member,
    'propose_update_carrier_default': propose_update_carrier_default,
    'propose_update_wilaya_rate': propose_update_wilaya_rate,
    'propose_toggle_client_risk': propose_toggle_client_risk,
    'propose_blacklist_phone': propose_blacklist_phone,
    'propose_unblacklist_phone': propose_unblacklist_phone,
    'propose_update_store_settings': propose_update_store_settings,
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
    {
        'type': 'function',
        'function': {
            'name': 'propose_toggle_team_member',
            'description': "Propose d'activer ou désactiver un membre d'équipe DÉJÀ EXISTANT (jamais une invitation — ça reste un geste manuel sur la page Équipe).",
            'parameters': {
                'type': 'object',
                'properties': {
                    'name_or_email': {'type': 'string', 'description': 'Prénom ou email du membre'},
                    'is_active': {'type': 'boolean', 'description': 'True pour activer, False pour désactiver'},
                },
                'required': ['name_or_email', 'is_active'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'propose_update_carrier_default',
            'description': "Propose de changer le transporteur par défaut parmi les comptes DÉJÀ connectés et actifs de la boutique. Ne crée jamais un nouveau compte transporteur.",
            'parameters': {
                'type': 'object',
                'properties': {'carrier_name': {'type': 'string', 'description': 'Nom du transporteur (ex: Yalidine, Noest)'}},
                'required': ['carrier_name'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'propose_update_wilaya_rate',
            'description': "Propose de mettre à jour le tarif de livraison (domicile et/ou point relais) d'une wilaya précise.",
            'parameters': {
                'type': 'object',
                'properties': {
                    'wilaya_name': {'type': 'string', 'description': 'Nom de la wilaya'},
                    'home_price': {'type': 'number', 'description': 'Tarif domicile (optionnel)'},
                    'desk_price': {'type': 'number', 'description': 'Tarif point relais (optionnel)'},
                },
                'required': ['wilaya_name'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'propose_toggle_client_risk',
            'description': "Propose de marquer/démarquer manuellement un client à risque, par son numéro de téléphone.",
            'parameters': {
                'type': 'object',
                'properties': {
                    'phone': {'type': 'string', 'description': 'Numéro de téléphone du client'},
                    'manual_risk': {'type': 'boolean', 'description': 'True pour marquer à risque, False pour retirer le marquage'},
                },
                'required': ['phone', 'manual_risk'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'propose_blacklist_phone',
            'description': "Propose de bloquer un numéro de téléphone (liste noire) pour empêcher toute nouvelle commande de ce numéro.",
            'parameters': {
                'type': 'object',
                'properties': {
                    'phone': {'type': 'string', 'description': 'Numéro de téléphone à bloquer'},
                    'message': {'type': 'string', 'description': 'Message optionnel affiché au client bloqué'},
                },
                'required': ['phone'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'propose_unblacklist_phone',
            'description': "Propose de retirer un numéro de téléphone de la liste noire.",
            'parameters': {
                'type': 'object',
                'properties': {'phone': {'type': 'string', 'description': 'Numéro de téléphone à débloquer'}},
                'required': ['phone'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'propose_update_store_settings',
            'description': "Propose de modifier un ou plusieurs réglages numériques de la boutique : seuil de stock bas, seuil/période de risque client automatique, frais d'assurance livraison.",
            'parameters': {
                'type': 'object',
                'properties': {
                    'low_stock_threshold': {'type': 'integer', 'description': 'Seuil de stock bas (optionnel)'},
                    'risk_threshold_orders': {'type': 'integer', 'description': "Nombre de commandes annulées/retournées déclenchant le risque auto (optionnel)"},
                    'risk_period_days': {'type': 'integer', 'description': 'Fenêtre glissante en jours pour le calcul du risque (optionnel)'},
                    'insurance_fee': {'type': 'number', 'description': "Supplément d'assurance livraison (optionnel)"},
                },
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
