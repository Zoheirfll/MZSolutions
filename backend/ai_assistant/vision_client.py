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
