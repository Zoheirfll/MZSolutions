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
