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
