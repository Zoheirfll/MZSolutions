import json

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.permissions import is_owner_or_admin, has_permission, get_store
from inbox.models import Conversation
from inbox.views import _get_store as _inbox_get_store, _can_view_inbox
from orders.stats_views import DashboardDeliveriesView, DashboardRevenueView, DashboardKpiView

from . import ollama_client
from . import tools as ai_tools
from .ollama_client import OllamaUnavailableError
from .models import AIConversation, AIMessage
from .serializers import AIConversationSerializer, AIConversationDetailSerializer


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
        data_str = json.dumps(underlying_resp.data, default=str, ensure_ascii=False)[:4000]
        try:
            summary = ollama_client.generate(SUMMARY_PROMPT.format(data=data_str))
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)
        return Response({'summary': summary.strip()})


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

    def delete(self, request, pk):
        if (err := _check_access(request)):
            return err
        store = get_store(request)
        try:
            conv = AIConversation.objects.get(pk=pk, store=store, user=request.user)
        except AIConversation.DoesNotExist:
            return Response({'detail': 'Conversation introuvable.'}, status=404)
        conv.delete()
        return Response(status=204)


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

        assistant_msg = {'content': ''}
        try:
            for _ in range(MAX_TOOL_ROUNDS):
                assistant_msg = ollama_client.chat(history, tools=ai_tools.TOOL_DEFINITIONS)
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
                    result = ai_tools.execute_tool(request, name, arguments)
                    AIMessage.objects.create(conversation=conv, role='tool', content=f'{name}: {result}')
                    history.append({'role': 'tool', 'tool_call_id': call.get('id', ''), 'content': result})
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)

        final_content = assistant_msg.get('content', '')
        AIMessage.objects.create(conversation=conv, role='assistant', content=final_content)
        conv.save(update_fields=['updated_at'])

        return Response({'conversation_id': conv.id, 'reply': final_content})
