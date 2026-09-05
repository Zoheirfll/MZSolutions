# Chatbot boutique publique — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un chatbot IA sur la boutique publique (widget flottant, sans compte client) capable de répondre aux questions produits, infos générales, et statut de commande (après vérification téléphone+numéro).

**Architecture:** Extension du modèle `AIConversation` existant (canal dashboard vs boutique publique distingué par `user` XOR `session_id`), nouvelle vue publique `PublicChatView` réutilisant le client IA multi-fournisseur déjà en place (`ai_assistant/ollama_client.py`), boucle de tool-calling factorisée (`chat_loop.py`) entre le canal dashboard et le canal public pour ne rien dupliquer. Widget React monté dans `StorefrontLayout.jsx`, session identifiée côté client via `localStorage` (même pattern que `CartContext`).

**Tech Stack:** Django 5.2 + DRF (backend existant), React 18 (frontend existant), Tailwind + `theme.js`.

## Global Constraints

- Zéro CSS custom — Tailwind + `theme.js`/variables `--sf-*` (thème storefront) uniquement.
- L'anti-énumération sur le statut de commande est non négociable : un mismatch téléphone/commande renvoie **toujours** le même message générique, jamais de distinction "téléphone faux" vs "commande inexistante".
- Les tools publics (`PUBLIC_TOOL_REGISTRY`) et les tools dashboard (`TOOL_REGISTRY`) restent dans des dictionnaires strictement séparés — jamais fusionnés, jamais un tool dashboard accessible au canal public.
- `throttle_scope = 'public_chat'` (10/min, `ScopedRateThrottle` — déjà globalement actif via `DEFAULT_THROTTLE_CLASSES`, il suffit de poser l'attribut sur la vue) sur les deux endpoints publics.
- Toute panne IA (Ollama/Groq) → `503 {"detail": "Assistant IA indisponible"}`, jamais un 500.
- Tests obligatoires par tâche, commits fréquents, jamais `git add -A`.

---

## File Structure

```
backend/
  ai_assistant/
    models.py            — AIConversation.user devient nullable, + session_id, + CheckConstraint (modifié)
    migrations/0002_...  — migration correspondante (créée)
    chat_loop.py          — run_chat_loop() factorisé depuis ChatView (nouveau)
    views.py              — ChatView utilise chat_loop.py (modifié)
    tools.py              — + public_search_products, public_get_order_status, PUBLIC_TOOL_REGISTRY/DEFINITIONS, execute_public_tool() (modifié)
    public_views.py       — PublicChatView, PublicChatHistoryView (nouveau)
    tests.py               — tests des 3 tâches backend (modifié)
  products/public_urls.py — 2 routes chat/ ajoutées (modifié)
  config/settings.py       — throttle_scope 'public_chat': '10/min' (modifié)

frontend/src/
  api/publicChatApi.js                    — sendPublicChatMessage(), getPublicChatHistory() (nouveau)
  components/StorefrontChatWidget.jsx     — widget flottant (nouveau)
  pages/storefront/StorefrontLayout.jsx   — monte le widget (modifié)
  tests/components/StorefrontChatWidget.test.jsx (nouveau)

CLAUDE.md — section Assistant IA étendue (modifié)
```

---

### Task 1: Modèle — canal public (`session_id`) sur `AIConversation`

**Files:**
- Modify: `backend/ai_assistant/models.py`
- Create: `backend/ai_assistant/migrations/0002_aiconversation_session_id.py` (générée)
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Produces: `AIConversation.session_id` (CharField nullable, indexé), `AIConversation.user` devient nullable, contrainte DB `ai_conversation_user_xor_session`.

- [ ] **Step 1: Écrire le test qui vérifie la contrainte (doit échouer avant la migration)**

Ajouter à `backend/ai_assistant/tests.py`, dans la classe `AIAssistantModelsTest` :
```python
    def test_conversation_requires_user_xor_session(self):
        from django.db import IntegrityError, transaction
        owner, store = make_owner()
        # Ni user ni session_id → doit échouer
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AIConversation.objects.create(store=store)
        # Les deux à la fois → doit échouer
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AIConversation.objects.create(store=store, user=owner, session_id='abc123')
        # session_id seul → OK (canal public)
        conv = AIConversation.objects.create(store=store, session_id='abc123')
        self.assertIsNone(conv.user)
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.AIAssistantModelsTest.test_conversation_requires_user_xor_session -v 2`
Expected: `AttributeError` ou `TypeError` (le champ `session_id` n'existe pas encore).

- [ ] **Step 3: Modifier le modèle**

Dans `backend/ai_assistant/models.py`, remplacer la classe `AIConversation` :
```python
class AIConversation(models.Model):
    """Fil de discussion du chat libre — deux canaux distingués par `user`
    XOR `session_id` (jamais les deux, jamais aucun des deux, voir la
    CheckConstraint) : `user` pour l'Assistant vendeur (dashboard,
    authentifié), `session_id` pour le chatbot boutique publique (visiteur
    anonyme, identifiant généré côté client comme le scoping panier
    CartContext). Les 3 autres capacités IA (génération produit, suggestion
    Inbox, résumé dashboard) sont sans état, aucune n'utilise ce modèle."""
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='ai_conversations')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ai_conversations', null=True, blank=True)
    session_id = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    title = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        constraints = [
            models.CheckConstraint(
                check=(
                    (models.Q(user__isnull=False) & models.Q(session_id__isnull=True)) |
                    (models.Q(user__isnull=True) & models.Q(session_id__isnull=False))
                ),
                name='ai_conversation_user_xor_session',
            ),
        ]

    def __str__(self):
        return self.title or f"Conversation #{self.pk}"
```

- [ ] **Step 4: Générer et appliquer la migration**

Run: `cd backend && venv/Scripts/python manage.py makemigrations ai_assistant`
Expected: `Migrations for 'ai_assistant': ai_assistant/migrations/0002_....py - Alter field user on aiconversation - Add field session_id to aiconversation - Add constraint ai_conversation_user_xor_session...`

Run: `venv/Scripts/python manage.py migrate ai_assistant`
Expected: `Applying ai_assistant.0002_... OK`

- [ ] **Step 5: Run le test pour vérifier le succès**

Run: `venv/Scripts/python manage.py test ai_assistant.tests.AIAssistantModelsTest -v 2`
Expected: `Ran 3 tests ... OK` (les 2 tests existants + le nouveau).

- [ ] **Step 6: Vérifier l'absence de régression sur les tests déjà liés à AIConversation**

Run: `venv/Scripts/python manage.py test ai_assistant -v 1`
Expected: tous les tests existants (27 avant cette tâche) passent toujours — `user` nullable ne change aucun comportement du canal dashboard, qui continue de toujours le renseigner.

- [ ] **Step 7: Commit**

```bash
git add backend/ai_assistant/models.py backend/ai_assistant/migrations backend/ai_assistant/tests.py
git commit -m "feat(ai): AIConversation supporte le canal boutique publique (session_id)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Factoriser la boucle de tool-calling (`chat_loop.py`)

**Files:**
- Create: `backend/ai_assistant/chat_loop.py`
- Modify: `backend/ai_assistant/views.py` (ChatView utilise la fonction factorisée)
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `ollama_client.chat(messages, tools)`, `ollama_client.OllamaUnavailableError` (Task précédente, déjà en place).
- Produces: `chat_loop.run_chat_loop(history, tool_definitions, tool_executor) -> str` — `tool_executor` est un callable `(name: str, arguments: dict) -> str` (permet à l'appelant de brancher `ai_tools.execute_tool` (dashboard, a besoin de `request`) ou une fonction publique équivalente sans que `chat_loop.py` connaisse la différence). Lève `OllamaUnavailableError` si le fournisseur IA est en panne — laissé à l'appelant de traduire en 503. Ne persiste **rien** en base — c'est le rôle de l'appelant (`ChatView`/`PublicChatView`), `chat_loop.py` est pur calcul sur une liste de messages en mémoire.

- [ ] **Step 1: Écrire le test de la fonction extraite (avant refactor, doit échouer — le module n'existe pas)**

Ajouter à `backend/ai_assistant/tests.py` :
```python
class ChatLoopTest(TestCase):
    @patch('ai_assistant.chat_loop.ollama_client.chat')
    def test_returns_final_content_without_tool_call(self, mock_chat):
        from ai_assistant.chat_loop import run_chat_loop
        mock_chat.return_value = {'role': 'assistant', 'content': 'Bonjour !'}
        history = [{'role': 'user', 'content': 'Salut'}]
        result = run_chat_loop(history, tool_definitions=[], tool_executor=lambda n, a: '')
        self.assertEqual(result, 'Bonjour !')

    @patch('ai_assistant.chat_loop.ollama_client.chat')
    def test_executes_tool_then_returns_final_content(self, mock_chat):
        from ai_assistant.chat_loop import run_chat_loop
        mock_chat.side_effect = [
            {'role': 'assistant', 'content': '', 'tool_calls': [
                {'id': 'call1', 'function': {'name': 'ping', 'arguments': {}}}
            ]},
            {'role': 'assistant', 'content': 'Pong.'},
        ]
        executed = []
        def executor(name, arguments):
            executed.append((name, arguments))
            return 'ok'
        history = [{'role': 'user', 'content': 'ping ?'}]
        result = run_chat_loop(history, tool_definitions=[{'type': 'function'}], tool_executor=executor)
        self.assertEqual(result, 'Pong.')
        self.assertEqual(executed, [('ping', {})])

    @patch('ai_assistant.chat_loop.ollama_client.chat')
    def test_propagates_unavailable_error(self, mock_chat):
        from ai_assistant.chat_loop import run_chat_loop
        from ai_assistant.ollama_client import OllamaUnavailableError
        mock_chat.side_effect = OllamaUnavailableError('down')
        with self.assertRaises(OllamaUnavailableError):
            run_chat_loop([{'role': 'user', 'content': 'x'}], tool_definitions=[], tool_executor=lambda n, a: '')
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ChatLoopTest -v 2`
Expected: `ModuleNotFoundError: No module named 'ai_assistant.chat_loop'`

- [ ] **Step 3: Créer `chat_loop.py`**

```python
"""Boucle de tool-calling multi-tours, partagée entre le canal dashboard
(ChatView, historique persisté par utilisateur) et le canal boutique
publique (PublicChatView, historique persisté par session_id) — ce module
ne connaît ni l'un ni l'autre, ne fait aucune écriture en base, opère
uniquement sur une liste de messages en mémoire et un `tool_executor`
injecté par l'appelant."""
from . import ollama_client

MAX_TOOL_ROUNDS = 3


def run_chat_loop(history, tool_definitions, tool_executor):
    """`history` : liste de messages `{role, content, ...}`, déjà terminée
    par le nouveau message utilisateur — MUTÉE en place (les tours
    intermédiaires assistant/tool y sont ajoutés, pour que l'appelant
    puisse les persister après coup s'il le souhaite). Retourne le contenu
    textuel final de la réponse assistant."""
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
        for call in tool_calls:
            fn = call.get('function', {})
            name = fn.get('name')
            arguments = fn.get('arguments') or {}
            result = tool_executor(name, arguments)
            history.append({'role': 'tool', 'tool_call_id': call.get('id', ''), 'content': result})
    return assistant_msg.get('content', '')
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test ai_assistant.tests.ChatLoopTest -v 2`
Expected: `Ran 3 tests ... OK`

⚠️ Différence volontaire avec `ChatView` actuel : ce test 2 n'enregistre pas les `AIMessage(role='tool')` en base (ce n'est pas le rôle de `chat_loop.py`) — c'est à `ChatView` de le faire après coup en Step 5, pas à `run_chat_loop`.

- [ ] **Step 5: Refactoriser `ChatView` pour utiliser `run_chat_loop`**

Dans `backend/ai_assistant/views.py`, remplacer l'import et le corps de `ChatView.post` :

Ajouter en haut du fichier (à côté des autres imports du module) :
```python
from .chat_loop import run_chat_loop
```

Remplacer le bloc (de `assistant_msg = {'content': ''}` jusqu'à `AIMessage.objects.create(conversation=conv, role='tool', ...)` inclus, dans `ChatView.post`) par :
```python
        def tool_executor(name, arguments):
            result = ai_tools.execute_tool(request, name, arguments)
            AIMessage.objects.create(conversation=conv, role='tool', content=f'{name}: {result}')
            return result

        try:
            final_content = run_chat_loop(history, ai_tools.TOOL_DEFINITIONS, tool_executor)
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)
```

Puis remplacer les 2 lignes qui suivaient l'ancien bloc :
```python
        final_content = assistant_msg.get('content', '')
        AIMessage.objects.create(conversation=conv, role='assistant', content=final_content)
```
par (une seule ligne, `final_content` vient maintenant de `run_chat_loop`) :
```python
        AIMessage.objects.create(conversation=conv, role='assistant', content=final_content)
```

Le reste de la méthode (`conv.save(update_fields=['updated_at'])`, `return Response(...)`) ne change pas.

- [ ] **Step 6: Run tous les tests `ai_assistant` pour vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test ai_assistant -v 1`
Expected: `OK` (30 tests : 27 précédents + 3 `ChatLoopTest`) — en particulier `ChatViewTest.test_chat_creates_conversation_and_replies` et `test_chat_executes_tool_call` doivent toujours passer à l'identique, preuve que le refactor n'a rien changé côté dashboard.

- [ ] **Step 7: Commit**

```bash
git add backend/ai_assistant/chat_loop.py backend/ai_assistant/views.py backend/ai_assistant/tests.py
git commit -m "refactor(ai): factorise la boucle de tool-calling (chat_loop.py)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Tools publics (`public_search_products`, `public_get_order_status`)

**Files:**
- Modify: `backend/ai_assistant/tools.py`
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `store` (objet `stores.models.Store`, résolu par l'appelant — **pas** `request` comme les tools dashboard, ces tools n'ont pas de notion d'utilisateur authentifié) ; `products.models.Product.active_auto_promotion()`, `Product.total_stock` (déjà utilisés par `get_low_stock`/`get_inventory`) ; `orders.models.Order`.
- Produces: `tools.public_search_products(store, query) -> str` (JSON), `tools.public_get_order_status(store, phone, order_id) -> str` (JSON), `tools.PUBLIC_TOOL_REGISTRY` (dict nom→fonction), `tools.PUBLIC_TOOL_DEFINITIONS` (liste, schéma OpenAI/Groq — même format que `TOOL_DEFINITIONS`), `tools.execute_public_tool(store, name, arguments) -> str`.

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/ai_assistant/tests.py` :
```python
class PublicToolsTest(TestCase):
    def setUp(self):
        self.owner, self.store = make_owner()
        from products.models import Product
        Product.objects.create(store=self.store, name='Chaise en bois', price=5000, stock=10, is_active=True)
        Product.objects.create(store=self.store, name='Table basse', price=15000, stock=0, is_active=True)
        Product.objects.create(store=self.store, name='Produit désactivé', price=1000, stock=5, is_active=False)

    def test_public_search_products_matches_name(self):
        result = ai_tools.public_search_products(self.store, 'chaise')
        self.assertIn('Chaise en bois', result)
        self.assertNotIn('Table basse', result)

    def test_public_search_products_excludes_inactive(self):
        result = ai_tools.public_search_products(self.store, 'désactivé')
        self.assertIn('"products": []', result)

    def test_public_get_order_status_requires_matching_phone_and_id(self):
        from orders.models import Order
        order = Order.objects.create(
            store=self.store, first_name='Amine', phone='0555000000',
            wilaya='Alger', status='shipped', carrier_tracking_number='TRACK123', total=5000,
        )
        result = ai_tools.public_get_order_status(self.store, '0555000000', order.id)
        self.assertIn('TRACK123', result)

    def test_public_get_order_status_wrong_phone_generic_message(self):
        from orders.models import Order
        order = Order.objects.create(
            store=self.store, first_name='Amine', phone='0555000000',
            wilaya='Alger', status='shipped', total=5000,
        )
        result_wrong_phone = ai_tools.public_get_order_status(self.store, '0555999999', order.id)
        result_wrong_id = ai_tools.public_get_order_status(self.store, '0555000000', order.id + 999)
        self.assertEqual(result_wrong_phone, result_wrong_id)
        self.assertIn('introuvable', result_wrong_phone.lower())

    def test_execute_public_tool_unknown_name(self):
        result = ai_tools.execute_public_tool(self.store, 'nope', {})
        self.assertIn('Outil inconnu', result)
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.PublicToolsTest -v 2`
Expected: `AttributeError: module 'ai_assistant.tools' has no attribute 'public_search_products'`

- [ ] **Step 3: Ajouter les tools publics à `tools.py`**

Ajouter à la fin de `backend/ai_assistant/tools.py` (après `execute_tool`, avant la fin du fichier) :
```python
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
        price = float(promo.compute_discount(p.price)) if False else float(p.price)
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
```

⚠️ En écrivant ce step, supprimer la ligne morte `price = float(promo.compute_discount(p.price)) if False else float(p.price)` de l'extrait ci-dessus (résidu de rédaction) — la ligne utile est seulement `entry = {...}` et le bloc `if promo:` qui suit. Le code final de `public_search_products` doit être :
```python
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
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test ai_assistant.tests.PublicToolsTest -v 2`
Expected: `Ran 5 tests ... OK`

- [ ] **Step 5: Commit**

```bash
git add backend/ai_assistant/tools.py backend/ai_assistant/tests.py
git commit -m "feat(ai): tools publics (recherche produit, statut commande vérifié)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `PublicChatView`/`PublicChatHistoryView` + routage + throttle

**Files:**
- Create: `backend/ai_assistant/public_views.py`
- Modify: `backend/products/public_urls.py`
- Modify: `backend/config/settings.py`
- Test: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `products.views._get_public_store(slug)`, `chat_loop.run_chat_loop`, `ollama_client.OllamaUnavailableError`, `tools.PUBLIC_TOOL_DEFINITIONS`/`execute_public_tool` (Tasks 2-3), `AIConversation`/`AIMessage` (Task 1).
- Produces: `POST /api/public/store/<slug>/chat/` → `{reply}` ; `GET /api/public/store/<slug>/chat/<session_id>/` → `{messages: [{role, content}, ...]}`.

- [ ] **Step 1: Écrire les tests**

Ajouter à `backend/ai_assistant/tests.py` :
```python
class PublicChatViewTest(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        self.owner, self.store = make_owner()
        self.client_ = APIClient()

    def test_unknown_store_404(self):
        resp = self.client_.post('/api/public/store/inexistante/chat/', {'session_id': 'abc', 'message': 'salut'}, format='json')
        self.assertEqual(resp.status_code, 404)

    def test_missing_message_400(self):
        resp = self.client_.post(f'/api/public/store/{self.store.slug}/chat/', {'session_id': 'abc', 'message': ''}, format='json')
        self.assertEqual(resp.status_code, 400)

    @patch('ai_assistant.public_views.ollama_client.chat')
    def test_creates_conversation_by_session_id_and_replies(self, mock_chat):
        mock_chat.return_value = {'role': 'assistant', 'content': 'Bonjour, comment puis-je vous aider ?'}
        resp = self.client_.post(f'/api/public/store/{self.store.slug}/chat/', {'session_id': 'visitor-1', 'message': 'Bonjour'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('Bonjour, comment puis-je vous aider', resp.data['reply'])
        conv = AIConversation.objects.get(store=self.store, session_id='visitor-1')
        self.assertIsNone(conv.user)
        self.assertEqual(conv.messages.filter(role__in=['user', 'assistant']).count(), 2)

    @patch('ai_assistant.public_views.ollama_client.chat')
    def test_ollama_down_returns_503(self, mock_chat):
        from ai_assistant.ollama_client import OllamaUnavailableError
        mock_chat.side_effect = OllamaUnavailableError('down')
        resp = self.client_.post(f'/api/public/store/{self.store.slug}/chat/', {'session_id': 'visitor-2', 'message': 'salut'}, format='json')
        self.assertEqual(resp.status_code, 503)

    def test_history_empty_for_unknown_session(self):
        resp = self.client_.get(f'/api/public/store/{self.store.slug}/chat/never-seen/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['messages'], [])

    @patch('ai_assistant.public_views.ollama_client.chat')
    def test_history_restores_previous_messages(self, mock_chat):
        mock_chat.return_value = {'role': 'assistant', 'content': 'Réponse.'}
        self.client_.post(f'/api/public/store/{self.store.slug}/chat/', {'session_id': 'visitor-3', 'message': 'Question ?'}, format='json')
        resp = self.client_.get(f'/api/public/store/{self.store.slug}/chat/visitor-3/')
        self.assertEqual(resp.status_code, 200)
        roles = [m['role'] for m in resp.data['messages']]
        self.assertEqual(roles, ['user', 'assistant'])

    def test_conversation_of_one_session_not_visible_to_another(self):
        AIConversation.objects.create(store=self.store, session_id='visitor-A', title='Secrète')
        resp = self.client_.get(f'/api/public/store/{self.store.slug}/chat/visitor-B/')
        self.assertEqual(resp.data['messages'], [])
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.PublicChatViewTest -v 2`
Expected: `404` sur toutes (routes inexistantes) ou `ImportError`.

- [ ] **Step 3: Ajouter le throttle scope**

Dans `backend/config/settings.py`, dans `REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']`, ajouter une ligne (à côté de `'abandoned_cart': '20/min',`) :
```python
        'public_chat':      '10/min',
```

- [ ] **Step 4: Créer `public_views.py`**

```python
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from products.views import _get_public_store

from . import ollama_client
from .chat_loop import run_chat_loop
from .ollama_client import OllamaUnavailableError
from .models import AIConversation, AIMessage
from . import tools as ai_tools

PUBLIC_SYSTEM_PROMPT = """Tu es l'assistant de la boutique en ligne {store_name}. Réponds aux questions des visiteurs sur les produits, la livraison, le paiement, ou le statut de leur commande.

Infos boutique :
- Téléphone : {phone}
- Email : {email}
- Devise : {currency_symbol}

Pour le statut d'une commande, demande TOUJOURS le numéro de téléphone ET le numéro de commande avant d'appeler l'outil correspondant — jamais l'un sans l'autre. Reste concis, professionnel, en français."""


def _system_message(store):
    return {
        'role': 'system',
        'content': PUBLIC_SYSTEM_PROMPT.format(
            store_name=store.name,
            phone=store.phone or 'non renseigné',
            email=store.email or 'non renseigné',
            currency_symbol=store.currency_symbol,
        ),
    }


class PublicChatView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = 'public_chat'

    def post(self, request, slug):
        store = _get_public_store(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        session_id = (request.data.get('session_id') or '').strip()
        message = (request.data.get('message') or '').strip()
        if not session_id or not message:
            return Response({'detail': 'session_id et message sont requis.'}, status=400)

        conv, _ = AIConversation.objects.get_or_create(
            store=store, session_id=session_id,
            defaults={'title': message[:60]},
        )
        AIMessage.objects.create(conversation=conv, role='user', content=message)

        history = [_system_message(store)] + [
            {'role': m.role, 'content': m.content}
            for m in conv.messages.order_by('created_at') if m.role != 'tool'
        ]

        def tool_executor(name, arguments):
            result = ai_tools.execute_public_tool(store, name, arguments)
            AIMessage.objects.create(conversation=conv, role='tool', content=f'{name}: {result}')
            return result

        try:
            final_content = run_chat_loop(history, ai_tools.PUBLIC_TOOL_DEFINITIONS, tool_executor)
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)

        AIMessage.objects.create(conversation=conv, role='assistant', content=final_content)
        conv.save(update_fields=['updated_at'])
        return Response({'reply': final_content})


class PublicChatHistoryView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = 'public_chat'

    def get(self, request, slug, session_id):
        store = _get_public_store(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        conv = AIConversation.objects.filter(store=store, session_id=session_id).first()
        if not conv:
            return Response({'messages': []})
        messages = [
            {'role': m.role, 'content': m.content}
            for m in conv.messages.order_by('created_at') if m.role != 'tool'
        ]
        return Response({'messages': messages})
```

- [ ] **Step 5: Router les deux vues dans `products/public_urls.py`**

Dans `backend/products/public_urls.py`, ajouter l'import et les 2 routes :
```python
from ai_assistant.public_views import PublicChatView, PublicChatHistoryView
```
Et dans `urlpatterns`, ajouter (n'importe où dans la liste, par exemple après `desks/`) :
```python
    path('chat/',                   PublicChatView.as_view()),
    path('chat/<str:session_id>/',  PublicChatHistoryView.as_view()),
```

- [ ] **Step 6: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test ai_assistant.tests.PublicChatViewTest -v 2`
Expected: `Ran 7 tests ... OK`

- [ ] **Step 7: Run toute la suite `ai_assistant` + `products` pour vérifier l'absence de régression**

Run: `venv/Scripts/python manage.py test ai_assistant products -v 1`
Expected: `OK`, aucune régression sur les routes publiques existantes de `products/public_urls.py`.

- [ ] **Step 8: Commit**

```bash
git add backend/ai_assistant/public_views.py backend/products/public_urls.py backend/config/settings.py backend/ai_assistant/tests.py
git commit -m "feat(ai): endpoints publics du chatbot boutique (chat + historique)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Widget frontend + intégration `StorefrontLayout`

**Files:**
- Create: `frontend/src/api/publicChatApi.js`
- Create: `frontend/src/components/StorefrontChatWidget.jsx`
- Modify: `frontend/src/pages/storefront/StorefrontLayout.jsx`
- Test: `frontend/src/tests/components/StorefrontChatWidget.test.jsx`

**Interfaces:**
- Consumes: `publicApi` (axios instance existante, `frontend/src/api/publicApi.js`, base `/api/public`), `lib/markdown.js::renderMarkdown` (déjà construit, capacité 1), classe CSS `.sf-prose` (déjà définie dans `index.css` pour le contenu storefront, réutilisée pour le rendu markdown des réponses — thème clair `--sf-*`, pas les variables dashboard `--text-*`).
- Produces: `publicChatApi.sendPublicChatMessage({slug, sessionId, message}) -> Promise<{reply}>`, `publicChatApi.getPublicChatHistory({slug, sessionId}) -> Promise<{messages}>`, composant `<StorefrontChatWidget slug={string} />`.

- [ ] **Step 1: Créer le wrapper API**

```javascript
// frontend/src/api/publicChatApi.js
import publicApi from './publicApi'

export function sendPublicChatMessage({ slug, sessionId, message }) {
  return publicApi.post(`/store/${slug}/chat/`, { session_id: sessionId, message }).then(r => r.data)
}

export function getPublicChatHistory({ slug, sessionId }) {
  return publicApi.get(`/store/${slug}/chat/${sessionId}/`).then(r => r.data)
}
```

- [ ] **Step 2: Écrire le test du widget**

```jsx
// frontend/src/tests/components/StorefrontChatWidget.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import StorefrontChatWidget from '../../components/StorefrontChatWidget'

vi.mock('../../api/publicApi', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { messages: [] } })),
    post: vi.fn(() => Promise.resolve({ data: { reply: 'Bonjour, comment puis-je vous aider ?' } })),
  },
}))

describe('StorefrontChatWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it("s'ouvre au clic sur la bulle et affiche le champ de saisie", async () => {
    render(<StorefrontChatWidget slug="ma-boutique" />)
    fireEvent.click(screen.getByLabelText(/assistant/i))
    expect(await screen.findByPlaceholderText(/posez une question/i)).toBeInTheDocument()
  })

  it('envoie un message et affiche la réponse', async () => {
    render(<StorefrontChatWidget slug="ma-boutique" />)
    fireEvent.click(screen.getByLabelText(/assistant/i))
    const input = await screen.findByPlaceholderText(/posez une question/i)
    fireEvent.change(input, { target: { value: 'Avez-vous des chaises ?' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    await waitFor(() => expect(screen.getByText(/Bonjour, comment puis-je vous aider/)).toBeInTheDocument())
  })

  it('affiche une erreur discrète si l\'IA est indisponible', async () => {
    const publicApi = (await import('../../api/publicApi')).default
    publicApi.post.mockRejectedValueOnce({ response: { data: { detail: 'Assistant IA indisponible' } } })
    render(<StorefrontChatWidget slug="ma-boutique" />)
    fireEvent.click(screen.getByLabelText(/assistant/i))
    const input = await screen.findByPlaceholderText(/posez une question/i)
    fireEvent.change(input, { target: { value: 'test' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    await waitFor(() => expect(screen.getByText('Assistant IA indisponible')).toBeInTheDocument())
  })
})
```

- [ ] **Step 3: Run pour vérifier l'échec**

Run: `cd frontend && npm run test -- StorefrontChatWidget`
Expected: échec, le composant n'existe pas.

- [ ] **Step 4: Créer le composant**

```jsx
// frontend/src/components/StorefrontChatWidget.jsx
import { useState, useEffect, useRef } from 'react'
import { MessageCircle, X, Send } from 'lucide-react'
import { renderMarkdown } from '../lib/markdown'
import { sendPublicChatMessage, getPublicChatHistory } from '../api/publicChatApi'

function sessionKey(slug) {
  return `mz_chat_session_${slug}`
}

function getOrCreateSessionId(slug) {
  try {
    const existing = localStorage.getItem(sessionKey(slug))
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(sessionKey(slug), id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

export default function StorefrontChatWidget({ slug }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const sessionIdRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open && !sessionIdRef.current) {
      sessionIdRef.current = getOrCreateSessionId(slug)
      getPublicChatHistory({ slug, sessionId: sessionIdRef.current })
        .then(data => setMessages(data.messages))
        .catch(() => {})
    }
  }, [open, slug])

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages, sending])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    if (!sessionIdRef.current) sessionIdRef.current = getOrCreateSessionId(slug)
    setMessages(m => [...m, { role: 'user', content: text }])
    setInput('')
    setSending(true)
    setError('')
    try {
      const data = await sendPublicChatMessage({ slug, sessionId: sessionIdRef.current, message: text })
      setMessages(m => [...m, { role: 'assistant', content: data.reply }])
    } catch (e) {
      setError(e?.response?.data?.detail || 'Assistant IA indisponible')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 w-80 sm:w-96 h-[28rem] rounded-xl border shadow-xl flex flex-col overflow-hidden"
          style={{ background: 'var(--sf-body-bg)', borderColor: 'var(--sf-footer-border)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--sf-footer-border)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--sf-text)' }}>Besoin d'aide ?</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" style={{ color: 'var(--sf-text-muted)' }}>
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {messages.length === 0 && (
              <p style={{ color: 'var(--sf-text-muted)' }}>Posez-nous une question sur nos produits, la livraison, ou le statut de votre commande.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`rounded-2xl px-3 py-2 max-w-[85%] ${m.role === 'user' ? 'ml-auto text-white' : ''}`}
                style={m.role === 'user' ? { background: 'var(--sf-primary)' } : { background: 'var(--sf-header-bg)', color: 'var(--sf-text)' }}>
                {m.role === 'user'
                  ? <p className="whitespace-pre-wrap">{m.content}</p>
                  : <div className="sf-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />}
              </div>
            ))}
            {sending && <p style={{ color: 'var(--sf-text-muted)' }}>…</p>}
            <div ref={bottomRef} />
          </div>
          {error && <p className="text-xs text-red-500 px-3 pb-1">{error}</p>}
          <div className="flex gap-2 p-2.5 border-t" style={{ borderColor: 'var(--sf-footer-border)' }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Posez une question…"
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--sf-footer-border)', color: 'var(--sf-text)', background: 'transparent' }} />
            <button type="button" onClick={handleSend} disabled={sending || !input.trim()} aria-label="Envoyer"
              className="rounded-lg px-3 py-2 text-white disabled:opacity-40" style={{ background: 'var(--sf-primary)' }}>
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="Assistant boutique"
        className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white"
        style={{ background: 'var(--sf-primary)' }}>
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run pour vérifier le succès**

Run: `cd frontend && npm run test -- StorefrontChatWidget`
Expected: `3 passed`

- [ ] **Step 6: Monter le widget dans `StorefrontLayout.jsx`**

Ajouter l'import en haut de `frontend/src/pages/storefront/StorefrontLayout.jsx` :
```javascript
import StorefrontChatWidget from '../../components/StorefrontChatWidget'
```
Juste avant le `</footer>` de fermeture (repérer la ligne exacte dans le fichier au moment de l'implémentation — le footer se termine par le bloc des liens "Déposer une réclamation"/"Demander un échange"), insérer après la fermeture de `</footer>` et avant `</div>` final :
```jsx
      </footer>

      {store && <StorefrontChatWidget slug={slug} />}
    </div>
```

- [ ] **Step 7: Run la suite frontend complète pour vérifier l'absence de régression**

Run: `cd frontend && npm run test`
Expected: tous les tests passent, y compris ceux qui montent `StorefrontLayout`/pages storefront (le widget ne doit rien casser sur les pages existantes — vérifier en particulier qu'aucun test storefront existant n'échoue à cause du nouveau composant monté).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/publicChatApi.js frontend/src/components/StorefrontChatWidget.jsx frontend/src/pages/storefront/StorefrontLayout.jsx frontend/src/tests/components/StorefrontChatWidget.test.jsx
git commit -m "feat(ai): widget chatbot flottant sur la boutique publique

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: rien (documentation pure).

- [ ] **Step 1: Étendre la section "Assistant IA" de `CLAUDE.md`**

Localiser la section `### Assistant IA (Ollama local + Groq cloud, 2026-09)` dans `CLAUDE.md` et ajouter, juste avant la ligne `Testé via manage.py test ai_assistant...` (fin de section) :
```markdown
**Chatbot boutique publique (2026-09, 2ème chantier)** — widget flottant (`components/StorefrontChatWidget.jsx`, monté dans `StorefrontLayout.jsx`, toutes les pages storefront) pour les visiteurs sans compte. Réutilise le même client IA (`ollama_client.py`) via une boucle de tool-calling factorisée (`ai_assistant/chat_loop.py::run_chat_loop()`, partagée avec `ChatView` du dashboard). `AIConversation.user` est devenu nullable, `session_id` (généré côté client comme le scoping panier `CartContext`, `localStorage` clé `mz_chat_session_<slug>`) identifie le canal public — contrainte DB `user` XOR `session_id`, jamais les deux.

Tools **strictement séparés** des tools dashboard (`PUBLIC_TOOL_REGISTRY`/`PUBLIC_TOOL_DEFINITIONS` dans `tools.py`, jamais fusionnés avec `TOOL_REGISTRY`) : `public_search_products` (catalogue actif uniquement), `public_get_order_status` (téléphone **et** numéro de commande requis, message générique identique sur tout mismatch — anti-énumération, même principe que `PublicOrderItemsView`). Endpoints publics (`ai_assistant/public_views.py`, routés depuis `products/public_urls.py` comme tout le reste du public store-scoped) : `POST /api/public/store/<slug>/chat/`, `GET /api/public/store/<slug>/chat/<session_id>/` — `throttle_scope='public_chat'` (10/min par IP, plus restrictif que les autres throttles publics car c'est la seule surface IA non-authentifiée et qu'elle partage le quota Groq gratuit avec l'Assistant vendeur).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documente le chatbot boutique publique

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review (fait avant remise du plan)

- **Couverture du spec** : modèle canal public (Task 1), tools publics avec anti-énumération (Task 3), endpoints + throttle (Task 4), widget + persistance localStorage (Task 5), factorisation de la boucle de tool-calling pour ne pas dupliquer entre dashboard/public (Task 2, décision d'implémentation non explicitement demandée par le spec mais nécessaire pour respecter DRY — les deux canaux partagent une logique de tool-calling identique). Documentation (Task 6). Tous les points du spec sont couverts.
- **Placeholders** : aucun TBD/TODO. Le Step 3 de la Task 3 contient une correction explicite inline (ligne morte retirée, code final donné en entier) plutôt qu'un renvoi vague — volontaire, pour que l'implémenteur ait le code exact à écrire sans ambiguïté.
- **Cohérence des types/noms** : `run_chat_loop(history, tool_definitions, tool_executor)` (Task 2) consommé à l'identique par `ChatView` (Task 2, refactor) et `PublicChatView` (Task 4). `execute_public_tool(store, name, arguments)` (Task 3) cohérent avec son usage dans `PublicChatView.tool_executor` (Task 4). `AIConversation.session_id`/`user` (Task 1) utilisés à l'identique dans `PublicChatView`/`PublicChatHistoryView` (Task 4). `publicChatApi.sendPublicChatMessage`/`getPublicChatHistory` (Task 5) avec les mêmes noms de paramètres (`slug`, `sessionId`, `message`) entre le wrapper et le composant.
- **Point à vérifier en conditions réelles avant d'écrire la ligne finale** (Task 5, Step 6) : l'emplacement exact du `</footer>` dans `StorefrontLayout.jsx` peut avoir légèrement bougé depuis la rédaction de ce plan — relire le fichier au moment de l'implémentation plutôt que de chercher un texte figé.
