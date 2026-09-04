# Assistant IA (Ollama local) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un Assistant IA dans le dashboard MZSolutions, propulsé par un modèle Ollama local (`llama3.1:8b` par défaut), avec 4 capacités : génération de fiche produit, suggestion de réponse Inbox, résumé IA du tableau de bord, chat libre avec tool calling sur les données de la boutique.

**Architecture:** Nouvelle app Django `ai_assistant/` isolée (même pattern que `dropshipping/`/`finance/`/`webhooks/`), un client HTTP unique vers Ollama (`ollama_client.py`), 4 endpoints REST, une nouvelle permission `ai_assistant_view` dans la matrice existante. Frontend : une nouvelle page `AIAssistantPage.jsx` + 3 points d'intégration dans des pages existantes (ProductFormPage, InboxPage, les 3 onglets du Dashboard).

**Tech Stack:** Django 5.2 + DRF (backend existant), `requests` (déjà en dépendance) pour parler à l'API HTTP Ollama, React 18 + Vite (frontend existant), Tailwind/theme.js pour le style.

## Global Constraints

- Zéro CSS custom — Tailwind + `theme.js` uniquement (règle n°1 du projet).
- Toute nouvelle route dashboard déclare sa permission dans `PERMISSION_CATALOG`/`DEFAULT_PERMISSIONS`, gate `<PD perm="...">` dans `App.jsx`, gate `can('...')` dans la sidebar, et gate `is_owner_or_admin(request) OR has_permission(request, 'ai_assistant_view')` sur CHAQUE endpoint backend consommé — jamais après coup.
- `OLLAMA_BASE_URL` (défaut `http://localhost:11434`) et `OLLAMA_MODEL` (défaut `llama3.1:8b`) en variables d'environnement (`python-decouple` `config(...)`, même pattern que le reste de `config/settings.py`) — jamais codés en dur.
- Toute panne Ollama (timeout/connexion refusée) → `503 {"detail": "Assistant IA indisponible"}`, jamais un 500, jamais un blocage du flux appelant.
- Les tools du chat libre répliquent exactement la formule de permission de leur endpoint équivalent — jamais d'exception à cette règle.
- Tests obligatoires par tâche (backend : `manage.py test ai_assistant`, mock des appels HTTP Ollama via `unittest.mock.patch`).
- Commits fréquents, un par tâche, pas de `git add -A`.

---

## File Structure

```
backend/
  ai_assistant/                          — nouvelle app
    __init__.py
    apps.py
    models.py           — AIConversation, AIMessage
    migrations/0001_initial.py
    ollama_client.py     — chat(), generate(), OllamaUnavailableError
    tools.py             — TOOL_DEFINITIONS (schema Ollama) + execute_tool()
    serializers.py        — AIConversationSerializer, AIMessageSerializer
    views.py              — GenerateProductView, SuggestReplyView, DashboardSummaryView,
                             ChatView, ConversationListView, ConversationDetailView
    urls.py
    tests.py
  config/settings.py     — INSTALLED_APPS += 'ai_assistant', OLLAMA_BASE_URL, OLLAMA_MODEL
  config/urls.py         — path('api/ai/', include('ai_assistant.urls'))
  team/models.py          — PERMISSION_CATALOG += ai_assistant_view, PERMISSION_CATEGORIES,
                             DEFAULT_PERMISSIONS['confirmateur'/'dropshipper'] += False
docker-compose.yml        — service `ollama` + volume `ollama_data`

frontend/src/
  api/aiApi.js                              — wrappers axios pour les 4 endpoints
  pages/ai/AIAssistantPage.jsx              — page chat libre
  pages/products/ProductFormPage.jsx        — bouton "Générer avec l'IA" (modifié)
  pages/inbox/InboxPage.jsx                 — bouton "Suggérer une réponse" (modifié)
  pages/dashboard/DeliveriesTab.jsx         — bouton "Résumé IA" (modifié)
  pages/dashboard/RevenueTab.jsx            — bouton "Résumé IA" (modifié)
  pages/dashboard/KpiTab.jsx                — bouton "Résumé IA" (modifié)
  components/AISummaryCard.jsx              — encart résumé réutilisé par les 3 onglets
  App.jsx                                    — route /dashboard/assistant-ia (modifié)
  components/DashboardLayout.jsx            — lien sidebar (modifié)
  tests/pages/ai/AIAssistantPage.test.jsx
```

---

### Task 1: App `ai_assistant` — modèles, migration, permission

**Files:**
- Create: `backend/ai_assistant/__init__.py` (vide)
- Create: `backend/ai_assistant/apps.py`
- Create: `backend/ai_assistant/models.py`
- Create: `backend/ai_assistant/migrations/__init__.py` (vide)
- Modify: `backend/config/settings.py`
- Modify: `backend/team/models.py`
- Test: `backend/ai_assistant/tests.py` (créé ici, complété aux tâches suivantes)

**Interfaces:**
- Produces: `ai_assistant.models.AIConversation(store, user, title, created_at, updated_at)`, `ai_assistant.models.AIMessage(conversation, role, content, created_at)` avec `role` dans `('user', 'assistant', 'tool')`.
- Produces: `team.models.PERMISSION_CATALOG` contient désormais `('ai_assistant_view', 'Assistant IA')`.

- [ ] **Step 1: Créer l'app et ses fichiers de base**

`backend/ai_assistant/__init__.py` (vide).

`backend/ai_assistant/apps.py`:
```python
from django.apps import AppConfig


class AiAssistantConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ai_assistant'
    verbose_name = 'Assistant IA'
```

`backend/ai_assistant/models.py`:
```python
from django.db import models

from stores.models import Store
from accounts.models import User


class AIConversation(models.Model):
    """Fil de discussion du chat libre (capacité 4) — seule capacité IA avec
    un historique persisté ; les 3 autres (génération produit, suggestion
    Inbox, résumé dashboard) sont sans état."""
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='ai_conversations')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ai_conversations')
    title = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.title or f"Conversation #{self.pk}"


class AIMessage(models.Model):
    ROLE_CHOICES = [('user', 'user'), ('assistant', 'assistant'), ('tool', 'tool')]

    conversation = models.ForeignKey(AIConversation, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
```

`backend/ai_assistant/migrations/__init__.py` (vide).

- [ ] **Step 2: Enregistrer l'app dans `settings.py` et ajouter la config Ollama**

Dans `backend/config/settings.py`, section `INSTALLED_APPS` (juste après `'audit'`) :
```python
    'audit',
    'ai_assistant',
]
```

Juste après le bloc `INSTALLED_APPS`, ajouter (à côté des autres `config(...)` de variables d'environnement, chercher où se trouve par ex. `CHARGILY_API_BASE` pour rester cohérent avec le style existant) :
```python
OLLAMA_BASE_URL = config('OLLAMA_BASE_URL', default='http://localhost:11434')
OLLAMA_MODEL = config('OLLAMA_MODEL', default='llama3.1:8b')
```

- [ ] **Step 3: Générer la migration**

Run: `cd backend && venv/Scripts/python manage.py makemigrations ai_assistant`
Expected: `Migrations for 'ai_assistant': ai_assistant/migrations/0001_initial.py - Create model AIConversation - Create model AIMessage`

- [ ] **Step 4: Ajouter la permission `ai_assistant_view` au catalogue**

Dans `backend/team/models.py`, dans `PERMISSION_CATALOG` (juste après la ligne `('subscription_view', 'Abonnement'),`) :
```python
    ('subscription_view',          'Abonnement'),
    ('ai_assistant_view',          'Assistant IA'),
]
```

Dans `PERMISSION_CATEGORIES`, juste après `'subscription_view': ('Administration', 'Abonnement'),` :
```python
    'subscription_view':            ('Administration', 'Abonnement'),
    'ai_assistant_view':            ('Administration', 'Assistant IA'),
}
```

Dans `DEFAULT_PERMISSIONS['confirmateur']`, juste après `'audit_view': False, 'subscription_view': False,` :
```python
        'audit_view': False, 'subscription_view': False, 'ai_assistant_view': False,
    },
```

Dans `DEFAULT_PERMISSIONS['dropshipper']`, même ajout :
```python
        'audit_view': False, 'subscription_view': False, 'ai_assistant_view': False,
    },
}
```

- [ ] **Step 5: Écrire un test qui vérifie que la permission existe et que le modèle se crée**

`backend/ai_assistant/tests.py` :
```python
from django.test import TestCase

from core.test_utils import make_owner
from team.models import PERMISSION_CATALOG, DEFAULT_PERMISSIONS
from .models import AIConversation, AIMessage


class AIAssistantModelsTest(TestCase):
    def test_permission_registered(self):
        keys = [k for k, _ in PERMISSION_CATALOG]
        self.assertIn('ai_assistant_view', keys)
        self.assertFalse(DEFAULT_PERMISSIONS['confirmateur']['ai_assistant_view'])
        self.assertFalse(DEFAULT_PERMISSIONS['dropshipper']['ai_assistant_view'])

    def test_create_conversation_and_message(self):
        owner = make_owner()
        conv = AIConversation.objects.create(store=owner.store, user=owner, title='Test')
        msg = AIMessage.objects.create(conversation=conv, role='user', content='Bonjour')
        self.assertEqual(conv.messages.count(), 1)
        self.assertEqual(msg.role, 'user')
```

- [ ] **Step 6: Appliquer la migration et lancer les tests**

Run: `cd backend && venv/Scripts/python manage.py migrate ai_assistant`
Expected: `Applying ai_assistant.0001_initial... OK`

Run: `venv/Scripts/python manage.py test ai_assistant -v 2`
Expected: `Ran 2 tests ... OK`

- [ ] **Step 7: Commit**

```bash
git add backend/ai_assistant backend/config/settings.py backend/team/models.py
git commit -m "feat(ai): app ai_assistant — modèles AIConversation/AIMessage + permission ai_assistant_view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Client Ollama (`ollama_client.py`)

**Files:**
- Create: `backend/ai_assistant/ollama_client.py`
- Modify: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `settings.OLLAMA_BASE_URL`, `settings.OLLAMA_MODEL` (Task 1).
- Produces: `ollama_client.chat(messages: list[dict], tools: list[dict] | None = None) -> dict` (renvoie le message assistant brut de la réponse Ollama : `{"role": "assistant", "content": str, "tool_calls": [...] | absent}`), `ollama_client.generate(prompt: str, json_mode: bool = False) -> str`, exception `ollama_client.OllamaUnavailableError(Exception)`.

- [ ] **Step 1: Écrire les tests (mock `requests.post`)**

Ajouter à `backend/ai_assistant/tests.py` :
```python
from unittest.mock import patch, MagicMock

from . import ollama_client


class OllamaClientTest(TestCase):
    @patch('ai_assistant.ollama_client.requests.post')
    def test_generate_returns_text(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200, json=lambda: {'response': 'Bonjour le monde'})
        result = ollama_client.generate('Dis bonjour')
        self.assertEqual(result, 'Bonjour le monde')

    @patch('ai_assistant.ollama_client.requests.post')
    def test_chat_returns_message_dict(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {'message': {'role': 'assistant', 'content': 'Salut'}},
        )
        result = ollama_client.chat([{'role': 'user', 'content': 'Salut'}])
        self.assertEqual(result['content'], 'Salut')

    @patch('ai_assistant.ollama_client.requests.post')
    def test_connection_error_raises_unavailable(self, mock_post):
        import requests
        mock_post.side_effect = requests.exceptions.ConnectionError('refused')
        with self.assertRaises(ollama_client.OllamaUnavailableError):
            ollama_client.generate('test')

    @patch('ai_assistant.ollama_client.requests.post')
    def test_timeout_raises_unavailable(self, mock_post):
        import requests
        mock_post.side_effect = requests.exceptions.Timeout('too slow')
        with self.assertRaises(ollama_client.OllamaUnavailableError):
            ollama_client.chat([{'role': 'user', 'content': 'x'}])
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.OllamaClientTest -v 2`
Expected: `ModuleNotFoundError` ou `ImportError` — `ollama_client` n'existe pas encore.

- [ ] **Step 3: Implémenter `ollama_client.py`**

```python
"""Client HTTP unique vers l'API Ollama locale — chat() et generate() sont
les deux seules fonctions consommées par le reste de l'app. Timeout court et
exception typée : une panne Ollama ne doit jamais faire planter l'appelant
(voir OllamaUnavailableError, traduite en 503 par chaque vue)."""
import requests
from django.conf import settings

TIMEOUT_SECONDS = 30


class OllamaUnavailableError(Exception):
    pass


def _base_url():
    return settings.OLLAMA_BASE_URL.rstrip('/')


def _model():
    return settings.OLLAMA_MODEL


def chat(messages, tools=None):
    """POST /api/chat — renvoie le dict `message` de la réponse Ollama
    (contient `role`, `content`, et `tool_calls` si le modèle a appelé un
    outil)."""
    payload = {'model': _model(), 'messages': messages, 'stream': False}
    if tools:
        payload['tools'] = tools
    try:
        resp = requests.post(f'{_base_url()}/api/chat', json=payload, timeout=TIMEOUT_SECONDS)
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
        raise OllamaUnavailableError(str(exc)) from exc
    if resp.status_code != 200:
        raise OllamaUnavailableError(f'Ollama a répondu {resp.status_code}')
    return resp.json()['message']


def generate(prompt, json_mode=False):
    """POST /api/generate — renvoie directement le texte généré (`response`).
    `json_mode=True` demande à Ollama de contraindre la sortie à du JSON
    valide (utilisé par la génération de fiche produit)."""
    payload = {'model': _model(), 'prompt': prompt, 'stream': False}
    if json_mode:
        payload['format'] = 'json'
    try:
        resp = requests.post(f'{_base_url()}/api/generate', json=payload, timeout=TIMEOUT_SECONDS)
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
        raise OllamaUnavailableError(str(exc)) from exc
    if resp.status_code != 200:
        raise OllamaUnavailableError(f'Ollama a répondu {resp.status_code}')
    return resp.json()['response']
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test ai_assistant.tests.OllamaClientTest -v 2`
Expected: `Ran 4 tests ... OK`

- [ ] **Step 5: Commit**

```bash
git add backend/ai_assistant/ollama_client.py backend/ai_assistant/tests.py
git commit -m "feat(ai): client Ollama (chat/generate) avec dégradation propre sur panne

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Génération de fiche produit — endpoint + intégration frontend

**Files:**
- Create: `backend/ai_assistant/serializers.py` (créé ici, complété tâche 6)
- Create: `backend/ai_assistant/views.py` (créé ici, complété tâches 4/5/6)
- Create: `backend/ai_assistant/urls.py` (créé ici, complété tâches 4/5/6)
- Modify: `backend/config/urls.py`
- Modify: `backend/ai_assistant/tests.py`
- Modify: `frontend/src/api/aiApi.js` (créé ici)
- Modify: `frontend/src/pages/products/ProductFormPage.jsx`
- Test (frontend): `frontend/src/tests/pages/products/ProductFormPage.test.jsx` (déjà existant — ajouter un cas)

**Interfaces:**
- Consumes: `ollama_client.generate(prompt, json_mode=True)` (Task 2), `core.permissions.is_owner_or_admin`, `has_permission`, `get_store`.
- Produces: `POST /api/ai/generate-product/` → `{description, meta_title, meta_description, meta_keywords}` ; `frontend/src/api/aiApi.js::generateProduct({name, keywords})`.

- [ ] **Step 1: Écrire le test backend (mock `ollama_client.generate`)**

Ajouter à `backend/ai_assistant/tests.py` :
```python
import json
from rest_framework.test import APIClient

from core.test_utils import make_owner, make_team_member, auth_client


class GenerateProductViewTest(TestCase):
    def setUp(self):
        self.owner = make_owner()
        self.client_ = auth_client(self.owner)

    @patch('ai_assistant.views.ollama_client.generate')
    def test_generates_product_fields(self, mock_generate):
        mock_generate.return_value = json.dumps({
            'description': '<p>Une belle chaise en bois.</p>',
            'meta_title': 'Chaise en bois — Boutique',
            'meta_description': 'Découvrez notre chaise en bois artisanale.',
            'meta_keywords': 'chaise, bois, mobilier',
        })
        resp = self.client_.post('/api/ai/generate-product/', {'name': 'Chaise en bois', 'keywords': 'artisanal'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('Chaise en bois', resp.data['description'])

    @patch('ai_assistant.views.ollama_client.generate')
    def test_ollama_down_returns_503(self, mock_generate):
        from ai_assistant.ollama_client import OllamaUnavailableError
        mock_generate.side_effect = OllamaUnavailableError('down')
        resp = self.client_.post('/api/ai/generate-product/', {'name': 'Chaise'}, format='json')
        self.assertEqual(resp.status_code, 503)

    def test_confirmateur_without_permission_forbidden(self):
        member = make_team_member(self.owner.store, role='confirmateur')
        client_ = auth_client(member.user)
        resp = client_.post('/api/ai/generate-product/', {'name': 'Chaise'}, format='json')
        self.assertEqual(resp.status_code, 403)
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.GenerateProductViewTest -v 2`
Expected: `404` (URL inexistante) ou `ImportError`.

- [ ] **Step 3: Implémenter `views.py` (GenerateProductView), `serializers.py` (stub), `urls.py`**

`backend/ai_assistant/serializers.py` :
```python
from rest_framework import serializers

from .models import AIConversation, AIMessage


class AIMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIMessage
        fields = ['id', 'role', 'content', 'created_at']


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

`backend/ai_assistant/views.py` :
```python
import json

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.permissions import is_owner_or_admin, has_permission, get_store
from . import ollama_client
from .ollama_client import OllamaUnavailableError


def _check_access(request):
    if not (is_owner_or_admin(request) or has_permission(request, 'ai_assistant_view')):
        return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
    return None


PRODUCT_PROMPT = """Tu es un rédacteur e-commerce pour le marché algérien. Génère une fiche produit en français pour le produit suivant.
Nom du produit : {name}
Mots-clés additionnels : {keywords}

Réponds UNIQUEMENT avec un objet JSON valide de cette forme exacte (pas de texte avant/après) :
{{"description": "<p>...</p> (HTML simple, 2-3 paragraphes, ton commercial)", "meta_title": "... (max 70 caractères)", "meta_description": "... (max 160 caractères)", "meta_keywords": "mot1, mot2, mot3"}}
"""


class GenerateProductView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if (err := _check_access(request)):
            return err
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'detail': 'Le nom du produit est requis.'}, status=400)
        keywords = (request.data.get('keywords') or '').strip()
        prompt = PRODUCT_PROMPT.format(name=name, keywords=keywords or '—')
        try:
            raw = ollama_client.generate(prompt, json_mode=True)
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            try:
                raw = ollama_client.generate(prompt + '\nRappel : réponds UNIQUEMENT en JSON valide.', json_mode=True)
                data = json.loads(raw)
            except (ValueError, TypeError, OllamaUnavailableError):
                return Response({'detail': "L'IA n'a pas renvoyé un format exploitable, réessayez."}, status=502)
        return Response({
            'description': data.get('description', ''),
            'meta_title': data.get('meta_title', '')[:70],
            'meta_description': data.get('meta_description', '')[:160],
            'meta_keywords': data.get('meta_keywords', ''),
        })
```

`backend/ai_assistant/urls.py` :
```python
from django.urls import path

from .views import GenerateProductView

urlpatterns = [
    path('generate-product/', GenerateProductView.as_view()),
]
```

Dans `backend/config/urls.py`, ajouter dans `urlpatterns` (après la ligne `path('api/audit/', include('audit.urls')),`) :
```python
    path('api/ai/',       include('ai_assistant.urls')),
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test ai_assistant.tests.GenerateProductViewTest -v 2`
Expected: `Ran 3 tests ... OK`

- [ ] **Step 5: Frontend — wrapper API**

Create `frontend/src/api/aiApi.js` :
```javascript
import api from './axios'

export function generateProduct({ name, keywords }) {
  return api.post('/ai/generate-product/', { name, keywords }).then(r => r.data)
}
```

- [ ] **Step 6: Frontend — bouton dans `ProductFormPage.jsx`**

Dans `frontend/src/pages/products/ProductFormPage.jsx`, ajouter l'import en haut du fichier :
```javascript
import { generateProduct } from '../../api/aiApi'
```

Ajouter un état à côté des autres `useState` du composant (chercher la déclaration de `form`/`setForm` ligne ~23) :
```javascript
const [aiGenerating, setAiGenerating] = useState(false)
const [aiError, setAiError] = useState('')
```

Ajouter un handler juste avant le `return` du composant :
```javascript
const handleAiGenerate = async () => {
  if (!form.name?.trim()) {
    setAiError('Renseignez le nom du produit avant de générer.')
    return
  }
  setAiGenerating(true)
  setAiError('')
  try {
    const data = await generateProduct({ name: form.name, keywords: form.meta_keywords })
    setForm(f => ({
      ...f,
      description: data.description,
      meta_title: data.meta_title,
      meta_description: data.meta_description,
      meta_keywords: data.meta_keywords,
    }))
  } catch (e) {
    setAiError(e?.response?.data?.detail || 'Assistant IA indisponible')
  } finally {
    setAiGenerating(false)
  }
}
```

Juste avant le champ description (ligne ~976, `value={form.description}`), ajouter le bouton (dans le même bloc que le label de la description) :
```jsx
<div className="flex items-center justify-between mb-1">
  <label className="block text-xs text-app-muted-light">Description</label>
  <button type="button" onClick={handleAiGenerate} disabled={aiGenerating}
    className={theme.btn.outline + ' text-xs py-1 px-2 disabled:opacity-50'}>
    {aiGenerating ? 'Génération…' : '✨ Générer avec l\'IA'}
  </button>
</div>
{aiError && <p className="text-xs text-red-400 mb-1">{aiError}</p>}
```

- [ ] **Step 7: Commit**

```bash
git add backend/ai_assistant backend/config/urls.py frontend/src/api/aiApi.js frontend/src/pages/products/ProductFormPage.jsx
git commit -m "feat(ai): génération de fiche produit (description + SEO)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Suggestion de réponse Inbox

**Files:**
- Modify: `backend/ai_assistant/views.py`
- Modify: `backend/ai_assistant/urls.py`
- Modify: `backend/ai_assistant/tests.py`
- Modify: `frontend/src/api/aiApi.js`
- Modify: `frontend/src/pages/inbox/InboxPage.jsx`

**Interfaces:**
- Consumes: `inbox.models.Conversation` (le modèle boîte de réception existant — nommé `inbox_conversation` dans le code pour éviter la confusion avec `ai_assistant.models.AIConversation`), `inbox.views._get_store`, `inbox.views._can_view_inbox`.
- Produces: `POST /api/ai/inbox/<int:conversation_id>/suggest-reply/` → `{suggestion: str}` ; `frontend/src/api/aiApi.js::suggestReply(conversationId)`.

- [ ] **Step 1: Écrire le test backend**

Ajouter à `backend/ai_assistant/tests.py` :
```python
from inbox.models import Conversation, Message


class SuggestReplyViewTest(TestCase):
    def setUp(self):
        self.owner = make_owner()
        self.client_ = auth_client(self.owner)
        self.conv = Conversation.objects.create(
            store=self.owner.store, channel='complaint', subject='Problème livraison',
            customer_name='Amine', customer_phone='0555000000',
        )
        Message.objects.create(conversation=self.conv, direction='inbound', body='Ma commande est en retard')

    @patch('ai_assistant.views.ollama_client.generate')
    def test_suggests_reply(self, mock_generate):
        mock_generate.return_value = "Bonjour Amine, nous vérifions votre commande et revenons vers vous rapidement."
        resp = self.client_.post(f'/api/ai/inbox/{self.conv.id}/suggest-reply/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('Amine', resp.data['suggestion'])

    def test_wrong_conversation_404(self):
        resp = self.client_.post('/api/ai/inbox/999999/suggest-reply/')
        self.assertEqual(resp.status_code, 404)
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.SuggestReplyViewTest -v 2`
Expected: 404 sur route inexistante / `AttributeError`.

- [ ] **Step 3: Implémenter la vue**

Ajouter à `backend/ai_assistant/views.py` :
```python
from inbox.models import Conversation
from inbox.views import _get_store as _inbox_get_store, _can_view_inbox

REPLY_PROMPT = """Tu es un service client pour une boutique en ligne algérienne. Voici l'échange avec un client :

{thread}

Rédige une réponse professionnelle, courte (3-4 phrases max), en français, empathique et orientée solution. Réponds UNIQUEMENT avec le texte de la réponse, sans guillemets ni préambule."""


class SuggestReplyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        if (err := _check_access(request)):
            return err
        store = _inbox_get_store(request)
        if not store or not _can_view_inbox(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            inbox_conversation = store.conversations.select_related('order').prefetch_related('messages').get(pk=conversation_id)
        except Conversation.DoesNotExist:
            return Response({'detail': 'Conversation introuvable.'}, status=404)

        lines = []
        for m in inbox_conversation.messages.order_by('created_at'):
            speaker = 'Client' if m.direction == 'inbound' else 'Équipe'
            if m.body:
                lines.append(f'{speaker} : {m.body}')
        thread = '\n'.join(lines) or '(aucun message)'
        try:
            suggestion = ollama_client.generate(REPLY_PROMPT.format(thread=thread))
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)
        return Response({'suggestion': suggestion.strip()})
```

Ajouter à `backend/ai_assistant/urls.py` :
```python
from .views import GenerateProductView, SuggestReplyView

urlpatterns = [
    path('generate-product/', GenerateProductView.as_view()),
    path('inbox/<int:conversation_id>/suggest-reply/', SuggestReplyView.as_view()),
]
```

- [ ] **Step 4: Vérifier que `inbox.views` expose bien `_get_store`/`_can_view_inbox` avec ces noms exacts**

Run: `cd backend && grep -n "^def _get_store\|^def _can_view_inbox" inbox/views.py`
Expected : les deux fonctions existent avec ces noms (sinon adapter l'import de la Step 3 aux noms réels trouvés).

- [ ] **Step 5: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test ai_assistant.tests.SuggestReplyViewTest -v 2`
Expected: `Ran 2 tests ... OK`

- [ ] **Step 6: Frontend — wrapper API**

Ajouter à `frontend/src/api/aiApi.js` :
```javascript
export function suggestReply(conversationId) {
  return api.post(`/ai/inbox/${conversationId}/suggest-reply/`).then(r => r.data)
}
```

- [ ] **Step 7: Frontend — bouton dans `InboxPage.jsx`**

Ajouter l'import en haut du fichier :
```javascript
import { suggestReply } from '../../api/aiApi'
```

Ajouter un état près de `newMessage`/`setNewMessage` (ligne ~53) :
```javascript
const [aiSuggesting, setAiSuggesting] = useState(false)
```

Ajouter un handler :
```javascript
const handleAiSuggest = async () => {
  if (!selectedId) return
  setAiSuggesting(true)
  try {
    const data = await suggestReply(selectedId)
    setNewMessage(data.suggestion)
  } catch (e) {
    // best-effort — pas de blocage de l'UI si l'IA est indisponible
  } finally {
    setAiSuggesting(false)
  }
}
```
(remplacer `selectedId` par le nom réel de la variable d'état contenant l'id de la conversation ouverte — vérifier son nom exact dans le fichier avant d'écrire ce handler.)

Ajouter un bouton juste avant la `<textarea>` de réponse (ligne ~219) :
```jsx
<button type="button" onClick={handleAiSuggest} disabled={aiSuggesting}
  className={theme.btn.outline + ' text-xs py-1 px-2 mb-1 disabled:opacity-50'}>
  {aiSuggesting ? 'Suggestion…' : '✨ Suggérer une réponse'}
</button>
```

- [ ] **Step 8: Commit**

```bash
git add backend/ai_assistant frontend/src/api/aiApi.js frontend/src/pages/inbox/InboxPage.jsx
git commit -m "feat(ai): suggestion de réponse IA dans la Boîte de réception

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Résumé IA du Dashboard

**Files:**
- Modify: `backend/ai_assistant/views.py`
- Modify: `backend/ai_assistant/urls.py`
- Modify: `backend/ai_assistant/tests.py`
- Create: `frontend/src/components/AISummaryCard.jsx`
- Modify: `frontend/src/api/aiApi.js`
- Modify: `frontend/src/pages/dashboard/DeliveriesTab.jsx`
- Modify: `frontend/src/pages/dashboard/RevenueTab.jsx`
- Modify: `frontend/src/pages/dashboard/KpiTab.jsx`

**Interfaces:**
- Consumes: `orders.stats_views.DashboardDeliveriesView`/`DashboardRevenueView`/`DashboardKpiView` (instanciées et appelées directement avec la requête courante, réutilisant leur propre gating de permission).
- Produces: `GET /api/ai/dashboard-summary/?tab=deliveries|revenue|kpi&...` → `{summary: str}` ; `frontend/src/api/aiApi.js::getDashboardSummary(tab, queryString)` ; `<AISummaryCard tab="deliveries" queryString={...} />`.

- [ ] **Step 1: Écrire le test backend**

Ajouter à `backend/ai_assistant/tests.py` :
```python
class DashboardSummaryViewTest(TestCase):
    def setUp(self):
        self.owner = make_owner()
        self.client_ = auth_client(self.owner)

    @patch('ai_assistant.views.ollama_client.generate')
    def test_deliveries_summary(self, mock_generate):
        mock_generate.return_value = "Sur la période, 12 commandes ont été passées, dont 8 confirmées."
        resp = self.client_.get('/api/ai/dashboard-summary/?tab=deliveries&period=week')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('commandes', resp.data['summary'])

    def test_invalid_tab_400(self):
        resp = self.client_.get('/api/ai/dashboard-summary/?tab=inexistant')
        self.assertEqual(resp.status_code, 400)
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.DashboardSummaryViewTest -v 2`
Expected: 404 route inexistante.

- [ ] **Step 3: Implémenter la vue**

Ajouter à `backend/ai_assistant/views.py` :
```python
from orders.stats_views import DashboardDeliveriesView, DashboardRevenueView, DashboardKpiView

SUMMARY_PROMPT = """Tu es un analyste e-commerce. Voici des données brutes (JSON) du tableau de bord d'une boutique algérienne pour la période demandée :

{data}

Résume ces chiffres en 3-4 phrases en français, ton clair et direct, en mettant en avant ce qui est le plus notable (tendance positive/négative, chiffre marquant). Ne répète pas bêtement chaque champ, synthétise. Réponds uniquement avec le résumé, pas de préambule."""

_DASHBOARD_TAB_VIEWS = {
    'deliveries': DashboardDeliveriesView,
    'revenue': DashboardRevenueView,
    'kpi': DashboardKpiView,
}


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if (err := _check_access(request)):
            return err
        tab = request.query_params.get('tab')
        view_cls = _DASHBOARD_TAB_VIEWS.get(tab)
        if not view_cls:
            return Response({'detail': 'tab doit être deliveries, revenue ou kpi.'}, status=400)
        underlying = view_cls()
        underlying_resp = underlying.get(request)
        if underlying_resp.status_code != 200:
            return underlying_resp
        import json as _json
        from decimal import Decimal
        data_str = _json.dumps(underlying_resp.data, default=str, ensure_ascii=False)[:4000]
        try:
            summary = ollama_client.generate(SUMMARY_PROMPT.format(data=data_str))
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)
        return Response({'summary': summary.strip()})
```

Ajouter à `backend/ai_assistant/urls.py` :
```python
from .views import GenerateProductView, SuggestReplyView, DashboardSummaryView

urlpatterns = [
    path('generate-product/', GenerateProductView.as_view()),
    path('inbox/<int:conversation_id>/suggest-reply/', SuggestReplyView.as_view()),
    path('dashboard-summary/', DashboardSummaryView.as_view()),
]
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test ai_assistant.tests.DashboardSummaryViewTest -v 2`
Expected: `Ran 2 tests ... OK`

- [ ] **Step 5: Frontend — wrapper API + composant réutilisable**

Ajouter à `frontend/src/api/aiApi.js` :
```javascript
export function getDashboardSummary(tab, queryString) {
  return api.get(`/ai/dashboard-summary/?tab=${tab}&${queryString}`).then(r => r.data)
}
```

Create `frontend/src/components/AISummaryCard.jsx` :
```jsx
import { useState } from 'react'
import { theme } from '../theme'
import { getDashboardSummary } from '../api/aiApi'

export default function AISummaryCard({ tab, queryString }) {
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getDashboardSummary(tab, queryString)
      setSummary(data.summary)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Assistant IA indisponible')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-app p-4 bg-app-card mb-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-app-primary">✨ Résumé IA</span>
        <button type="button" onClick={handleGenerate} disabled={loading}
          className={theme.btn.outline + ' text-xs py-1 px-2 disabled:opacity-50'}>
          {loading ? 'Analyse…' : summary ? 'Régénérer' : 'Générer'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      {summary && <p className="text-sm text-app-muted mt-2">{summary}</p>}
    </div>
  )
}
```

- [ ] **Step 6: Intégrer dans les 3 onglets**

Dans chacun de `frontend/src/pages/dashboard/DeliveriesTab.jsx`, `RevenueTab.jsx`, `KpiTab.jsx` : ajouter l'import
```javascript
import AISummaryCard from '../../components/AISummaryCard'
```
et insérer `<AISummaryCard tab="deliveries" queryString={queryString} />` (remplacer `"deliveries"` par `"revenue"`/`"kpi"` selon le fichier, et `queryString` par le nom réel de la variable/fonction qui construit la query string période+filtres dans ce composant — vérifier son nom exact avant d'écrire la ligne) juste après l'ouverture du conteneur principal du composant, avant les cartes existantes.

- [ ] **Step 7: Commit**

```bash
git add backend/ai_assistant frontend/src/components/AISummaryCard.jsx frontend/src/api/aiApi.js frontend/src/pages/dashboard
git commit -m "feat(ai): résumé IA sur les 3 onglets du tableau de bord

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Chat libre — tools + endpoints conversation/chat

**Files:**
- Create: `backend/ai_assistant/tools.py`
- Modify: `backend/ai_assistant/views.py`
- Modify: `backend/ai_assistant/urls.py`
- Modify: `backend/ai_assistant/tests.py`

**Interfaces:**
- Consumes: `core.permissions.has_permission`, `core.permissions.is_owner_or_admin`, `core.permissions.get_store`.
- Produces: `tools.TOOL_DEFINITIONS` (liste de schémas function-calling Ollama), `tools.execute_tool(request, name, arguments) -> str` ; `GET/POST /api/ai/conversations/`, `GET /api/ai/conversations/<id>/`, `POST /api/ai/chat/`.

- [ ] **Step 1: Écrire les tests des tools (permission gating)**

Ajouter à `backend/ai_assistant/tests.py` :
```python
from . import tools as ai_tools


class ToolsTest(TestCase):
    def setUp(self):
        self.owner = make_owner()
        from products.models import Product
        Product.objects.create(store=self.owner.store, name='Produit test', price=1000, stock=2)

    def test_owner_can_get_low_stock(self):
        from rest_framework.test import APIRequestFactory
        from core.test_utils import auth_client
        factory = APIRequestFactory()
        req = factory.get('/api/ai/chat/')
        req.user = self.owner
        result = ai_tools.execute_tool(req, 'get_low_stock', {})
        self.assertIn('Produit test', result)

    def test_confirmateur_without_stock_view_refused(self):
        from core.test_utils import make_team_member
        from rest_framework.test import APIRequestFactory
        member = make_team_member(self.owner.store, role='confirmateur')
        factory = APIRequestFactory()
        req = factory.get('/api/ai/chat/')
        req.user = member.user
        result = ai_tools.execute_tool(req, 'get_low_stock', {})
        self.assertIn("n'avez pas la permission", result)
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd backend && venv/Scripts/python manage.py test ai_assistant.tests.ToolsTest -v 2`
Expected: `ModuleNotFoundError: No module named 'ai_assistant.tools'`

- [ ] **Step 3: Implémenter `tools.py`**

```python
"""Tools exposés au chat libre (function calling Ollama). Chaque fonction
réplique EXACTEMENT la formule de permission de l'endpoint REST équivalent —
jamais d'exception : un confirmateur sans `stock_view` ne doit jamais
recevoir cette donnée via l'IA alors qu'il ne l'aurait pas via l'UI normale."""
import json
from decimal import Decimal

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
    products = list(store.products.filter(stock__lte=threshold, is_active=True).values('name', 'stock')[:20])
    return _serialize({'threshold': threshold, 'products': products})


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
        def __init__(self, user, store, period_start, period_end):
            self.user = user
            self.query_params = {'period_start': period_start or '', 'period_end': period_end or ''}

    view = ProfitabilitySummaryView()
    resp = view.get(_Shim(request.user, store, period_start, period_end))
    return _serialize(resp.data if resp.status_code == 200 else {'error': 'indisponible'})


TOOL_REGISTRY = {
    'get_orders_summary': get_orders_summary,
    'get_low_stock': get_low_stock,
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
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test ai_assistant.tests.ToolsTest -v 2`
Expected: `Ran 2 tests ... OK`

- [ ] **Step 5: Écrire les tests des vues conversation/chat**

Ajouter à `backend/ai_assistant/tests.py` :
```python
from .models import AIConversation


class ChatViewTest(TestCase):
    def setUp(self):
        self.owner = make_owner()
        self.client_ = auth_client(self.owner)

    @patch('ai_assistant.views.ollama_client.chat')
    def test_chat_creates_conversation_and_replies(self, mock_chat):
        mock_chat.return_value = {'role': 'assistant', 'content': 'Bonjour, comment puis-je vous aider ?'}
        resp = self.client_.post('/api/ai/chat/', {'message': 'Salut'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('conversation_id', resp.data)
        self.assertEqual(AIConversation.objects.count(), 1)
        self.assertEqual(AIConversation.objects.first().messages.count(), 2)  # user + assistant

    @patch('ai_assistant.views.ollama_client.chat')
    def test_chat_executes_tool_call(self, mock_chat):
        mock_chat.side_effect = [
            {'role': 'assistant', 'content': '', 'tool_calls': [
                {'function': {'name': 'get_low_stock', 'arguments': {}}}
            ]},
            {'role': 'assistant', 'content': 'Vous avez 0 produit en stock bas.'},
        ]
        resp = self.client_.post('/api/ai/chat/', {'message': 'Quel est mon stock bas ?'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(mock_chat.call_count, 2)

    def test_list_conversations(self):
        AIConversation.objects.create(store=self.owner.store, user=self.owner, title='Ancienne')
        resp = self.client_.get('/api/ai/conversations/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
```

- [ ] **Step 6: Run pour vérifier l'échec**

Run: `venv/Scripts/python manage.py test ai_assistant.tests.ChatViewTest -v 2`
Expected: 404 routes inexistantes.

- [ ] **Step 7: Implémenter les vues Chat/Conversation**

Ajouter à `backend/ai_assistant/views.py` :
```python
from .models import AIConversation, AIMessage
from .serializers import AIConversationSerializer, AIConversationDetailSerializer
from . import tools as ai_tools


class ConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if (err := _check_access(request)):
            return err
        store = get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        convs = AIConversation.objects.filter(store=store, user=request.user)
        return Response(AIConversationSerializer(convs, many=True).data)


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if (err := _check_access(request)):
            return err
        store = get_store(request)
        try:
            conv = AIConversation.objects.get(pk=pk, store=store, user=request.user)
        except AIConversation.DoesNotExist:
            return Response({'detail': 'Conversation introuvable.'}, status=404)
        return Response(AIConversationDetailSerializer(conv).data)


MAX_TOOL_ROUNDS = 3


class ChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if (err := _check_access(request)):
            return err
        store = get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        message = (request.data.get('message') or '').strip()
        if not message:
            return Response({'detail': 'Le message est requis.'}, status=400)

        conversation_id = request.data.get('conversation_id')
        if conversation_id:
            try:
                conv = AIConversation.objects.get(pk=conversation_id, store=store, user=request.user)
            except AIConversation.DoesNotExist:
                return Response({'detail': 'Conversation introuvable.'}, status=404)
        else:
            conv = AIConversation.objects.create(store=store, user=request.user, title=message[:60])

        AIMessage.objects.create(conversation=conv, role='user', content=message)

        history = [{'role': m.role, 'content': m.content} for m in conv.messages.order_by('created_at') if m.role != 'tool']

        try:
            for _ in range(MAX_TOOL_ROUNDS):
                assistant_msg = ollama_client.chat(history, tools=ai_tools.TOOL_DEFINITIONS)
                tool_calls = assistant_msg.get('tool_calls') or []
                if not tool_calls:
                    break
                history.append({'role': 'assistant', 'content': assistant_msg.get('content', '')})
                for call in tool_calls:
                    fn = call.get('function', {})
                    name = fn.get('name')
                    arguments = fn.get('arguments') or {}
                    result = ai_tools.execute_tool(request, name, arguments)
                    AIMessage.objects.create(conversation=conv, role='tool', content=f'{name}: {result}')
                    history.append({'role': 'tool', 'content': result})
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)

        final_content = assistant_msg.get('content', '')
        AIMessage.objects.create(conversation=conv, role='assistant', content=final_content)
        conv.save(update_fields=['updated_at'])

        return Response({'conversation_id': conv.id, 'reply': final_content})
```

Ajouter à `backend/ai_assistant/urls.py` :
```python
from .views import (
    GenerateProductView, SuggestReplyView, DashboardSummaryView,
    ConversationListView, ConversationDetailView, ChatView,
)

urlpatterns = [
    path('generate-product/', GenerateProductView.as_view()),
    path('inbox/<int:conversation_id>/suggest-reply/', SuggestReplyView.as_view()),
    path('dashboard-summary/', DashboardSummaryView.as_view()),
    path('conversations/', ConversationListView.as_view()),
    path('conversations/<int:pk>/', ConversationDetailView.as_view()),
    path('chat/', ChatView.as_view()),
]
```

- [ ] **Step 8: Run pour vérifier le succès**

Run: `venv/Scripts/python manage.py test ai_assistant -v 2`
Expected: tous les tests de `ai_assistant` passent (compte total attendu : 2 + 4 + 3 + 2 + 2 + 3 = 16 tests, `OK`).

- [ ] **Step 9: Commit**

```bash
git add backend/ai_assistant
git commit -m "feat(ai): chat libre avec tool calling gated par permissions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — page Assistant IA, route, sidebar

**Files:**
- Create: `frontend/src/pages/ai/AIAssistantPage.jsx`
- Modify: `frontend/src/api/aiApi.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/DashboardLayout.jsx`
- Test: `frontend/src/tests/pages/ai/AIAssistantPage.test.jsx`
- Test: `frontend/src/tests/App.test.jsx` (déjà existant — doit continuer à passer sans modification, la nouvelle route déclare `perm=`)

**Interfaces:**
- Consumes: `POST /api/ai/chat/`, `GET /api/ai/conversations/`, `GET /api/ai/conversations/<id>/` (Task 6).
- Produces: route `/dashboard/assistant-ia`, lien sidebar sous permission `ai_assistant_view`.

- [ ] **Step 1: Compléter `aiApi.js`**

Ajouter à `frontend/src/api/aiApi.js` :
```javascript
export function listConversations() {
  return api.get('/ai/conversations/').then(r => r.data)
}

export function getConversation(id) {
  return api.get(`/ai/conversations/${id}/`).then(r => r.data)
}

export function sendChatMessage({ conversationId, message }) {
  return api.post('/ai/chat/', { conversation_id: conversationId, message }).then(r => r.data)
}
```

- [ ] **Step 2: Écrire le test frontend (mock axios)**

Create `frontend/src/tests/pages/ai/AIAssistantPage.test.jsx` :
```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import AIAssistantPage from '../../../pages/ai/AIAssistantPage'

vi.mock('../../../api/axios', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/ai/conversations/')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: { count: 0 } })
    }),
    post: vi.fn(() => Promise.resolve({ data: { conversation_id: 1, reply: 'Bonjour, je suis votre assistant.' } })),
  },
}))
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { team_role: null, permissions: {} } }),
}))

describe('AIAssistantPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('affiche le champ de saisie et envoie un message', async () => {
    render(<MemoryRouter><AIAssistantPage /></MemoryRouter>)
    const input = await screen.findByPlaceholderText(/posez une question/i)
    fireEvent.change(input, { target: { value: 'Combien de commandes ce mois-ci ?' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    await waitFor(() => expect(screen.getByText(/Bonjour, je suis votre assistant/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 3: Run pour vérifier l'échec**

Run: `cd frontend && npm run test -- AIAssistantPage`
Expected: échec, `AIAssistantPage.jsx` n'existe pas.

- [ ] **Step 4: Implémenter `AIAssistantPage.jsx`**

```jsx
import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import { theme } from '../../theme'
import { listConversations, getConversation, sendChatMessage } from '../../api/aiApi'

export default function AIAssistantPage() {
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    listConversations().then(setConversations).catch(() => {})
  }, [])

  useEffect(() => {
    if (activeId) {
      getConversation(activeId).then(c => setMessages(c.messages)).catch(() => {})
    }
  }, [activeId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return
    const userText = input
    setMessages(m => [...m, { role: 'user', content: userText }])
    setInput('')
    setSending(true)
    setError('')
    try {
      const data = await sendChatMessage({ conversationId: activeId, message: userText })
      setActiveId(data.conversation_id)
      setMessages(m => [...m, { role: 'assistant', content: data.reply }])
      listConversations().then(setConversations).catch(() => {})
    } catch (e) {
      setError(e?.response?.data?.detail || 'Assistant IA indisponible')
    } finally {
      setSending(false)
    }
  }

  return (
    <DashboardLayout title="Assistant IA" subtitle="Posez une question sur votre boutique — commandes, stock, clients à risque, rentabilité.">
      <div className="flex gap-4 h-[70vh]">
        <div className="w-64 shrink-0 rounded-lg border border-app bg-app-card overflow-y-auto">
          <button type="button" onClick={() => { setActiveId(null); setMessages([]) }}
            className="w-full text-left px-3 py-2 text-sm text-app-primary border-b border-app">
            + Nouvelle conversation
          </button>
          {conversations.map(c => (
            <button key={c.id} type="button" onClick={() => setActiveId(c.id)}
              className={`w-full text-left px-3 py-2 text-sm truncate ${activeId === c.id ? 'bg-app-card-alt' : ''}`}>
              {c.title || `Conversation #${c.id}`}
            </button>
          ))}
        </div>
        <div className="flex-1 flex flex-col rounded-lg border border-app bg-app-card">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.filter(m => m.role !== 'tool').map((m, i) => (
              <div key={i} className={`text-sm rounded-lg px-3 py-2 max-w-[80%] ${m.role === 'user' ? 'ml-auto bg-violet-600 text-white' : 'bg-app-card-alt text-app-primary'}`}>
                {m.content}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          {error && <p className="text-xs text-red-400 px-4">{error}</p>}
          <div className="flex gap-2 p-3 border-t border-app">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Posez une question sur votre boutique…"
              className="flex-1 rounded-lg border border-app bg-transparent px-3 py-2 text-sm text-app-primary" />
            <button type="button" onClick={handleSend} disabled={sending}
              className={theme.btn.primary + ' text-sm disabled:opacity-50'}>
              {sending ? '…' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
```

- [ ] **Step 5: Run pour vérifier le succès**

Run: `cd frontend && npm run test -- AIAssistantPage`
Expected: `1 passed`

- [ ] **Step 6: Route et sidebar**

Dans `frontend/src/App.jsx`, ajouter l'import (avec les autres imports de pages, section finance) :
```javascript
import AIAssistantPage from './pages/ai/AIAssistantPage'
```
Ajouter la route (après la ligne `path="/dashboard/webhooks"`) :
```jsx
<Route path="/dashboard/assistant-ia"                element={<PD perm="ai_assistant_view"><AIAssistantPage /></PD>} />
```

Dans `frontend/src/components/DashboardLayout.jsx`, ajouter le lien sidebar juste après le bloc `marketing_view` (ligne ~586-588) :
```jsx
{can('ai_assistant_view') && (
  <li>{mainLink('/dashboard/assistant-ia', ICONS.marketing, 'Assistant IA')}</li>
)}
```
(réutiliser `ICONS.marketing` ou toute icône déjà importée du set d'icônes du fichier — vérifier les clés disponibles dans l'objet `ICONS` avant de choisir, ne pas inventer une clé qui n'existe pas.)

- [ ] **Step 7: Run la suite frontend complète pour vérifier l'absence de régression**

Run: `cd frontend && npm run test`
Expected: tous les tests passent, y compris `App.test.jsx` (la nouvelle route porte bien `perm=`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/ai frontend/src/api/aiApi.js frontend/src/App.jsx frontend/src/components/DashboardLayout.jsx frontend/src/tests/pages/ai
git commit -m "feat(ai): page Assistant IA (chat libre) + route + lien sidebar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Déploiement — service Ollama dans Docker Compose

**Files:**
- Modify: `docker-compose.yml`
- Modify: `CLAUDE.md` (documentation du nouveau service + variables d'env)

**Interfaces:**
- Consumes: aucune (config infra pure).
- Produces: service `ollama` accessible depuis `backend` via `http://ollama:11434`.

- [ ] **Step 1: Lire le `docker-compose.yml` actuel**

Run: `cd "c:/Users/filali/MZSolutions" && cat docker-compose.yml`
(Utiliser le résultat pour respecter exactement le style/indentation existants avant d'éditer.)

- [ ] **Step 2: Ajouter le service `ollama` et la dépendance côté `backend`**

Dans `docker-compose.yml`, ajouter un nouveau service au même niveau que `db`/`backend`/`frontend`/`caddy` :
```yaml
  ollama:
    image: ollama/ollama
    restart: unless-stopped
    volumes:
      - ollama_data:/root/.ollama
```

Dans le service `backend`, ajouter à sa liste `depends_on` (créer la clé si absente) `ollama`, et dans son `environment` :
```yaml
      OLLAMA_BASE_URL: http://ollama:11434
      OLLAMA_MODEL: llama3.1:8b
```

Dans la section `volumes:` de fin de fichier, ajouter :
```yaml
  ollama_data:
```

- [ ] **Step 3: Valider la syntaxe du compose file**

Run: `cd "c:/Users/filali/MZSolutions" && docker compose config --quiet`
Expected: aucune sortie (0 erreur de syntaxe). Si Docker n'est pas installé/disponible sur cette machine, passer cette étape et noter dans le commit qu'elle n'a pas pu être vérifiée localement.

- [ ] **Step 4: Documenter dans `CLAUDE.md`**

Ajouter, dans `CLAUDE.md`, une nouvelle sous-section sous la section "Structure Backend" ou à la fin (juste avant "Commandes Utiles") :
```markdown
### Assistant IA (Ollama local, 2026-09)

App `ai_assistant/` — génération de fiche produit, suggestion de réponse Inbox, résumé IA du dashboard, chat libre avec tool calling (`ai_assistant/tools.py`, chaque tool réplique le `has_permission()` de son endpoint équivalent). Client HTTP unique `ai_assistant/ollama_client.py` (`OLLAMA_BASE_URL`/`OLLAMA_MODEL` en env, défaut `http://localhost:11434`/`llama3.1:8b`). Toute panne Ollama → `503`, jamais un blocage du flux appelant. Permission `ai_assistant_view` (masquée par défaut confirmateur/dropshipper). Historique persisté uniquement pour le chat libre (`AIConversation`/`AIMessage`).

En prod (Docker) : service `ollama` dans `docker-compose.yml`, modèle à tirer manuellement après le premier démarrage : `docker compose exec ollama ollama pull llama3.1:8b`. En dev local : installer Ollama nativement (`OLLAMA_BASE_URL=http://localhost:11434`, valeur par défaut).
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml CLAUDE.md
git commit -m "feat(ai): service Ollama dans Docker Compose + documentation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review (fait avant remise du plan)

- **Couverture du spec** : génération produit (Task 3), suggestion Inbox (Task 4), résumé dashboard (Task 5), chat libre + tools (Task 6), page dédiée + route + sidebar (Task 7), permission `ai_assistant_view` (Task 1), déploiement Docker (Task 8). Tous les points du spec sont couverts.
- **Placeholders** : aucun TBD/TODO — chaque step contient du code complet ou une commande exacte avec sortie attendue.
- **Cohérence des types/noms** : `ollama_client.generate(prompt, json_mode=False)` et `ollama_client.chat(messages, tools=None)` utilisés de façon identique dans toutes les tâches qui les consomment (3, 4, 5, 6). `ai_tools.execute_tool(request, name, arguments)` cohérent entre Task 6 (définition) et son usage dans `ChatView`. `AIConversation`/`AIMessage` (Task 1) utilisés à l'identique dans les tâches 6 et 7.
- **Points explicitement signalés comme à vérifier en conditions réelles avant d'écrire le code final** (noms exacts non garantis sans lecture du fichier au moment de l'implémentation) : nom de la variable d'état "conversation sélectionnée" dans `InboxPage.jsx` (Task 4), nom de la fonction/variable de query string période+filtres dans chaque onglet Dashboard (Task 5), clés disponibles dans l'objet `ICONS` de `DashboardLayout.jsx` (Task 7), noms exacts de `_get_store`/`_can_view_inbox` dans `inbox/views.py` (Task 4) — chaque tâche correspondante inclut une étape de vérification avant d'écrire la ligne finale.
