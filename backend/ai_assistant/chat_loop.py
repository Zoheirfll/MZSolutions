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
