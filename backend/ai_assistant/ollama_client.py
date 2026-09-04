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
