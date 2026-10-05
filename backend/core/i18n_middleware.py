import json

from .api_messages_ar import AR

# Préfixes (messages suivis d'une valeur dynamique), plus longs d'abord.
_PREFIXES = sorted((k for k in AR if k.endswith((': ', '(', '« ', ' » doit être d\'au moins ')) or k.startswith(' ')), key=len, reverse=True)


def translate(text):
    if text in AR:
        return AR[text]
    for p in _PREFIXES:
        if text.startswith(p):
            return AR[p] + text[len(p):]
    return text


def _walk(value):
    if isinstance(value, str):
        return translate(value)
    if isinstance(value, list):
        return [_walk(v) for v in value]
    if isinstance(value, dict):
        return {k: _walk(v) for k, v in value.items()}
    return value


class ApiLanguageMiddleware:
    """Traduit en arabe les messages JSON de l'API quand le client envoie `Accept-Language: ar`.

    Correspondance exacte sur le texte français : tout message inconnu (ou dynamique
    non listé) reste en français — jamais d'erreur ni de réponse cassée.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        lang = request.META.get('HTTP_ACCEPT_LANGUAGE', '').lower()
        if not lang.startswith('ar'):
            return response
        if 'application/json' not in response.get('Content-Type', '') or not getattr(response, 'content', b''):
            return response
        try:
            data = json.loads(response.content)
        except ValueError:
            return response
        translated = _walk(data)
        if translated != data:
            response.content = json.dumps(translated, ensure_ascii=False).encode('utf-8')
            response['Content-Length'] = str(len(response.content))
        return response
