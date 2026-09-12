# Agent IA avec actions d'écriture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à l'assistant IA existant (`ai_assistant/`) la capacité de proposer des écritures (produits, stock, prix, statut de commande) avec aperçu avant/après et confirmation humaine explicite, plus un pipeline de scan (photo produit ou facture multi-articles) qui prépare des brouillons de fiche produit.

**Architecture:** Un nouveau modèle `AIPendingAction` capture toute proposition d'écriture au moment où l'IA l'émet (cible figée, calcul avant/après déjà fait) ; un endpoint de confirmation dédié relit cet enregistrement en base et exécute — jamais les données brutes renvoyées par le navigateur. Un registre d'outils séparé (`write_tools.py`) isole clairement ce qui écrit de ce qui lit (`tools.py`, inchangé). Le scan réutilise le même client HTTP Groq que le chat texte, en mode vision, et alimente un second modèle `AIProductDraft` — jamais une création de `Product` directe.

**Tech Stack:** Django/DRF (backend existant), React (frontend existant), Groq API (vision, modèle multimodal Llama 4), pattern déjà en place dans `ai_assistant/`.

## Global Constraints

- Chaque outil d'écriture réplique la vérification `is_owner_or_admin(request)` — **strict, jamais `OR has_permission(...)`** (décision produit : accès en écriture donné à l'IA = élévation de privilège, non configurable pour confirmateur/dropshipper). Sur les nouvelles routes frontend, utiliser `perm="ownerAdmin"` (valeur spéciale déjà reconnue par `PermGate`, `frontend/src/App.jsx:112`) — pas de nouvelle clé dans `PERMISSION_CATALOG`.
- Plafond dur de **50 cibles** par action en masse (`propose_bulk_update_products`).
- Expiration **15 minutes** sur toute `AIPendingAction` non résolue.
- La cible (`target_ids`) et le calcul avant/après (`payload`) sont figés à la création de la proposition — **jamais recalculés** à la confirmation.
- Aucune action destructive irréversible proposable par l'IA (pas de suppression définitive).
- Chaque proposition confirmée/rejetée est journalisée dans `audit.AuditLog` avec `actor_role='ai_agent'`.
- Panne du modèle IA (texte ou vision) → toujours un 503 explicite (`OllamaUnavailableError`), jamais un résultat partiel présenté comme fiable.
- Spec de référence : `docs/superpowers/specs/2026-09-11-agent-ia-ecriture-design.md`.

---

## Task 1: Modèles `AIPendingAction` / `AIProductDraft` + migration

**Files:**
- Modify: `backend/ai_assistant/models.py`
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Produces: `AIPendingAction` (champs : `conversation`, `tool_name`, `summary`, `payload` JSON, `target_ids` JSON, `status` in `pending|confirmed|rejected|expired`, `created_at`, `expires_at`, `resolved_at`), méthode `is_expired() -> bool`.
- Produces: `AIProductDraft` (champs : `store`, `source` in `photo|invoice|chat_text`, `source_image`, `extracted_data` JSON, `status` in `pending_review|created|discarded`, `created_product`, `created_at`).
- Produces: `AIMessage.pending_action` (FK nullable → `AIPendingAction`, `related_name='messages'`).

- [ ] **Step 1: Écrire les tests (échouent, modèles inexistants)**

Ajouter à la fin de `backend/ai_assistant/tests.py` :

```python
from datetime import timedelta
from django.utils import timezone
from .models import AIPendingAction, AIProductDraft


class AIPendingActionModelTest(TestCase):
    def test_create_and_expire(self):
        owner, store = make_owner()
        conv = AIConversation.objects.create(store=store, user=owner, title='Test')
        action = AIPendingAction.objects.create(
            conversation=conv, tool_name='propose_update_product', summary='Test',
            payload=[{'id': 1, 'name': 'X', 'before': {}, 'after': {}}], target_ids=[1],
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        self.assertEqual(action.status, 'pending')
        self.assertFalse(action.is_expired())
        action.expires_at = timezone.now() - timedelta(minutes=1)
        action.save(update_fields=['expires_at'])
        self.assertTrue(action.is_expired())

    def test_message_can_reference_pending_action(self):
        owner, store = make_owner()
        conv = AIConversation.objects.create(store=store, user=owner, title='Test')
        action = AIPendingAction.objects.create(
            conversation=conv, tool_name='propose_update_product', summary='Test',
            payload=[], target_ids=[], expires_at=timezone.now() + timedelta(minutes=15),
        )
        msg = AIMessage.objects.create(conversation=conv, role='assistant', content='', pending_action=action)
        self.assertEqual(msg.pending_action_id, action.id)


class AIProductDraftModelTest(TestCase):
    def test_create_draft(self):
        owner, store = make_owner()
        draft = AIProductDraft.objects.create(
            store=store, source='photo', extracted_data={'name': 'T-shirt', 'price': 2500},
        )
        self.assertEqual(draft.status, 'pending_review')
        self.assertIsNone(draft.created_product)
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.AIPendingActionModelTest ai_assistant.tests.AIProductDraftModelTest -v 2`
Expected: `ImportError: cannot import name 'AIPendingAction'`

- [ ] **Step 3: Ajouter les modèles**

Ajouter à la fin de `backend/ai_assistant/models.py` :

```python
class AIPendingAction(models.Model):
    """Proposition d'écriture émise par l'IA — jamais exécutée directement.
    `payload`/`target_ids` sont figés à la création et ne changent jamais,
    seul `status`/`resolved_at` évolue (même philosophie que StockMovement).
    Voir docs/superpowers/specs/2026-09-11-agent-ia-ecriture-design.md."""
    STATUS_CHOICES = [
        ('pending', 'pending'), ('confirmed', 'confirmed'),
        ('rejected', 'rejected'), ('expired', 'expired'),
    ]
    conversation = models.ForeignKey(AIConversation, on_delete=models.CASCADE, related_name='pending_actions')
    tool_name = models.CharField(max_length=60)
    summary = models.CharField(max_length=300)
    payload = models.JSONField(default=list)
    target_ids = models.JSONField(default=list)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    resolved_at = models.DateTimeField(null=True, blank=True)

    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return self.summary


class AIProductDraft(models.Model):
    """Résultat intermédiaire d'un scan (photo/facture) ou d'une création
    texte via le chat — jamais un Product créé directement, toujours validé
    par le vendeur (ProductFormPage pré-remplie, ou ProductDraftsPage pour
    un lot issu d'une facture)."""
    SOURCE_CHOICES = [('photo', 'photo'), ('invoice', 'invoice'), ('chat_text', 'chat_text')]
    STATUS_CHOICES = [('pending_review', 'pending_review'), ('created', 'created'), ('discarded', 'discarded')]
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='ai_product_drafts')
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES)
    source_image = models.ImageField(upload_to='ai_drafts/', null=True, blank=True)
    extracted_data = models.JSONField(default=dict)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending_review')
    created_product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.extracted_data.get('name', f'Brouillon #{self.pk}')
```

Ajouter `from django.utils import timezone` en haut de `backend/ai_assistant/models.py` (à côté de `from django.db import models`).

Modifier la classe `AIMessage` pour ajouter le champ (juste après `content`) :

```python
    pending_action = models.ForeignKey(AIPendingAction, on_delete=models.SET_NULL, null=True, blank=True, related_name='messages')
```

- [ ] **Step 4: Générer et appliquer la migration**

Run: `cd backend && venv/Scripts/python manage.py makemigrations ai_assistant`
Expected: crée `ai_assistant/migrations/0003_...py` (nouveaux modèles + champ `pending_action`).

Run: `cd backend && venv/Scripts/python manage.py migrate ai_assistant`
Expected: `Applying ai_assistant.0003_...... OK`

- [ ] **Step 5: Lancer les tests, vérifier le succès**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.AIPendingActionModelTest ai_assistant.tests.AIProductDraftModelTest -v 2`
Expected: `OK` (3 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/ai_assistant/models.py backend/ai_assistant/migrations/ backend/ai_assistant/tests.py
git commit -m "feat(ai-agent): modèles AIPendingAction et AIProductDraft"
```

---

## Task 2: `chat_loop.py` — arrêt immédiat sur outil d'écriture

**Files:**
- Modify: `backend/ai_assistant/chat_loop.py`
- Modify: `backend/ai_assistant/views.py:217-218` (ChatView, unpack tuple)
- Modify: `backend/ai_assistant/public_views.py:71-72` (PublicChatView, unpack tuple)
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: rien de nouveau (même `ollama_client.chat`).
- Produces: `run_chat_loop(history, tool_definitions, tool_executor, write_tool_names=None) -> (content: str, pending_action_id: int | None)` — **changement de contrat** (avant : renvoyait seulement `content`). `pending_action_id` est extrait du JSON renvoyé par un outil dont le nom est dans `write_tool_names`, via la clé `action_id`.

- [ ] **Step 1: Écrire le test (échoue — ancien contrat encore en place)**

Créer un nouveau bloc de test dans `backend/ai_assistant/tests.py` (avant la classe `AIAssistantModelsTest` ou à la suite, peu importe l'ordre) :

```python
from .chat_loop import run_chat_loop


class ChatLoopWriteToolTest(TestCase):
    @patch('ai_assistant.ollama_client.chat')
    def test_stops_immediately_after_write_tool_call(self, mock_chat):
        mock_chat.return_value = {
            'content': '',
            'tool_calls': [{'id': 'call_1', 'function': {'name': 'propose_update_product', 'arguments': {}}}],
        }
        history = [{'role': 'user', 'content': 'Baisse le prix de X'}]

        def tool_executor(name, arguments):
            return json.dumps({'status': 'en_attente_de_confirmation', 'action_id': 42})

        content, pending_action_id = run_chat_loop(
            history, [], tool_executor, write_tool_names={'propose_update_product'},
        )
        self.assertEqual(content, '')
        self.assertEqual(pending_action_id, 42)
        self.assertEqual(mock_chat.call_count, 1)  # un seul tour, jamais de 2e appel modèle

    @patch('ai_assistant.ollama_client.chat')
    def test_read_tool_continues_loop_as_before(self, mock_chat):
        mock_chat.side_effect = [
            {'content': '', 'tool_calls': [{'id': 'call_1', 'function': {'name': 'get_low_stock', 'arguments': {}}}]},
            {'content': 'Voici votre stock bas.', 'tool_calls': []},
        ]
        history = [{'role': 'user', 'content': 'Stock bas ?'}]
        content, pending_action_id = run_chat_loop(
            history, [], lambda name, args: '{"products": []}', write_tool_names=set(),
        )
        self.assertEqual(content, 'Voici votre stock bas.')
        self.assertIsNone(pending_action_id)
        self.assertEqual(mock_chat.call_count, 2)
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ChatLoopWriteToolTest -v 2`
Expected: `ValueError: too many values to unpack` (ou `TypeError`) — `run_chat_loop` renvoie encore une chaîne seule.

- [ ] **Step 3: Réécrire `chat_loop.py`**

Remplacer entièrement le contenu de `backend/ai_assistant/chat_loop.py` par :

```python
"""Boucle de tool-calling multi-tours, partagée entre le canal dashboard
(ChatView, historique persisté par utilisateur) et le canal boutique
publique (PublicChatView, historique persisté par session_id) — ce module
ne connaît ni l'un ni l'autre, ne fait aucune écriture en base, opère
uniquement sur une liste de messages en mémoire et un `tool_executor`
injecté par l'appelant.

`write_tool_names` (optionnel) : noms d'outils qui PROPOSENT une écriture
(ai_assistant/write_tools.py) plutôt que d'exécuter directement — dès qu'un
tel outil est appelé, la boucle s'arrête immédiatement sans redemander de
réponse au modèle (jamais d'enchaînement de plusieurs propositions dans un
même tour, jamais de texte halluciné supposant une confirmation à venir).
Le résultat JSON de l'outil doit alors contenir `action_id`."""
import json as _json

from . import ollama_client

MAX_TOOL_ROUNDS = 3


def _extract_action_id(result):
    try:
        return _json.loads(result).get('action_id')
    except (ValueError, TypeError, AttributeError):
        return None


def run_chat_loop(history, tool_definitions, tool_executor, write_tool_names=None):
    """`history` : liste de messages `{role, content, ...}`, déjà terminée
    par le nouveau message utilisateur — MUTÉE en place (les tours
    intermédiaires assistant/tool y sont ajoutés, pour que l'appelant
    puisse les persister après coup s'il le souhaite). Retourne
    `(contenu_texte_final, pending_action_id)` — `pending_action_id` est
    `None` sauf si un outil d'écriture a été appelé dans ce tour."""
    write_tool_names = write_tool_names or set()
    assistant_msg = {'content': ''}
    for _ in range(MAX_TOOL_ROUNDS):
        assistant_msg = ollama_client.chat(history, tools=tool_definitions)
        tool_calls = assistant_msg.get('tool_calls') or []
        if not tool_calls:
            break
        # `tool_calls` réinjecté tel quel dans l'historique : Groq (API
        # stricte compatible OpenAI) rejette un message role='tool' qui ne
        # référence pas un `tool_call_id` connu du tour précédent — Ollama
        # est plus permissif mais accepte le même format sans broncher.
        history.append({'role': 'assistant', 'content': assistant_msg.get('content', ''), 'tool_calls': tool_calls})
        pending_action_id = None
        for call in tool_calls:
            fn = call.get('function', {})
            name = fn.get('name')
            arguments = fn.get('arguments') or {}
            result = tool_executor(name, arguments)
            history.append({'role': 'tool', 'tool_call_id': call.get('id', ''), 'content': result})
            if name in write_tool_names:
                pending_action_id = _extract_action_id(result)
        if pending_action_id is not None:
            return '', pending_action_id
    return assistant_msg.get('content', ''), None
```

- [ ] **Step 4: Mettre à jour les deux appelants**

Dans `backend/ai_assistant/views.py`, remplacer la ligne 218 :

```python
            final_content = run_chat_loop(history, ai_tools.TOOL_DEFINITIONS, tool_executor)
```

par (contrat provisoire — sera enrichi avec les outils d'écriture à la Task 9) :

```python
            final_content, _pending_action_id = run_chat_loop(history, ai_tools.TOOL_DEFINITIONS, tool_executor)
```

Dans `backend/ai_assistant/public_views.py`, remplacer la ligne 72 :

```python
            final_content = run_chat_loop(history, ai_tools.PUBLIC_TOOL_DEFINITIONS, tool_executor)
```

par :

```python
            final_content, _pending_action_id = run_chat_loop(history, ai_tools.PUBLIC_TOOL_DEFINITIONS, tool_executor)
```

- [ ] **Step 5: Lancer toute la suite `ai_assistant` pour vérifier l'absence de régression**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant -v 2`
Expected: `OK` (tous les tests existants + les 2 nouveaux passent — `ChatView`/`PublicChatView` fonctionnent toujours avec le nouveau contrat).

- [ ] **Step 6: Commit**

```bash
git add backend/ai_assistant/chat_loop.py backend/ai_assistant/views.py backend/ai_assistant/public_views.py backend/ai_assistant/tests.py
git commit -m "feat(ai-agent): chat_loop s'arrête immédiatement sur un outil d'écriture"
```

---

## Task 3: `write_tools.py` — `propose_update_product`

**Files:**
- Create: `backend/ai_assistant/write_tools.py`
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `AIPendingAction` (Task 1), `core.permissions.is_owner_or_admin`/`get_store`.
- Produces: `_write_forbidden() -> str`, `_create_pending_action(conversation, tool_name, summary, payload, target_ids) -> str (JSON)`, `propose_update_product(request, conversation, name_or_id, price=None, stock=None, is_active=None, category=None) -> str`, `WRITE_TOOL_REGISTRY: dict`, `WRITE_TOOL_DEFINITIONS: list`, `execute_write_tool(request, conversation, name, arguments) -> str`.

- [ ] **Step 1: Écrire les tests (échouent, module inexistant)**

Ajouter à `backend/ai_assistant/tests.py` :

```python
from products.models import Product


class ProposeUpdateProductTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conv = AIConversation.objects.create(store=self.store, user=self.owner, title='Test')
        self.product = Product.objects.create(store=self.store, name='T-shirt noir', price=2000, stock=10)

    def _request(self, user):
        request = type('R', (), {})()
        request.user = user
        return request

    def test_forbidden_for_confirmateur(self):
        from ai_assistant import write_tools
        confirmateur, _ = make_team_member(self.store, 'confirmateur')
        result = write_tools.propose_update_product(self._request(confirmateur), self.conv, 'T-shirt noir', price=1800)
        self.assertIn('réservée', result.lower())
        self.assertEqual(AIPendingAction.objects.count(), 0)

    def test_creates_pending_action_with_before_after(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_product(self._request(self.owner), self.conv, 'T-shirt noir', price=1800, stock=5)
        data = json.loads(result)
        self.assertEqual(data['status'], 'en_attente_de_confirmation')
        action = AIPendingAction.objects.get(pk=data['action_id'])
        self.assertEqual(action.tool_name, 'propose_update_product')
        self.assertEqual(action.target_ids, [self.product.id])
        self.assertEqual(action.payload[0]['before']['price'], 2000.0)
        self.assertEqual(action.payload[0]['after']['price'], 1800.0)
        self.assertEqual(action.payload[0]['after']['stock'], 5)
        # rien n'a encore été écrit sur le produit réel
        self.product.refresh_from_db()
        self.assertEqual(self.product.price, 2000)

    def test_product_not_found(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_product(self._request(self.owner), self.conv, 'Produit inexistant', price=100)
        self.assertIn('introuvable', result.lower())
        self.assertEqual(AIPendingAction.objects.count(), 0)

    def test_no_changes_requested(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_product(self._request(self.owner), self.conv, 'T-shirt noir')
        self.assertIn('aucun changement', result.lower())
        self.assertEqual(AIPendingAction.objects.count(), 0)
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ProposeUpdateProductTest -v 2`
Expected: `ModuleNotFoundError: No module named 'ai_assistant.write_tools'`

- [ ] **Step 3: Créer `write_tools.py`**

```python
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

from .models import AIPendingAction

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


WRITE_TOOL_REGISTRY = {
    'propose_update_product': propose_update_product,
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
]


def execute_write_tool(request, conversation, name, arguments):
    fn = WRITE_TOOL_REGISTRY.get(name)
    if not fn:
        return f"Outil inconnu : {name}"
    try:
        return fn(request, conversation, **arguments)
    except TypeError:
        return fn(request, conversation)
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ProposeUpdateProductTest -v 2`
Expected: `OK` (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/ai_assistant/write_tools.py backend/ai_assistant/tests.py
git commit -m "feat(ai-agent): outil propose_update_product"
```

---

## Task 4: `write_tools.py` — `propose_bulk_update_products`

**Files:**
- Modify: `backend/ai_assistant/write_tools.py`
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `MAX_BULK_TARGETS`, `_write_forbidden`, `_create_pending_action` (Task 3).
- Produces: `propose_bulk_update_products(request, conversation, category=None, is_active_filter=None, price=None, stock=None, is_active=None) -> str`, ajouté à `WRITE_TOOL_REGISTRY`/`WRITE_TOOL_DEFINITIONS`.

- [ ] **Step 1: Écrire les tests**

```python
class ProposeBulkUpdateProductsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conv = AIConversation.objects.create(store=self.store, user=self.owner, title='Test')
        from products.models import Category
        self.cat = Category.objects.create(store=self.store, name='Été')
        for i in range(3):
            p = Product.objects.create(store=self.store, name=f'Produit {i}', price=1000, is_active=True)
            p.categories.add(self.cat)

    def _request(self, user):
        request = type('R', (), {})()
        request.user = user
        return request

    def test_bulk_deactivate_by_category(self):
        from ai_assistant import write_tools
        result = write_tools.propose_bulk_update_products(self._request(self.owner), self.conv, category='Été', is_active=False)
        data = json.loads(result)
        action = AIPendingAction.objects.get(pk=data['action_id'])
        self.assertEqual(len(action.target_ids), 3)
        self.assertTrue(all(item['after']['is_active'] is False for item in action.payload))

    def test_bulk_capped_at_50(self):
        from ai_assistant import write_tools
        from products.models import Category
        big_cat = Category.objects.create(store=self.store, name='Grosse categorie')
        for i in range(51):
            p = Product.objects.create(store=self.store, name=f'Bulk {i}', price=500, is_active=True)
            p.categories.add(big_cat)
        result = write_tools.propose_bulk_update_products(self._request(self.owner), self.conv, category='Grosse categorie', is_active=False)
        self.assertIn('50', result)
        self.assertEqual(AIPendingAction.objects.count(), 0)

    def test_no_match_returns_message(self):
        from ai_assistant import write_tools
        result = write_tools.propose_bulk_update_products(self._request(self.owner), self.conv, category='Inconnue', is_active=False)
        self.assertIn('aucun produit', result.lower())
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ProposeBulkUpdateProductsTest -v 2`
Expected: `AttributeError: module 'ai_assistant.write_tools' has no attribute 'propose_bulk_update_products'`

- [ ] **Step 3: Ajouter la fonction dans `write_tools.py`**

Insérer après `propose_update_product` :

```python
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
```

Ajouter à `WRITE_TOOL_REGISTRY` :

```python
    'propose_bulk_update_products': propose_bulk_update_products,
```

Ajouter à `WRITE_TOOL_DEFINITIONS` :

```python
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
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ProposeBulkUpdateProductsTest -v 2`
Expected: `OK` (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/ai_assistant/write_tools.py backend/ai_assistant/tests.py
git commit -m "feat(ai-agent): outil propose_bulk_update_products (plafond 50)"
```

---

## Task 5: `write_tools.py` — `propose_create_product`

**Files:**
- Modify: `backend/ai_assistant/write_tools.py`
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `AIProductDraft` (Task 1).
- Produces: `propose_create_product(request, conversation, name, price, description='', category=None) -> str`.

- [ ] **Step 1: Écrire les tests**

```python
class ProposeCreateProductTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conv = AIConversation.objects.create(store=self.store, user=self.owner, title='Test')

    def _request(self, user):
        request = type('R', (), {})()
        request.user = user
        return request

    def test_creates_draft_and_pending_action(self):
        from ai_assistant import write_tools
        result = write_tools.propose_create_product(self._request(self.owner), self.conv, name='Casquette rouge', price=1500)
        data = json.loads(result)
        action = AIPendingAction.objects.get(pk=data['action_id'])
        self.assertEqual(action.tool_name, 'propose_create_product')
        draft = AIProductDraft.objects.get(pk=action.target_ids[0])
        self.assertEqual(draft.source, 'chat_text')
        self.assertEqual(draft.extracted_data['name'], 'Casquette rouge')
        self.assertEqual(draft.status, 'pending_review')

    def test_missing_price_rejected(self):
        from ai_assistant import write_tools
        result = write_tools.propose_create_product(self._request(self.owner), self.conv, name='X', price=None)
        self.assertIn('requis', result.lower())
        self.assertEqual(AIPendingAction.objects.count(), 0)
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ProposeCreateProductTest -v 2`
Expected: `AttributeError: ... 'propose_create_product'`

- [ ] **Step 3: Ajouter la fonction**

Insérer dans `write_tools.py`, après `propose_bulk_update_products` (et ajouter `from .models import AIPendingAction, AIProductDraft` en haut du fichier, à la place de l'import existant `AIPendingAction` seul) :

```python
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
```

Ajouter à `WRITE_TOOL_REGISTRY` :

```python
    'propose_create_product': propose_create_product,
```

Ajouter à `WRITE_TOOL_DEFINITIONS` :

```python
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
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ProposeCreateProductTest -v 2`
Expected: `OK` (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/ai_assistant/write_tools.py backend/ai_assistant/tests.py
git commit -m "feat(ai-agent): outil propose_create_product (brouillon texte)"
```

---

## Task 6: `write_tools.py` — `propose_update_order_status`

**Files:**
- Modify: `backend/ai_assistant/write_tools.py`
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `orders.models.STATUS_CHOICES`.
- Produces: `propose_update_order_status(request, conversation, order_number, new_status, note='') -> str`.

- [ ] **Step 1: Écrire les tests**

```python
class ProposeUpdateOrderStatusTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conv = AIConversation.objects.create(store=self.store, user=self.owner, title='Test')
        from orders.models import Order
        self.order = Order.objects.create(
            store=self.store, first_name='Ali', last_name='B', phone='0555000000',
            wilaya='Alger', address='Rue 1', status='pending', subtotal=1000, shipping_cost=0, total=1000,
        )

    def _request(self, user):
        request = type('R', (), {})()
        request.user = user
        return request

    def test_creates_pending_action(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_order_status(self._request(self.owner), self.conv, order_number=str(self.order.id), new_status='confirmed')
        data = json.loads(result)
        action = AIPendingAction.objects.get(pk=data['action_id'])
        self.assertEqual(action.target_ids, [self.order.id])
        self.assertEqual(action.payload[0]['after']['status'], 'confirmed')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'pending')  # rien exécuté

    def test_order_not_found(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_order_status(self._request(self.owner), self.conv, order_number='999999', new_status='confirmed')
        self.assertIn('introuvable', result.lower())

    def test_invalid_status_rejected(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_order_status(self._request(self.owner), self.conv, order_number=str(self.order.id), new_status='statut_bidon')
        self.assertIn('invalide', result.lower())
        self.assertEqual(AIPendingAction.objects.count(), 0)

    def test_already_at_target_status(self):
        from ai_assistant import write_tools
        result = write_tools.propose_update_order_status(self._request(self.owner), self.conv, order_number=str(self.order.id), new_status='pending')
        self.assertIn('déjà', result.lower())
        self.assertEqual(AIPendingAction.objects.count(), 0)
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ProposeUpdateOrderStatusTest -v 2`
Expected: `AttributeError: ... 'propose_update_order_status'`

- [ ] **Step 3: Ajouter la fonction**

Insérer dans `write_tools.py` :

```python
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
```

Ajouter à `WRITE_TOOL_REGISTRY` :

```python
    'propose_update_order_status': propose_update_order_status,
```

Ajouter à `WRITE_TOOL_DEFINITIONS` :

```python
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
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ProposeUpdateOrderStatusTest -v 2`
Expected: `OK` (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/ai_assistant/write_tools.py backend/ai_assistant/tests.py
git commit -m "feat(ai-agent): outil propose_update_order_status (commande unique)"
```

---

## Task 7: Serializers `AIPendingAction`/`AIProductDraft`

**Files:**
- Modify: `backend/ai_assistant/serializers.py`
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Produces: `AIPendingActionSerializer` (fields `id, tool_name, summary, payload, status, expires_at`), `AIProductDraftSerializer` (fields `id, source, extracted_data, status, created_at, source_image`), `AIMessageSerializer.pending_action` (nested, nullable).

- [ ] **Step 1: Écrire le test**

```python
from .serializers import AIMessageSerializer, AIPendingActionSerializer


class SerializerTest(TestCase):
    def test_message_serializer_includes_pending_action(self):
        owner, store = make_owner()
        conv = AIConversation.objects.create(store=store, user=owner, title='Test')
        action = AIPendingAction.objects.create(
            conversation=conv, tool_name='propose_update_product', summary='Test résumé',
            payload=[{'id': 1}], target_ids=[1], expires_at=timezone.now() + timedelta(minutes=15),
        )
        msg = AIMessage.objects.create(conversation=conv, role='assistant', content='', pending_action=action)
        data = AIMessageSerializer(msg).data
        self.assertEqual(data['pending_action']['summary'], 'Test résumé')
        self.assertEqual(data['pending_action']['status'], 'pending')

    def test_message_serializer_pending_action_null_by_default(self):
        owner, store = make_owner()
        conv = AIConversation.objects.create(store=store, user=owner, title='Test')
        msg = AIMessage.objects.create(conversation=conv, role='assistant', content='Bonjour')
        data = AIMessageSerializer(msg).data
        self.assertIsNone(data['pending_action'])
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.SerializerTest -v 2`
Expected: `KeyError: 'pending_action'`

- [ ] **Step 3: Modifier `serializers.py`**

Remplacer entièrement `backend/ai_assistant/serializers.py` par :

```python
from rest_framework import serializers

from .models import AIConversation, AIMessage, AIPendingAction, AIProductDraft


class AIPendingActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIPendingAction
        fields = ['id', 'tool_name', 'summary', 'payload', 'status', 'expires_at']


class AIProductDraftSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIProductDraft
        fields = ['id', 'source', 'extracted_data', 'status', 'created_at', 'source_image']


class AIMessageSerializer(serializers.ModelSerializer):
    pending_action = AIPendingActionSerializer(read_only=True)

    class Meta:
        model = AIMessage
        fields = ['id', 'role', 'content', 'created_at', 'pending_action']


class AIConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIConversation
        fields = ['id', 'title', 'created_at', 'updated_at']


class AIConversationDetailSerializer(serializers.ModelSerializer):
    messages = AIMessageSerializer(many=True, read_only=True)

    class Meta:
        model = AIConversation
        fields = ['id', 'title', 'created_at', 'updated_at', 'messages']
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.SerializerTest -v 2`
Expected: `OK` (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/ai_assistant/serializers.py backend/ai_assistant/tests.py
git commit -m "feat(ai-agent): sérialise AIPendingAction/AIProductDraft, message.pending_action"
```

---

## Task 8: Endpoints confirm/reject + exécution + audit

**Files:**
- Modify: `backend/ai_assistant/views.py`
- Modify: `backend/ai_assistant/urls.py`
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `AIPendingAction`, `audit.models.AuditLog`, `orders.views._transition_order_status`, `products.serializers.ProductSerializer`.
- Produces: `PendingActionConfirmView` (`POST /api/ai/pending-actions/<id>/confirm/`), `PendingActionRejectView` (`POST /api/ai/pending-actions/<id>/reject/`), fonction privée `_execute_pending_action(store, action)`.

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/ai_assistant/tests.py` :

```python
from audit.models import AuditLog


class PendingActionConfirmRejectTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.conv = AIConversation.objects.create(store=self.store, user=self.owner, title='Test')
        self.product = Product.objects.create(store=self.store, name='T-shirt', price=2000, stock=10)
        self.action = AIPendingAction.objects.create(
            conversation=self.conv, tool_name='propose_update_product', summary='Modifier T-shirt',
            payload=[{'id': self.product.id, 'name': 'T-shirt', 'before': {'price': 2000.0}, 'after': {'price': 1500.0}}],
            target_ids=[self.product.id], expires_at=timezone.now() + timedelta(minutes=15),
        )

    def test_confirm_executes_and_journalise(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{self.action.id}/confirm/')
        self.assertEqual(resp.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(float(self.product.price), 1500.0)
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, 'confirmed')
        self.assertIsNotNone(self.action.resolved_at)
        log = AuditLog.objects.filter(action='ai_agent.action_confirmed').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor_role, 'ai_agent')

    def test_reject_does_not_execute(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{self.action.id}/reject/')
        self.assertEqual(resp.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(float(self.product.price), 2000.0)
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, 'rejected')

    def test_confirm_forbidden_for_confirmateur(self):
        confirmateur, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(confirmateur)
        resp = client.post(f'/api/ai/pending-actions/{self.action.id}/confirm/')
        self.assertEqual(resp.status_code, 403)
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, 'pending')

    def test_confirm_expired_action_returns_409(self):
        self.action.expires_at = timezone.now() - timedelta(minutes=1)
        self.action.save(update_fields=['expires_at'])
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{self.action.id}/confirm/')
        self.assertEqual(resp.status_code, 409)
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, 'expired')
        self.product.refresh_from_db()
        self.assertEqual(float(self.product.price), 2000.0)

    def test_confirm_already_resolved_returns_409(self):
        self.action.status = 'confirmed'
        self.action.save(update_fields=['status'])
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{self.action.id}/confirm/')
        self.assertEqual(resp.status_code, 409)

    def test_bulk_update_execution(self):
        p2 = Product.objects.create(store=self.store, name='Pantalon', price=3000, is_active=True)
        bulk_action = AIPendingAction.objects.create(
            conversation=self.conv, tool_name='propose_bulk_update_products', summary='Désactiver 2 produits',
            payload=[
                {'id': self.product.id, 'name': 'T-shirt', 'before': {'is_active': True}, 'after': {'is_active': False}},
                {'id': p2.id, 'name': 'Pantalon', 'before': {'is_active': True}, 'after': {'is_active': False}},
            ],
            target_ids=[self.product.id, p2.id], expires_at=timezone.now() + timedelta(minutes=15),
        )
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{bulk_action.id}/confirm/')
        self.assertEqual(resp.status_code, 200)
        self.product.refresh_from_db()
        p2.refresh_from_db()
        self.assertFalse(self.product.is_active)
        self.assertFalse(p2.is_active)

    def test_create_product_execution(self):
        draft = AIProductDraft.objects.create(store=self.store, source='chat_text', extracted_data={'name': 'Casquette', 'price': 1200.0})
        action = AIPendingAction.objects.create(
            conversation=self.conv, tool_name='propose_create_product', summary='Créer Casquette',
            payload=[{'id': None, 'name': 'Casquette', 'before': None, 'after': {'name': 'Casquette', 'price': 1200.0}}],
            target_ids=[draft.id], expires_at=timezone.now() + timedelta(minutes=15),
        )
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{action.id}/confirm/')
        self.assertEqual(resp.status_code, 200)
        draft.refresh_from_db()
        self.assertEqual(draft.status, 'created')
        self.assertIsNotNone(draft.created_product)
        self.assertEqual(draft.created_product.name, 'Casquette')

    def test_order_status_execution(self):
        from orders.models import Order
        order = Order.objects.create(
            store=self.store, first_name='Ali', last_name='B', phone='0555000000',
            wilaya='Alger', address='Rue 1', status='pending', subtotal=1000, shipping_cost=0, total=1000,
        )
        action = AIPendingAction.objects.create(
            conversation=self.conv, tool_name='propose_update_order_status', summary='Confirmer commande',
            payload=[{'id': order.id, 'name': f'Commande #{order.id}', 'before': {'status': 'pending'}, 'after': {'status': 'confirmed', 'note': 'via IA'}}],
            target_ids=[order.id], expires_at=timezone.now() + timedelta(minutes=15),
        )
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/pending-actions/{action.id}/confirm/')
        self.assertEqual(resp.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, 'confirmed')
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.PendingActionConfirmRejectTest -v 2`
Expected: `404` sur les URLs (routes inexistantes)

- [ ] **Step 3: Ajouter les vues et l'exécution dans `views.py`**

Ajouter en haut de `backend/ai_assistant/views.py`, avec les autres imports :

```python
from django.db import transaction
from django.utils import timezone

from audit.models import AuditLog

from .models import AIPendingAction, AIProductDraft
from .serializers import AIPendingActionSerializer
```

Ajouter à la fin du fichier :

```python
def _execute_pending_action(store, action):
    """Exécute réellement une AIPendingAction déjà validée (statut/expiration
    vérifiés par l'appelant) — jamais appelée en dehors d'une transaction
    atomique. `payload`/`target_ids` sont ceux figés à la proposition,
    jamais recalculés ici."""
    if action.tool_name in ('propose_update_product', 'propose_bulk_update_products'):
        from products.models import Category
        for item in action.payload:
            product = store.products.get(pk=item['id'])
            after = item['after']
            if 'price' in after:
                product.price = after['price']
            if 'stock' in after:
                product.stock = after['stock']
            if 'is_active' in after:
                product.is_active = after['is_active']
            product.save()
            if 'categories' in after:
                cats = Category.objects.filter(store=store, name__in=after['categories'])
                product.categories.set(cats)

    elif action.tool_name == 'propose_create_product':
        from products.serializers import ProductSerializer
        draft = AIProductDraft.objects.get(pk=action.target_ids[0])
        data = draft.extracted_data
        serializer = ProductSerializer(data={
            'name': data['name'], 'price': data['price'], 'description': data.get('description', ''),
        })
        serializer.is_valid(raise_exception=True)
        product = serializer.save(store=store)
        draft.status = 'created'
        draft.created_product = product
        draft.save(update_fields=['status', 'created_product'])

    elif action.tool_name == 'propose_update_order_status':
        from orders.views import _transition_order_status
        item = action.payload[0]
        order = store.orders.get(pk=item['id'])
        _transition_order_status(store, order, item['after']['status'], changed_by=None, note=item['after'].get('note', 'Action confirmée via l\'agent IA'))


def _log_ai_agent_action(request, store, action, audit_action):
    try:
        actor_name = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.email
        AuditLog.objects.create(
            store=store, actor=request.user, actor_name=actor_name, actor_role='ai_agent',
            action=audit_action, target_type='ai_pending_action', target_id=action.id,
            target_repr=action.summary, description=action.summary, metadata={'payload': action.payload},
        )
    except Exception:
        pass  # best-effort, même philosophie que audit.utils.log_audit


class PendingActionConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = get_store(request)
        try:
            action = AIPendingAction.objects.select_related('conversation').get(pk=pk, conversation__store=store)
        except AIPendingAction.DoesNotExist:
            return Response({'detail': 'Action introuvable.'}, status=404)
        if action.status != 'pending':
            return Response({'detail': f"Cette action a déjà été résolue ({action.status})."}, status=409)
        if action.is_expired():
            action.status = 'expired'
            action.resolved_at = timezone.now()
            action.save(update_fields=['status', 'resolved_at'])
            return Response({'detail': 'Cette proposition a expiré, redemandez à l\'assistant.'}, status=409)

        with transaction.atomic():
            _execute_pending_action(store, action)
            action.status = 'confirmed'
            action.resolved_at = timezone.now()
            action.save(update_fields=['status', 'resolved_at'])

        _log_ai_agent_action(request, store, action, 'ai_agent.action_confirmed')
        return Response({'status': 'confirmed'})


class PendingActionRejectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = get_store(request)
        try:
            action = AIPendingAction.objects.select_related('conversation').get(pk=pk, conversation__store=store)
        except AIPendingAction.DoesNotExist:
            return Response({'detail': 'Action introuvable.'}, status=404)
        if action.status != 'pending':
            return Response({'detail': f"Cette action a déjà été résolue ({action.status})."}, status=409)

        action.status = 'rejected'
        action.resolved_at = timezone.now()
        action.save(update_fields=['status', 'resolved_at'])
        _log_ai_agent_action(request, store, action, 'ai_agent.action_rejected')
        return Response({'status': 'rejected'})
```

Ajouter dans `backend/ai_assistant/urls.py` :

```python
from .views import (
    GenerateProductView, SuggestReplyView, DashboardSummaryView,
    ConversationListView, ConversationDetailView, ChatView,
    PendingActionConfirmView, PendingActionRejectView,
)

urlpatterns = [
    path('generate-product/', GenerateProductView.as_view()),
    path('inbox/<int:conversation_id>/suggest-reply/', SuggestReplyView.as_view()),
    path('dashboard-summary/', DashboardSummaryView.as_view()),
    path('conversations/', ConversationListView.as_view()),
    path('conversations/<int:pk>/', ConversationDetailView.as_view()),
    path('chat/', ChatView.as_view()),
    path('pending-actions/<int:pk>/confirm/', PendingActionConfirmView.as_view()),
    path('pending-actions/<int:pk>/reject/', PendingActionRejectView.as_view()),
]
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.PendingActionConfirmRejectTest -v 2`
Expected: `OK` (8 tests)

- [ ] **Step 5: Lancer la suite complète `ai_assistant`**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant -v 2`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/ai_assistant/views.py backend/ai_assistant/urls.py backend/ai_assistant/tests.py
git commit -m "feat(ai-agent): endpoints confirm/reject + exécution + journal d'audit"
```

---

## Task 9: Intégration dans `ChatView` (outils d'écriture + `pending_action` dans la réponse)

**Files:**
- Modify: `backend/ai_assistant/views.py`
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `write_tools.WRITE_TOOL_REGISTRY`/`WRITE_TOOL_DEFINITIONS`/`execute_write_tool` (Tasks 3-6).
- Produces: `ChatView.post` renvoie `{conversation_id, reply, pending_action}` (`pending_action` absent/`null` si aucune proposition), et n'expose les outils d'écriture au modèle que si `is_owner_or_admin(request)`.

- [ ] **Step 1: Écrire les tests**

```python
class ChatViewWriteToolIntegrationTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.product = Product.objects.create(store=self.store, name='T-shirt', price=2000, stock=10)
        clear_throttle_cache()

    @patch('ai_assistant.ollama_client.chat')
    def test_write_tool_call_returns_pending_action(self, mock_chat):
        mock_chat.return_value = {
            'content': '',
            'tool_calls': [{'id': 'c1', 'function': {
                'name': 'propose_update_product',
                'arguments': {'name_or_id': 'T-shirt', 'price': 1800},
            }}],
        }
        client = auth_client(self.owner)
        resp = client.post('/api/ai/chat/', {'message': 'Baisse le prix du T-shirt à 1800'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.data.get('pending_action'))
        self.assertEqual(resp.data['pending_action']['status'], 'pending')
        # rien exécuté sur le produit réel
        self.product.refresh_from_db()
        self.assertEqual(self.product.price, 2000)

    @patch('ai_assistant.ollama_client.chat')
    def test_write_tools_not_offered_to_confirmateur(self, mock_chat):
        confirmateur, _ = make_team_member(self.store, 'confirmateur')
        from team.models import RolePermission
        RolePermission.objects.create(store=self.store, role='confirmateur', permission='ai_assistant_view', enabled=True)
        mock_chat.return_value = {'content': 'Réponse simple.', 'tool_calls': []}
        client = auth_client(confirmateur)
        resp = client.post('/api/ai/chat/', {'message': 'Baisse le prix'}, format='json')
        self.assertEqual(resp.status_code, 200)
        sent_tools = mock_chat.call_args.kwargs.get('tools') or mock_chat.call_args[0][1] if len(mock_chat.call_args[0]) > 1 else mock_chat.call_args.kwargs.get('tools')
        tool_names = [t['function']['name'] for t in (sent_tools or [])]
        self.assertNotIn('propose_update_product', tool_names)
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ChatViewWriteToolIntegrationTest -v 2`
Expected: `AssertionError: None is not not None` (pas de `pending_action` dans la réponse actuelle)

- [ ] **Step 3: Modifier `ChatView.post`**

Ajouter en haut de `views.py` : `from . import write_tools as ai_write_tools`

Remplacer le corps de `ChatView.post` à partir de la ligne définissant `system_message` (inclus) jusqu'à la fin de la méthode par :

```python
        system_message = {
            'role': 'system',
            'content': (
                "Tu es l'assistant IA du dashboard vendeur de la boutique " + store.name + ". "
                "N'invente JAMAIS une information (stock, commandes, clients, finances...) — utilise "
                "UNIQUEMENT les outils disponibles. Si un outil ne renvoie rien ou refuse (permission "
                "manquante), dis-le clairement plutôt que de deviner ou de répéter une ancienne réponse "
                "de la conversation. Réponses courtes (2-4 phrases maximum), directes, sans blabla. "
                "Si tu proposes une modification (produit, stock, prix, statut de commande), appelle "
                "l'outil de proposition correspondant UNE SEULE FOIS et arrête-toi — ne suppose jamais "
                "que la proposition a été acceptée, et n'enchaîne jamais une deuxième proposition dans "
                "la même réponse."
            ),
        }
        history = [system_message] + [
            {'role': m.role, 'content': m.content}
            for m in conv.messages.order_by('created_at') if m.role != 'tool'
        ]

        tool_definitions = list(ai_tools.TOOL_DEFINITIONS)
        write_tool_names = set()
        if is_owner_or_admin(request):
            tool_definitions = tool_definitions + ai_write_tools.WRITE_TOOL_DEFINITIONS
            write_tool_names = set(ai_write_tools.WRITE_TOOL_REGISTRY.keys())

        def tool_executor(name, arguments):
            if name in ai_write_tools.WRITE_TOOL_REGISTRY:
                result = ai_write_tools.execute_write_tool(request, conv, name, arguments)
            else:
                result = ai_tools.execute_tool(request, name, arguments)
            AIMessage.objects.create(conversation=conv, role='tool', content=f'{name}: {result}')
            return result

        try:
            final_content, pending_action_id = run_chat_loop(history, tool_definitions, tool_executor, write_tool_names=write_tool_names)
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)

        AIMessage.objects.create(conversation=conv, role='assistant', content=final_content, pending_action_id=pending_action_id)
        conv.save(update_fields=['updated_at'])

        response_data = {'conversation_id': conv.id, 'reply': final_content}
        if pending_action_id:
            action = AIPendingAction.objects.get(pk=pending_action_id)
            response_data['pending_action'] = AIPendingActionSerializer(action).data
        return Response(response_data)
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ChatViewWriteToolIntegrationTest -v 2`
Expected: `OK` (2 tests)

- [ ] **Step 5: Lancer toute la suite `ai_assistant`**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant -v 2`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/ai_assistant/views.py backend/ai_assistant/tests.py
git commit -m "feat(ai-agent): ChatView expose les outils d'écriture à l'owner/admin uniquement"
```

---

## Task 10: `vision_client.py` + configuration

**Files:**
- Create: `backend/ai_assistant/vision_client.py`
- Modify: `backend/config/settings.py`
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `ollama_client.GROQ_API_URL`, `ollama_client._groq_headers`, `ollama_client.OllamaUnavailableError`, `ollama_client.TIMEOUT_SECONDS`.
- Produces: `extract_product_from_image(image_bytes: bytes) -> dict` (lève `OllamaUnavailableError` ou `ValueError`/`KeyError` sur réponse invalide).

- [ ] **Step 1: Écrire les tests**

```python
from ai_assistant import vision_client


@override_settings(AI_PROVIDER='groq', GROQ_API_KEY='test-key', GROQ_VISION_MODEL='test-vision-model')
class VisionClientTest(TestCase):
    @patch('ai_assistant.vision_client.requests.post')
    def test_extract_product_from_photo(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {'choices': [{'message': {'content': '{"type": "product", "data": {"name": "Casquette", "price": 1200}}'}}]},
        )
        result = vision_client.extract_product_from_image(b'fake-image-bytes')
        self.assertEqual(result['type'], 'product')
        self.assertEqual(result['data']['name'], 'Casquette')

    @patch('ai_assistant.vision_client.requests.post')
    def test_extract_invoice_multiple_items(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {'choices': [{'message': {'content': '{"type": "invoice", "items": [{"name": "A", "price": 100}, {"name": "B", "price": 200}]}'}}]},
        )
        result = vision_client.extract_product_from_image(b'fake-image-bytes')
        self.assertEqual(result['type'], 'invoice')
        self.assertEqual(len(result['items']), 2)

    @patch('ai_assistant.vision_client.requests.post')
    def test_invalid_json_raises_value_error(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {'choices': [{'message': {'content': 'pas du json'}}]},
        )
        with self.assertRaises(ValueError):
            vision_client.extract_product_from_image(b'fake-image-bytes')

    @patch('ai_assistant.vision_client.requests.post')
    def test_provider_error_raises_unavailable(self, mock_post):
        mock_post.return_value = MagicMock(status_code=500, text='erreur serveur')
        with self.assertRaises(vision_client.OllamaUnavailableError):
            vision_client.extract_product_from_image(b'fake-image-bytes')

    @override_settings(AI_PROVIDER='ollama')
    def test_ollama_provider_not_supported_yet(self):
        with self.assertRaises(vision_client.OllamaUnavailableError):
            vision_client.extract_product_from_image(b'fake-image-bytes')
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.VisionClientTest -v 2`
Expected: `ModuleNotFoundError: No module named 'ai_assistant.vision_client'`

- [ ] **Step 3: Ajouter `GROQ_VISION_MODEL` et le throttle `ai_scan` aux settings**

Dans `backend/config/settings.py`, juste après la ligne `GROQ_MODEL = config('GROQ_MODEL', default='openai/gpt-oss-20b')` :

```python
GROQ_VISION_MODEL = config('GROQ_VISION_MODEL', default='meta-llama/llama-4-scout-17b-16e-instruct')
```

Dans le dict `DEFAULT_THROTTLE_RATES`, ajouter la clé (juste après `'public_chat': '10/min',`) :

```python
        'ai_scan':          '20/hour',
```

- [ ] **Step 4: Créer `vision_client.py`**

```python
"""Client vision — extraction de fiche(s) produit à partir d'une image
(photo d'un article, ou document fournisseur listant plusieurs articles).
Fournisseur unique pour l'instant : Groq (modèle multimodal Llama 4).
Ollama vision (llava/llama3.2-vision) reste hors de portée tant que le
serveur de production n'a pas été dimensionné au-delà de l'incident RAM
du 2026-09-05 (voir CLAUDE.md, section Assistant IA).

Voir docs/superpowers/specs/2026-09-11-agent-ia-ecriture-design.md."""
import base64
import json as _json

import requests
from django.conf import settings

from .ollama_client import OllamaUnavailableError, GROQ_API_URL, _groq_headers, TIMEOUT_SECONDS

SCAN_PROMPT = """Analyse cette image et réponds UNIQUEMENT avec un objet JSON valide (pas de texte avant/après).

Si l'image montre UN SEUL produit (photo d'article) :
{"type": "product", "data": {"name": "...", "description": "...", "price": <nombre ou null>, "category": "..."}}

Si l'image montre un DOCUMENT listant PLUSIEURS articles (facture/catalogue fournisseur) :
{"type": "invoice", "items": [{"name": "...", "price": <nombre ou null>, "category": "..."}, ...]}

Utilise null pour tout champ que tu ne peux pas déterminer avec confiance — n'invente JAMAIS un prix ou un nom."""


def extract_product_from_image(image_bytes):
    """Renvoie un dict `{'type': 'product', 'data': {...}}` ou
    `{'type': 'invoice', 'items': [...]}`. Lève `OllamaUnavailableError`
    (panne réseau/API, ou fournisseur autre que Groq) ou `ValueError`
    (réponse du modèle non parsable en JSON)."""
    if getattr(settings, 'AI_PROVIDER', 'ollama') != 'groq':
        raise OllamaUnavailableError("Le scan par image nécessite AI_PROVIDER=groq (modèle vision).")

    b64 = base64.b64encode(image_bytes).decode('ascii')
    payload = {
        'model': settings.GROQ_VISION_MODEL,
        'messages': [{
            'role': 'user',
            'content': [
                {'type': 'text', 'text': SCAN_PROMPT},
                {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{b64}'}},
            ],
        }],
        'response_format': {'type': 'json_object'},
    }
    try:
        resp = requests.post(GROQ_API_URL, json=payload, headers=_groq_headers(), timeout=TIMEOUT_SECONDS)
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
        raise OllamaUnavailableError(str(exc)) from exc
    if resp.status_code != 200:
        raise OllamaUnavailableError(f'Groq a répondu {resp.status_code}: {resp.text[:200]}')

    content = resp.json()['choices'][0]['message']['content']
    return _json.loads(content)  # ValueError si le modèle n'a pas renvoyé du JSON valide
```

- [ ] **Step 5: Lancer les tests, vérifier le succès**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.VisionClientTest -v 2`
Expected: `OK` (5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/ai_assistant/vision_client.py backend/config/settings.py backend/ai_assistant/tests.py
git commit -m "feat(ai-agent): client vision Groq pour le scan produit"
```

---

## Task 11: `ScanProductView` + brouillons issus du scan

**Files:**
- Modify: `backend/ai_assistant/views.py`
- Modify: `backend/ai_assistant/urls.py`
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `vision_client.extract_product_from_image`, `core.validators.validate_uploaded_file`, `AIProductDraft`, `AIProductDraftSerializer`.
- Produces: `ScanProductView` (`POST /api/ai/scan/`, multipart `image`) → `{'type': 'product', 'draft': {...}}` ou `{'type': 'invoice', 'drafts': [...]}`.

- [ ] **Step 1: Écrire les tests**

```python
from django.core.files.uploadedfile import SimpleUploadedFile
from .serializers import AIProductDraftSerializer


@override_settings(AI_PROVIDER='groq', GROQ_API_KEY='test-key', GROQ_VISION_MODEL='test-vision-model')
class ScanProductViewTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        clear_throttle_cache()

    def _image_file(self, name='produit.jpg'):
        return SimpleUploadedFile(name, b'\xff\xd8\xff' + b'0' * 100, content_type='image/jpeg')

    @patch('ai_assistant.views.vision_client.extract_product_from_image')
    def test_scan_single_product_creates_one_draft(self, mock_extract):
        mock_extract.return_value = {'type': 'product', 'data': {'name': 'Casquette', 'price': 1200, 'category': 'Accessoires'}}
        client = auth_client(self.owner)
        resp = client.post('/api/ai/scan/', {'image': self._image_file()}, format='multipart')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['type'], 'product')
        self.assertEqual(resp.data['draft']['extracted_data']['name'], 'Casquette')
        self.assertEqual(AIProductDraft.objects.filter(store=self.store, source='photo').count(), 1)

    @patch('ai_assistant.views.vision_client.extract_product_from_image')
    def test_scan_invoice_creates_multiple_drafts(self, mock_extract):
        mock_extract.return_value = {'type': 'invoice', 'items': [
            {'name': 'Produit A', 'price': 100}, {'name': 'Produit B', 'price': 200},
        ]}
        client = auth_client(self.owner)
        resp = client.post('/api/ai/scan/', {'image': self._image_file()}, format='multipart')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['type'], 'invoice')
        self.assertEqual(len(resp.data['drafts']), 2)
        self.assertEqual(AIProductDraft.objects.filter(store=self.store, source='invoice').count(), 2)

    def test_scan_forbidden_for_confirmateur(self):
        confirmateur, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(confirmateur)
        resp = client.post('/api/ai/scan/', {'image': self._image_file()}, format='multipart')
        self.assertEqual(resp.status_code, 403)

    def test_scan_rejects_disallowed_extension(self):
        client = auth_client(self.owner)
        bad_file = SimpleUploadedFile('malware.exe', b'MZ' + b'0' * 100, content_type='application/octet-stream')
        resp = client.post('/api/ai/scan/', {'image': bad_file}, format='multipart')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(AIProductDraft.objects.count(), 0)

    @patch('ai_assistant.views.vision_client.extract_product_from_image')
    def test_scan_malformed_model_response_returns_502(self, mock_extract):
        mock_extract.side_effect = ValueError('JSON invalide')
        client = auth_client(self.owner)
        resp = client.post('/api/ai/scan/', {'image': self._image_file()}, format='multipart')
        self.assertEqual(resp.status_code, 502)
        self.assertEqual(AIProductDraft.objects.count(), 0)

    @patch('ai_assistant.views.vision_client.extract_product_from_image')
    def test_scan_provider_unavailable_returns_503(self, mock_extract):
        from ai_assistant.vision_client import OllamaUnavailableError
        mock_extract.side_effect = OllamaUnavailableError('panne')
        client = auth_client(self.owner)
        resp = client.post('/api/ai/scan/', {'image': self._image_file()}, format='multipart')
        self.assertEqual(resp.status_code, 503)
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ScanProductViewTest -v 2`
Expected: `404` (route inexistante)

- [ ] **Step 3: Ajouter `ScanProductView`**

Ajouter en haut de `views.py` : `from . import vision_client` et `from .serializers import AIPendingActionSerializer, AIProductDraftSerializer` (fusionner avec l'import existant de `AIPendingActionSerializer`).

Ajouter dans `views.py` (après `ChatView`, avant les vues de pending action) :

```python
class ScanProductView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = 'ai_scan'

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        image_file = request.FILES.get('image')
        if not image_file:
            return Response({'detail': 'Une image est requise.'}, status=400)

        from core.validators import validate_uploaded_file
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_uploaded_file(image_file)
        except DjangoValidationError as exc:
            return Response({'detail': '; '.join(exc.messages) if hasattr(exc, 'messages') else str(exc)}, status=400)

        try:
            result = vision_client.extract_product_from_image(image_file.read())
        except vision_client.OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)
        except (ValueError, KeyError, TypeError):
            return Response({'detail': "Photo pas assez nette ou document illisible, réessayez."}, status=502)

        image_file.seek(0)

        if result.get('type') == 'invoice':
            items = result.get('items') or []
            if not items:
                return Response({'detail': "Aucun article détecté sur ce document."}, status=502)
            drafts = [
                AIProductDraft.objects.create(store=store, source='invoice', extracted_data=item)
                for item in items
            ]
            return Response({'type': 'invoice', 'drafts': AIProductDraftSerializer(drafts, many=True).data})

        data = result.get('data') or {}
        if not data.get('name'):
            return Response({'detail': "Aucun produit détecté sur cette photo."}, status=502)
        draft = AIProductDraft.objects.create(store=store, source='photo', source_image=image_file, extracted_data=data)
        return Response({'type': 'product', 'draft': AIProductDraftSerializer(draft).data})
```

Ajouter dans `urls.py` :

```python
    path('scan/', ScanProductView.as_view()),
```
(et importer `ScanProductView` dans le `from .views import (...)`)

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ScanProductViewTest -v 2`
Expected: `OK` (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/ai_assistant/views.py backend/ai_assistant/urls.py backend/ai_assistant/tests.py
git commit -m "feat(ai-agent): endpoint de scan produit (photo + facture multi-articles)"
```

---

## Task 12: Endpoints brouillons produit (`ProductDraftListView`/`Create`/`Discard`)

**Files:**
- Modify: `backend/ai_assistant/views.py`
- Modify: `backend/ai_assistant/urls.py`
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `products.serializers.ProductSerializer`.
- Produces: `ProductDraftListView` (`GET /api/ai/product-drafts/`), `ProductDraftCreateView` (`POST /api/ai/product-drafts/<id>/create/`), `ProductDraftDiscardView` (`POST /api/ai/product-drafts/<id>/discard/`).

- [ ] **Step 1: Écrire les tests**

```python
class ProductDraftEndpointsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        self.draft = AIProductDraft.objects.create(
            store=self.store, source='invoice', extracted_data={'name': 'Sac à dos', 'price': 3500},
        )

    def test_list_only_pending_review_invoice_drafts(self):
        AIProductDraft.objects.create(store=self.store, source='photo', extracted_data={'name': 'Photo produit', 'price': 100})
        created = AIProductDraft.objects.create(store=self.store, source='invoice', extracted_data={'name': 'Déjà créé', 'price': 100}, status='created')
        client = auth_client(self.owner)
        resp = client.get('/api/ai/product-drafts/')
        self.assertEqual(resp.status_code, 200)
        names = [d['extracted_data']['name'] for d in resp.data]
        self.assertIn('Sac à dos', names)
        self.assertNotIn('Photo produit', names)
        self.assertNotIn('Déjà créé', names)

    def test_create_from_draft(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/product-drafts/{self.draft.id}/create/')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['name'], 'Sac à dos')
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, 'created')
        self.assertIsNotNone(self.draft.created_product)

    def test_create_from_already_resolved_draft_returns_404(self):
        self.draft.status = 'created'
        self.draft.save(update_fields=['status'])
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/product-drafts/{self.draft.id}/create/')
        self.assertEqual(resp.status_code, 404)

    def test_discard_draft(self):
        client = auth_client(self.owner)
        resp = client.post(f'/api/ai/product-drafts/{self.draft.id}/discard/')
        self.assertEqual(resp.status_code, 200)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, 'discarded')

    def test_forbidden_for_confirmateur(self):
        confirmateur, _ = make_team_member(self.store, 'confirmateur')
        client = auth_client(confirmateur)
        resp = client.get('/api/ai/product-drafts/')
        self.assertEqual(resp.status_code, 403)
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ProductDraftEndpointsTest -v 2`
Expected: `404` (routes inexistantes)

- [ ] **Step 3: Ajouter les vues**

Ajouter dans `views.py` (après `ScanProductView`) :

```python
class ProductDraftListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = get_store(request)
        drafts = AIProductDraft.objects.filter(store=store, status='pending_review', source='invoice').order_by('-created_at')
        return Response(AIProductDraftSerializer(drafts, many=True).data)


class ProductDraftCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = get_store(request)
        try:
            draft = AIProductDraft.objects.get(pk=pk, store=store, status='pending_review')
        except AIProductDraft.DoesNotExist:
            return Response({'detail': 'Brouillon introuvable.'}, status=404)

        data = draft.extracted_data
        if not data.get('name') or data.get('price') is None:
            return Response({'detail': 'Nom et prix requis pour créer le produit.'}, status=400)

        from products.serializers import ProductSerializer
        serializer = ProductSerializer(data={
            'name': data['name'], 'price': data['price'], 'description': data.get('description', ''),
        })
        serializer.is_valid(raise_exception=True)
        product = serializer.save(store=store)
        draft.status = 'created'
        draft.created_product = product
        draft.save(update_fields=['status', 'created_product'])
        return Response(ProductSerializer(product).data, status=201)


class ProductDraftDiscardView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = get_store(request)
        try:
            draft = AIProductDraft.objects.get(pk=pk, store=store, status='pending_review')
        except AIProductDraft.DoesNotExist:
            return Response({'detail': 'Brouillon introuvable.'}, status=404)
        draft.status = 'discarded'
        draft.save(update_fields=['status'])
        return Response({'status': 'discarded'})
```

Ajouter dans `urls.py` (imports + urlpatterns) :

```python
    path('product-drafts/', ProductDraftListView.as_view()),
    path('product-drafts/<int:pk>/create/', ProductDraftCreateView.as_view()),
    path('product-drafts/<int:pk>/discard/', ProductDraftDiscardView.as_view()),
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ProductDraftEndpointsTest -v 2`
Expected: `OK` (5 tests)

- [ ] **Step 5: Lancer toute la suite backend concernée pour vérifier l'absence de régression**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant products orders team -v 2`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/ai_assistant/views.py backend/ai_assistant/urls.py backend/ai_assistant/tests.py
git commit -m "feat(ai-agent): endpoints brouillons produit (liste/création/rejet)"
```

---

## Task 13: Frontend — `api/aiApi.js`

**Files:**
- Modify: `frontend/src/api/aiApi.js`
- Test: `frontend/src/tests/pages/ai/AIAssistantPage.test.jsx` (mise à jour minime, voir Task 14)

**Interfaces:**
- Produces: `confirmPendingAction(id)`, `rejectPendingAction(id)`, `scanProduct(file)`, `listProductDrafts()`, `createProductFromDraft(id)`, `discardProductDraft(id)`.

- [ ] **Step 1: Ajouter les fonctions**

Ajouter à la fin de `frontend/src/api/aiApi.js` :

```js
export function confirmPendingAction(id) {
  return api.post(`/ai/pending-actions/${id}/confirm/`).then(r => r.data)
}

export function rejectPendingAction(id) {
  return api.post(`/ai/pending-actions/${id}/reject/`).then(r => r.data)
}

export function scanProduct(file) {
  const form = new FormData()
  form.append('image', file)
  return api.post('/ai/scan/', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
}

export function listProductDrafts() {
  return api.get('/ai/product-drafts/').then(r => r.data)
}

export function createProductFromDraft(id) {
  return api.post(`/ai/product-drafts/${id}/create/`).then(r => r.data)
}

export function discardProductDraft(id) {
  return api.post(`/ai/product-drafts/${id}/discard/`).then(r => r.data)
}
```

- [ ] **Step 2: Vérifier qu'aucun test existant ne casse**

Run: `cd frontend && npm run test -- aiApi`
Expected: aucun test dédié à ce fichier n'existe encore (pas d'échec) — les fonctions seront exercées indirectement par les tests des Tasks 14-16.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/aiApi.js
git commit -m "feat(ai-agent): fonctions API pending-actions/scan/drafts"
```

---

## Task 14: Frontend — carte de proposition dans `AIAssistantPage.jsx`

**Files:**
- Modify: `frontend/src/pages/ai/AIAssistantPage.jsx`
- Test: `frontend/src/tests/pages/ai/AIAssistantPage.test.jsx`

**Interfaces:**
- Consumes: `confirmPendingAction`, `rejectPendingAction` (Task 13).
- Produces: composant `PendingActionCard({ action, onResolved })`, message assistant enrichi d'un champ `pending_action`.

- [ ] **Step 1: Écrire les tests**

Ajouter à la fin de `frontend/src/tests/pages/ai/AIAssistantPage.test.jsx` (avant le dernier `})` de `describe`, ou juste après le dernier test existant) :

```js
  it("affiche une carte de proposition et confirme l'action au clic", async () => {
    const axios = (await import('../../../api/axios')).default
    axios.post.mockImplementation((url) => {
      if (url === '/ai/chat/') {
        return Promise.resolve({ data: {
          conversation_id: 1, reply: '',
          pending_action: {
            id: 42, tool_name: 'propose_update_product', status: 'pending',
            summary: 'Modifier « T-shirt » : prix 2000 → 1800',
            payload: [{ id: 1, name: 'T-shirt', before: { price: 2000 }, after: { price: 1800 } }],
          },
        } })
      }
      if (url === '/ai/pending-actions/42/confirm/') return Promise.resolve({ data: { status: 'confirmed' } })
      return Promise.resolve({ data: {} })
    })
    render(<MemoryRouter><AIAssistantPage /></MemoryRouter>)
    const input = await screen.findByPlaceholderText(/posez une question/i)
    fireEvent.change(input, { target: { value: 'Baisse le prix du T-shirt à 1800' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    await screen.findByText(/Modifier « T-shirt »/)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/ai/pending-actions/42/confirm/'))
    await waitFor(() => expect(screen.getByText('Confirmé')).toBeInTheDocument())
  })

  it('rejette une proposition au clic sur Rejeter', async () => {
    const axios = (await import('../../../api/axios')).default
    axios.post.mockImplementation((url) => {
      if (url === '/ai/chat/') {
        return Promise.resolve({ data: {
          conversation_id: 1, reply: '',
          pending_action: { id: 7, tool_name: 'propose_update_product', status: 'pending', summary: 'Modifier « X »', payload: [] },
        } })
      }
      if (url === '/ai/pending-actions/7/reject/') return Promise.resolve({ data: { status: 'rejected' } })
      return Promise.resolve({ data: {} })
    })
    render(<MemoryRouter><AIAssistantPage /></MemoryRouter>)
    const input = await screen.findByPlaceholderText(/posez une question/i)
    fireEvent.change(input, { target: { value: 'Modifie X' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    await screen.findByText('Modifier « X »')
    fireEvent.click(screen.getByRole('button', { name: 'Rejeter' }))
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/ai/pending-actions/7/reject/'))
    await waitFor(() => expect(screen.getByText('Rejeté')).toBeInTheDocument())
  })
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd frontend && npm run test -- AIAssistantPage`
Expected: échec — `screen.getByText(/Modifier « T-shirt »/)` introuvable (rien n'affiche encore la proposition).

- [ ] **Step 3: Modifier `AIAssistantPage.jsx`**

Ajouter les imports nécessaires en haut du fichier (à côté des imports existants) :

```js
import { listConversations, getConversation, sendChatMessage, deleteConversation, confirmPendingAction, rejectPendingAction } from '../../api/aiApi'
```
(remplace la ligne d'import existante de `../../api/aiApi`)

Ajouter le composant `PendingActionCard`, juste après `MessageBubble` :

```jsx
function PendingActionCard({ action, onResolved }) {
  const [busy, setBusy] = useState(false)
  const [resolvedStatus, setResolvedStatus] = useState(action.status === 'pending' ? null : action.status)

  const handle = async (fn, status) => {
    setBusy(true)
    try {
      await fn(action.id)
      setResolvedStatus(status)
      onResolved?.(action.id, status)
    } catch {
      // best-effort — l'utilisateur peut réessayer, aucun crash de l'UI
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-2.5">
      <Avatar role="assistant" />
      <div className="rounded-2xl rounded-tl-sm border border-app bg-app-card-alt px-3.5 py-3 max-w-[75%] text-sm">
        <p className="font-medium text-app-primary mb-2">{action.summary}</p>
        {action.payload?.length > 0 && (
          <ul className="space-y-1 mb-3 text-xs text-app-muted-light">
            {action.payload.slice(0, 10).map((item, i) => (
              <li key={i}>{item.name} — {JSON.stringify(item.before)} → {JSON.stringify(item.after)}</li>
            ))}
          </ul>
        )}
        {resolvedStatus === 'confirmed' && <p className="text-xs font-medium text-emerald-500">Confirmé</p>}
        {resolvedStatus === 'rejected' && <p className="text-xs font-medium text-app-muted">Rejeté</p>}
        {!resolvedStatus && (
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => handle(confirmPendingAction, 'confirmed')}
              className={theme.btn.primary + ' text-xs px-3 py-1.5 disabled:opacity-40'}>
              Confirmer
            </button>
            <button type="button" disabled={busy} onClick={() => handle(rejectPendingAction, 'rejected')}
              className="text-xs px-3 py-1.5 rounded-lg border border-app text-app-muted-light hover:text-app-primary transition disabled:opacity-40">
              Rejeter
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

Dans `handleSend`, remplacer :

```js
      const data = await sendChatMessage({ conversationId: activeId, message: text })
      setActiveId(data.conversation_id)
      setMessages(m => [...m, { role: 'assistant', content: data.reply }])
      refreshConversations()
```

par :

```js
      const data = await sendChatMessage({ conversationId: activeId, message: text })
      setActiveId(data.conversation_id)
      setMessages(m => [...m, { role: 'assistant', content: data.reply, pending_action: data.pending_action || null }])
      refreshConversations()
```

Dans le rendu du fil de discussion, remplacer :

```jsx
            {visibleMessages.map((m, i) => <MessageBubble key={i} role={m.role} content={m.content} />)}
```

par :

```jsx
            {visibleMessages.map((m, i) => (
              m.pending_action
                ? <PendingActionCard key={i} action={m.pending_action} />
                : <MessageBubble key={i} role={m.role} content={m.content} />
            ))}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `cd frontend && npm run test -- AIAssistantPage`
Expected: `PASS` (tous les tests, y compris les 2 nouveaux)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ai/AIAssistantPage.jsx frontend/src/tests/pages/ai/AIAssistantPage.test.jsx
git commit -m "feat(ai-agent): carte de proposition (aperçu + confirmer/rejeter) dans le chat"
```

---

## Task 15: Frontend — `pages/products/ProductDraftsPage.jsx`

**Files:**
- Create: `frontend/src/pages/products/ProductDraftsPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/DashboardLayout.jsx`
- Test: `frontend/src/tests/pages/products/ProductDraftsPage.test.jsx`

**Interfaces:**
- Consumes: `listProductDrafts`, `createProductFromDraft`, `discardProductDraft` (Task 13).
- Produces: page `/dashboard/produits/brouillons-ia`, `perm="ownerAdmin"`.

- [ ] **Step 1: Écrire le test**

Créer `frontend/src/tests/pages/products/ProductDraftsPage.test.jsx` :

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ProductDraftsPage from '../../../pages/products/ProductDraftsPage'

vi.mock('../../../api/axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { count: 0 } })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../../api/aiApi', () => ({
  listProductDrafts: vi.fn(() => Promise.resolve([
    { id: 1, extracted_data: { name: 'Casquette', price: 1200 }, status: 'pending_review', created_at: '2026-09-11' },
    { id: 2, extracted_data: { name: 'Sac à dos', price: 3500 }, status: 'pending_review', created_at: '2026-09-11' },
  ])),
  createProductFromDraft: vi.fn(() => Promise.resolve({ id: 10, name: 'Casquette' })),
  discardProductDraft: vi.fn(() => Promise.resolve({ status: 'discarded' })),
}))
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

describe('ProductDraftsPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('affiche les brouillons en attente', async () => {
    render(<MemoryRouter><ProductDraftsPage /></MemoryRouter>)
    expect(await screen.findByText('Casquette')).toBeInTheDocument()
    expect(screen.getByText('Sac à dos')).toBeInTheDocument()
  })

  it('crée les produits sélectionnés', async () => {
    const { createProductFromDraft } = await import('../../../api/aiApi')
    render(<MemoryRouter><ProductDraftsPage /></MemoryRouter>)
    await screen.findByText('Casquette')
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: /créer les produits sélectionnés/i }))
    await waitFor(() => expect(createProductFromDraft).toHaveBeenCalledWith(1))
  })

  it('rejette un brouillon', async () => {
    const { discardProductDraft } = await import('../../../api/aiApi')
    render(<MemoryRouter><ProductDraftsPage /></MemoryRouter>)
    await screen.findByText('Casquette')
    fireEvent.click(screen.getAllByLabelText('Rejeter ce brouillon')[0])
    await waitFor(() => expect(discardProductDraft).toHaveBeenCalledWith(1))
  })

  it("affiche un état vide s'il n'y a aucun brouillon", async () => {
    const { listProductDrafts } = await import('../../../api/aiApi')
    listProductDrafts.mockResolvedValueOnce([])
    render(<MemoryRouter><ProductDraftsPage /></MemoryRouter>)
    expect(await screen.findByText(/aucun brouillon/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd frontend && npm run test -- ProductDraftsPage`
Expected: `Error: Failed to resolve import "../../../pages/products/ProductDraftsPage"`

- [ ] **Step 3: Créer la page**

```jsx
import { useState, useEffect, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import EmptyState from '../../components/EmptyState'
import Toast from '../../components/Toast'
import { theme } from '../../theme'
import { listProductDrafts, createProductFromDraft, discardProductDraft } from '../../api/aiApi'

export default function ProductDraftsPage() {
  const [drafts, setDrafts] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const refresh = useCallback(() => {
    setLoading(true)
    listProductDrafts().then(setDrafts).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const handleCreateSelected = async () => {
    setBusy(true)
    for (const id of selected) {
      try { await createProductFromDraft(id) } catch { /* best-effort, on continue les autres */ }
    }
    setBusy(false)
    setSelected([])
    setToast({ message: 'Produits créés à partir des brouillons sélectionnés.' })
    refresh()
  }

  const handleDiscard = async id => {
    try { await discardProductDraft(id) } catch { /* best-effort */ }
    refresh()
  }

  return (
    <DashboardLayout title="Brouillons de produits (IA)" subtitle="Issus d'un scan de facture ou de catalogue fournisseur — validez avant création.">
      {loading ? (
        <p className="text-sm text-app-muted">Chargement…</p>
      ) : drafts.length === 0 ? (
        <EmptyState title="Aucun brouillon en attente" description="Scannez une photo de produit ou une facture fournisseur pour en générer." />
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-app bg-app-card divide-y divide-app">
            {drafts.map(d => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-app-primary">{d.extracted_data.name}</p>
                  <p className="text-xs text-app-muted">{d.extracted_data.price} DA{d.extracted_data.category ? ` — ${d.extracted_data.category}` : ''}</p>
                </div>
                <button type="button" aria-label="Rejeter ce brouillon" onClick={() => handleDiscard(d.id)}
                  className="text-xs text-app-muted hover:text-red-400 transition">
                  Rejeter
                </button>
              </div>
            ))}
          </div>
          <button type="button" disabled={busy || selected.length === 0} onClick={handleCreateSelected}
            className={theme.btn.primary + ' text-sm disabled:opacity-40'}>
            Créer les produits sélectionnés ({selected.length})
          </button>
        </div>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </DashboardLayout>
  )
}
```

Vérifier dans `frontend/src/components/Toast.jsx` la prop attendue (si l'API diffère — ex. `toast`/`onClose` vs un autre nom — adapter cet appel à la signature réelle du composant existant avant de continuer).

- [ ] **Step 4: Ajouter la route dans `App.jsx`**

Ajouter l'import (à côté des autres imports `products/`) :

```js
import ProductDraftsPage from './pages/products/ProductDraftsPage'
```

Ajouter la route (à côté de `/dashboard/produits/nouveau`) :

```jsx
          <Route path="/dashboard/produits/brouillons-ia"      element={<PD perm="ownerAdmin"><ProductDraftsPage /></PD>} />
```

- [ ] **Step 5: Ajouter le lien sidebar dans `DashboardLayout.jsx`**

Dans le bloc IA (`frontend/src/components/DashboardLayout.jsx:775-782`), transformer le lien isolé "Assistant IA" en petit groupe "Assistant" pour y ajouter le lien vers les brouillons — remplacer :

```jsx
                {can('ai_assistant_view') && (
                  <li>{mainLink('/dashboard/assistant-ia', ICONS.marketing, 'Assistant IA')}</li>
                )}
```

par :

```jsx
                {can('ai_assistant_view') && (
                  <li>{mainLink('/dashboard/assistant-ia', ICONS.marketing, 'Assistant IA')}</li>
                )}
                {ownerOrAdmin && (
                  <li>{link('/dashboard/produits/brouillons-ia', 'Brouillons de produits (scan)')}</li>
                )}
```

(vérifier au préalable dans `DashboardLayout.jsx` le nom exact de la variable/fonction qui expose déjà `owner/admin` dans ce composant — probablement `ownerOrAdmin` comme dans `App.jsx:110`, sinon la calculer localement via `!teamRole || teamRole === 'admin'` avant ce bloc, en réutilisant `teamRole` déjà lu plus haut dans le fichier pour peupler `can()`.)

- [ ] **Step 6: Lancer les tests, vérifier le succès**

Run: `cd frontend && npm run test -- ProductDraftsPage`
Expected: `PASS` (4 tests)

Run: `cd frontend && npm run test -- App.test`
Expected: `PASS` (le test qui échoue automatiquement sur une route `/dashboard/*` sans `perm=` continue de passer, `ownerAdmin` est une valeur reconnue).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/products/ProductDraftsPage.jsx frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx frontend/src/tests/pages/products/ProductDraftsPage.test.jsx
git commit -m "feat(ai-agent): page brouillons de produits issus du scan"
```

---

## Task 16: Frontend — page de scan (upload) + navigation vers le résultat

**Files:**
- Create: `frontend/src/pages/ai/ScanProductPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/DashboardLayout.jsx`
- Test: `frontend/src/tests/pages/ai/ScanProductPage.test.jsx`

**Interfaces:**
- Consumes: `scanProduct` (Task 13).
- Produces: page `/dashboard/produits/scanner`, redirige vers `/dashboard/produits/nouveau` (état `{ prefill }`) pour un résultat `product`, ou vers `/dashboard/produits/brouillons-ia` pour un résultat `invoice`.

- [ ] **Step 1: Écrire le test**

Créer `frontend/src/tests/pages/ai/ScanProductPage.test.jsx` :

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ScanProductPage from '../../../pages/ai/ScanProductPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('../../../api/axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: {} })) } }))
vi.mock('../../../api/aiApi', () => ({ scanProduct: vi.fn() }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { team_role: null, permissions: {} } }) }))

function makeFile() {
  return new File(['contenu'], 'produit.jpg', { type: 'image/jpeg' })
}

describe('ScanProductPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upload une photo produit et redirige vers le formulaire pré-rempli', async () => {
    const { scanProduct } = await import('../../../api/aiApi')
    scanProduct.mockResolvedValue({ type: 'product', draft: { id: 1, extracted_data: { name: 'Casquette', price: 1200, description: '' } } })
    render(<MemoryRouter><ScanProductPage /></MemoryRouter>)
    const input = screen.getByLabelText(/choisir une image/i)
    fireEvent.change(input, { target: { files: [makeFile()] } })
    fireEvent.click(screen.getByRole('button', { name: /analyser/i }))
    await waitFor(() => expect(scanProduct).toHaveBeenCalled())
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      '/dashboard/produits/nouveau',
      { state: { prefill: { name: 'Casquette', price: 1200, description: '' } } },
    ))
  })

  it('upload une facture multi-articles et redirige vers les brouillons', async () => {
    const { scanProduct } = await import('../../../api/aiApi')
    scanProduct.mockResolvedValue({ type: 'invoice', drafts: [{ id: 1 }, { id: 2 }] })
    render(<MemoryRouter><ScanProductPage /></MemoryRouter>)
    const input = screen.getByLabelText(/choisir une image/i)
    fireEvent.change(input, { target: { files: [makeFile()] } })
    fireEvent.click(screen.getByRole('button', { name: /analyser/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard/produits/brouillons-ia'))
  })

  it('affiche une erreur sans planter si le scan échoue', async () => {
    const { scanProduct } = await import('../../../api/aiApi')
    scanProduct.mockRejectedValue({ response: { data: { detail: 'Assistant IA indisponible' } } })
    render(<MemoryRouter><ScanProductPage /></MemoryRouter>)
    const input = screen.getByLabelText(/choisir une image/i)
    fireEvent.change(input, { target: { files: [makeFile()] } })
    fireEvent.click(screen.getByRole('button', { name: /analyser/i }))
    expect(await screen.findByText('Assistant IA indisponible')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `cd frontend && npm run test -- ScanProductPage`
Expected: `Error: Failed to resolve import "../../../pages/ai/ScanProductPage"`

- [ ] **Step 3: Créer la page**

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import { theme } from '../../theme'
import { scanProduct } from '../../api/aiApi'

export default function ScanProductPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleAnalyze = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const result = await scanProduct(file)
      if (result.type === 'invoice') {
        navigate('/dashboard/produits/brouillons-ia')
      } else {
        const data = result.draft.extracted_data
        navigate('/dashboard/produits/nouveau', {
          state: { prefill: { name: data.name || '', price: data.price ?? '', description: data.description || '' } },
        })
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Assistant IA indisponible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DashboardLayout title="Scanner un produit" subtitle="Photo d'un seul article, ou d'une facture/catalogue fournisseur listant plusieurs articles.">
      <div className="max-w-md space-y-4 rounded-xl border border-app bg-app-card p-5">
        <label className="block text-sm font-medium text-app-primary">
          Choisir une image
          <input type="file" accept="image/*" aria-label="Choisir une image"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="mt-2 block w-full text-sm text-app-muted-light" />
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button type="button" disabled={!file || busy} onClick={handleAnalyze}
          className={theme.btn.primary + ' text-sm disabled:opacity-40'}>
          {busy ? 'Analyse en cours…' : 'Analyser'}
        </button>
      </div>
    </DashboardLayout>
  )
}
```

- [ ] **Step 4: Route + sidebar**

Dans `App.jsx`, ajouter l'import et la route :

```js
import ScanProductPage from './pages/ai/ScanProductPage'
```
```jsx
          <Route path="/dashboard/produits/scanner"            element={<PD perm="ownerAdmin"><ScanProductPage /></PD>} />
```

Dans `DashboardLayout.jsx`, ajouter un second lien à côté de "Brouillons de produits" (dans le même bloc `ownerOrAdmin` ajouté à la Task 15) :

```jsx
                {ownerOrAdmin && (
                  <li>{link('/dashboard/produits/scanner', 'Scanner un produit')}</li>
                )}
```

- [ ] **Step 5: Lancer les tests, vérifier le succès**

Run: `cd frontend && npm run test -- ScanProductPage`
Expected: `PASS` (3 tests)

Run: `cd frontend && npm run test -- App.test`
Expected: `PASS`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ai/ScanProductPage.jsx frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx frontend/src/tests/pages/ai/ScanProductPage.test.jsx
git commit -m "feat(ai-agent): page de scan produit (upload photo/facture)"
```

---

## Task 17: Frontend — pré-remplissage de `ProductFormPage.jsx` depuis un scan

**Files:**
- Modify: `frontend/src/pages/products/ProductFormPage.jsx`
- Test: `frontend/src/tests/pages/products/ProductFormPage.test.jsx` (fichier existant — vérifier son nom exact avant modification, sinon créer)

**Interfaces:**
- Consumes: `location.state.prefill` (`{name, price, description}`, Task 16).
- Produces: le formulaire de création s'initialise avec ces valeurs quand elles sont présentes, comportement inchangé sinon.

- [ ] **Step 1: Vérifier le fichier de test existant et son style**

Run: `cd frontend && find src/tests/pages/products -iname "ProductFormPage*"`

Lire le fichier trouvé pour reprendre exactement ses mocks (`vi.mock('../../../api/axios', ...)`, `useAuth`, etc.) avant d'ajouter le test suivant — ne pas dupliquer une configuration de mock incompatible avec celle déjà en place dans ce fichier.

- [ ] **Step 2: Écrire le test (échoue)**

Ajouter au fichier de test existant (adapter les imports `MemoryRouter`/`Route` selon ce que le fichier utilise déjà pour simuler `location.state` — le plus simple est un `<MemoryRouter initialEntries={[{ pathname: '/dashboard/produits/nouveau', state: { prefill: { name: 'Casquette scannée', price: 1200, description: 'Une casquette' } } }]}>`) :

```jsx
  it('pré-remplit le formulaire depuis un brouillon de scan (location.state.prefill)', async () => {
    render(
      <MemoryRouter initialEntries={[{
        pathname: '/dashboard/produits/nouveau',
        state: { prefill: { name: 'Casquette scannée', price: 1200, description: 'Une casquette' } },
      }]}>
        <Routes>
          <Route path="/dashboard/produits/nouveau" element={<ProductFormPage />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByDisplayValue('Casquette scannée')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1200')).toBeInTheDocument()
  })
```

(Ajouter `Routes, Route` à l'import `react-router-dom` du fichier de test si absent.)

- [ ] **Step 3: Lancer le test, vérifier l'échec**

Run: `cd frontend && npm run test -- ProductFormPage`
Expected: échec — le champ nom reste vide (`EMPTY.name`).

- [ ] **Step 4: Modifier `ProductFormPage.jsx`**

Ajouter `useLocation` à l'import `react-router-dom` en haut du fichier :

```js
import { useNavigate, useParams, useLocation } from 'react-router-dom'
```

Ajouter, avant la ligne `const [form, setForm] = useState(EMPTY)` (ligne 561) :

```js
  const location = useLocation()
```

Remplacer la ligne 561 :

```js
  const [form, setForm]             = useState(EMPTY)
```

par :

```js
  const [form, setForm]             = useState(() => ({ ...EMPTY, ...(location.state?.prefill || {}) }))
```

- [ ] **Step 5: Lancer le test, vérifier le succès**

Run: `cd frontend && npm run test -- ProductFormPage`
Expected: `PASS` (tous les tests, y compris le nouveau)

- [ ] **Step 6: Lancer toute la suite frontend pour vérifier l'absence de régression**

Run: `cd frontend && npm run test`
Expected: `PASS` (aucune régression sur les ~400+ tests existants)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/products/ProductFormPage.jsx frontend/src/tests/pages/products/ProductFormPage.test.jsx
git commit -m "feat(ai-agent): pré-remplissage du formulaire produit depuis un scan photo"
```

---

## Vérification finale

- [ ] Run: `cd backend && venv/Scripts/python manage.py test` — suite backend complète, aucune régression.
- [ ] Run: `cd frontend && npm run test` — suite frontend complète, aucune régression.
- [ ] Run: `cd frontend && npm run build` — build de production sans erreur.
- [ ] Mettre à jour `CLAUDE.md` (racine du projet) — nouvelle section décrivant le chantier (modèles `AIPendingAction`/`AIProductDraft`, outils d'écriture, endpoints, pages), à l'image des sections existantes du chantier IA (règle n°3 du workflow par epic : mise à jour systématique en fin de chantier). Ne PAS commit/push tant que l'utilisateur n'a pas donné son feu vert explicite (règle n°4 du workflow, CLAUDE.md).
