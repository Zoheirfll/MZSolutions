"""Client HTTP unique vers le(s) fournisseur(s) IA — chat() et generate() sont
les deux seules fonctions consommées par le reste de l'app, quel que soit le
fournisseur actif. Timeout court et exception typée : une panne ne doit
jamais faire planter l'appelant (voir OllamaUnavailableError, traduite en
503 par chaque vue).

Deux fournisseurs interchangeables via `settings.AI_PROVIDER` (env
`AI_PROVIDER`, défaut 'ollama') :
- 'ollama' — local, gratuit, nécessite un serveur avec assez de RAM (voir
  incident 2026-09-05 : un t3.micro/908 Mo ne peut pas charger un modèle,
  même petit, sans faire tuer des workers backend par l'OOM killer).
- 'groq' — API cloud (quota gratuit), utilisée en solution transitoire le
  temps de dimensionner un vrai serveur. Endpoint compatible OpenAI, mêmes
  schémas de tools que ai_assistant/tools.py (déjà au format OpenAI/Groq,
  qu'Ollama accepte aussi tel quel).

Le module garde le nom `ollama_client`/`OllamaUnavailableError` malgré le
multi-fournisseur — renommer casserait les points d'import existants
(views.py, tests.py) pour un gain cosmétique seulement."""
import json as _json

import requests
from django.conf import settings

TIMEOUT_SECONDS = 30
GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'


class OllamaUnavailableError(Exception):
    pass


def _provider():
    return getattr(settings, 'AI_PROVIDER', 'ollama')


def _base_url():
    return settings.OLLAMA_BASE_URL.rstrip('/')


def _model():
    return settings.OLLAMA_MODEL


def chat(messages, tools=None):
    """Renvoie le dict `message` (contient `role`, `content`, et
    `tool_calls` si le modèle a appelé un outil) — `tool_calls[].function.
    arguments` toujours normalisé en dict, quel que soit le fournisseur
    (Groq/OpenAI renvoient une chaîne JSON, Ollama un dict natif)."""
    if _provider() == 'groq':
        return _groq_chat(messages, tools)
    return _ollama_chat(messages, tools)


def generate(prompt, json_mode=False):
    """Renvoie directement le texte généré. `json_mode=True` contraint la
    sortie à du JSON valide (utilisé par la génération de fiche produit) —
    fonctionne avec les deux fournisseurs."""
    if _provider() == 'groq':
        return _groq_generate(prompt, json_mode)
    return _ollama_generate(prompt, json_mode)


def _ollama_chat(messages, tools=None):
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


def _ollama_generate(prompt, json_mode=False):
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


def _groq_headers():
    return {'Authorization': f'Bearer {settings.GROQ_API_KEY}', 'Content-Type': 'application/json'}


def _normalize_tool_call_arguments(message):
    """Groq/OpenAI renvoient `tool_calls[].function.arguments` comme une
    chaîne JSON (pas un dict) — ai_assistant/views.py::ChatView fait
    `**arguments` directement, donc on parse ici une fois pour toutes plutôt
    que de dupliquer ce parsing côté appelant."""
    for call in message.get('tool_calls') or []:
        fn = call.get('function', {})
        args = fn.get('arguments')
        if isinstance(args, str):
            try:
                fn['arguments'] = _json.loads(args) if args else {}
            except (ValueError, TypeError):
                fn['arguments'] = {}
    return message


def _outgoing_messages_for_groq(messages):
    """Groq/OpenAI exigent `tool_calls[].function.arguments` en chaîne JSON
    dans les messages RENVOYÉS à l'API (contrairement à la réponse reçue,
    déjà normalisée en dict par _normalize_tool_call_arguments). L'appelant
    (ChatView) manipule uniquement des dicts, jamais cette contrainte
    spécifique à Groq — donc on re-sérialise ici, à la sortie, plutôt que de
    complexifier views.py avec une logique par fournisseur."""
    out = []
    for m in messages:
        if m.get('role') == 'assistant' and m.get('tool_calls'):
            calls = []
            for call in m['tool_calls']:
                fn = dict(call.get('function', {}))
                args = fn.get('arguments')
                fn['arguments'] = _json.dumps(args if isinstance(args, dict) else (args or {}))
                calls.append({**call, 'function': fn})
            out.append({**m, 'tool_calls': calls})
        else:
            out.append(m)
    return out


def _groq_chat(messages, tools=None):
    payload = {'model': settings.GROQ_MODEL, 'messages': _outgoing_messages_for_groq(messages)}
    if tools:
        payload['tools'] = tools
    try:
        resp = requests.post(GROQ_API_URL, json=payload, headers=_groq_headers(), timeout=TIMEOUT_SECONDS)
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
        raise OllamaUnavailableError(str(exc)) from exc
    if resp.status_code != 200:
        raise OllamaUnavailableError(f'Groq a répondu {resp.status_code}: {resp.text[:200]}')
    message = resp.json()['choices'][0]['message']
    return _normalize_tool_call_arguments(message)


def _groq_generate(prompt, json_mode=False):
    payload = {'model': settings.GROQ_MODEL, 'messages': [{'role': 'user', 'content': prompt}]}
    if json_mode:
        payload['response_format'] = {'type': 'json_object'}
    try:
        resp = requests.post(GROQ_API_URL, json=payload, headers=_groq_headers(), timeout=TIMEOUT_SECONDS)
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
        raise OllamaUnavailableError(str(exc)) from exc
    if resp.status_code != 200:
        raise OllamaUnavailableError(f'Groq a répondu {resp.status_code}: {resp.text[:200]}')
    return resp.json()['choices'][0]['message']['content']
