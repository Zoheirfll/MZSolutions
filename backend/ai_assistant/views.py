import json

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from django.db import transaction
from django.utils import timezone

from core.permissions import is_owner_or_admin, has_permission, get_store
from inbox.models import Conversation
from inbox.views import _get_store as _inbox_get_store, _can_view_inbox
from orders.stats_views import DashboardDeliveriesView, DashboardRevenueView, DashboardKpiView
from audit.models import AuditLog

from . import ollama_client
from . import tools as ai_tools
from . import write_tools as ai_write_tools
from . import vision_client
from .chat_loop import run_chat_loop
from .ollama_client import OllamaUnavailableError
from .models import AIConversation, AIMessage, AIPendingAction, AIProductDraft
from .serializers import (
    AIConversationSerializer, AIConversationDetailSerializer,
    AIPendingActionSerializer, AIProductDraftSerializer,
)


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

        system_message = {
            'role': 'system',
            'content': (
                "Tu es l'assistant IA du dashboard vendeur de la boutique " + store.name + ". "
                "N'invente JAMAIS une information (stock, commandes, clients, finances...) — utilise "
                "UNIQUEMENT les outils disponibles. Si un outil ne renvoie rien ou refuse (permission "
                "manquante), dis-le clairement plutôt que de deviner ou de répéter une ancienne réponse "
                "de la conversation. Réponses courtes (2-4 phrases maximum), directes, sans blabla. "
                "Si tu proposes une modification (produit, stock, prix, statut de commande), appelle "
                "l'outil de proposition correspondant UNE SEULE FOIS et arrête-toi — ne suppose jamais "
                "que la proposition a été acceptée, et n'enchaîne jamais une deuxième proposition dans "
                "la même réponse."
            ),
        }
        history = [system_message] + [
            {'role': m.role, 'content': m.content}
            for m in conv.messages.order_by('created_at') if m.role != 'tool'
        ]

        tool_definitions = list(ai_tools.TOOL_DEFINITIONS)
        write_tool_names = set()
        if is_owner_or_admin(request):
            tool_definitions = tool_definitions + ai_write_tools.WRITE_TOOL_DEFINITIONS
            write_tool_names = set(ai_write_tools.WRITE_TOOL_REGISTRY.keys())

        def tool_executor(name, arguments):
            if name in ai_write_tools.WRITE_TOOL_REGISTRY:
                result = ai_write_tools.execute_write_tool(request, conv, name, arguments)
            else:
                result = ai_tools.execute_tool(request, name, arguments)
            AIMessage.objects.create(conversation=conv, role='tool', content=f'{name}: {result}')
            return result

        try:
            final_content, pending_action_id = run_chat_loop(history, tool_definitions, tool_executor, write_tool_names=write_tool_names)
        except OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)

        AIMessage.objects.create(conversation=conv, role='assistant', content=final_content, pending_action_id=pending_action_id)
        conv.save(update_fields=['updated_at'])

        response_data = {'conversation_id': conv.id, 'reply': final_content}
        if pending_action_id:
            action = AIPendingAction.objects.get(pk=pending_action_id)
            response_data['pending_action'] = AIPendingActionSerializer(action).data
        return Response(response_data)


class ScanProductView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = 'ai_scan'

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        image_file = request.FILES.get('image')
        if not image_file:
            return Response({'detail': 'Une image est requise.'}, status=400)

        from core.validators import validate_uploaded_file
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_uploaded_file(image_file)
        except DjangoValidationError as exc:
            return Response({'detail': '; '.join(exc.messages) if hasattr(exc, 'messages') else str(exc)}, status=400)

        try:
            result = vision_client.extract_product_from_image(image_file.read())
        except vision_client.OllamaUnavailableError:
            return Response({'detail': 'Assistant IA indisponible'}, status=503)
        except (ValueError, KeyError, TypeError):
            return Response({'detail': "Photo pas assez nette ou document illisible, réessayez."}, status=502)

        image_file.seek(0)

        if result.get('type') == 'invoice':
            items = result.get('items') or []
            if not items:
                return Response({'detail': "Aucun article détecté sur ce document."}, status=502)
            drafts = [
                AIProductDraft.objects.create(store=store, source='invoice', extracted_data=item)
                for item in items
            ]
            return Response({'type': 'invoice', 'drafts': AIProductDraftSerializer(drafts, many=True).data})

        data = result.get('data') or {}
        if not data.get('name'):
            return Response({'detail': "Aucun produit détecté sur cette photo."}, status=502)
        draft = AIProductDraft.objects.create(store=store, source='photo', source_image=image_file, extracted_data=data)
        return Response({'type': 'product', 'draft': AIProductDraftSerializer(draft).data})


class ProductDraftListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = get_store(request)
        drafts = AIProductDraft.objects.filter(store=store, status='pending_review', source='invoice').order_by('-created_at')
        return Response(AIProductDraftSerializer(drafts, many=True).data)


class ProductDraftCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = get_store(request)
        try:
            draft = AIProductDraft.objects.get(pk=pk, store=store, status='pending_review')
        except AIProductDraft.DoesNotExist:
            return Response({'detail': 'Brouillon introuvable.'}, status=404)

        data = draft.extracted_data
        if not data.get('name') or data.get('price') is None:
            return Response({'detail': 'Nom et prix requis pour créer le produit.'}, status=400)

        from products.serializers import ProductSerializer
        serializer = ProductSerializer(data={
            'name': data['name'], 'price': data['price'], 'description': data.get('description', ''),
        })
        serializer.is_valid(raise_exception=True)
        product = serializer.save(store=store)
        draft.status = 'created'
        draft.created_product = product
        draft.save(update_fields=['status', 'created_product'])
        return Response(ProductSerializer(product).data, status=201)


class ProductDraftDiscardView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = get_store(request)
        try:
            draft = AIProductDraft.objects.get(pk=pk, store=store, status='pending_review')
        except AIProductDraft.DoesNotExist:
            return Response({'detail': 'Brouillon introuvable.'}, status=404)
        draft.status = 'discarded'
        draft.save(update_fields=['status'])
        return Response({'status': 'discarded'})


def _execute_pending_action(store, action):
    """Exécute réellement une AIPendingAction déjà validée (statut/expiration
    vérifiés par l'appelant) — jamais appelée en dehors d'une transaction
    atomique. `payload`/`target_ids` sont ceux figés à la proposition,
    jamais recalculés ici."""
    if action.tool_name in ('propose_update_product', 'propose_bulk_update_products'):
        from products.models import Category
        for item in action.payload:
            product = store.products.get(pk=item['id'])
            after = item['after']
            if 'price' in after:
                product.price = after['price']
            if 'stock' in after:
                product.stock = after['stock']
            if 'is_active' in after:
                product.is_active = after['is_active']
            product.save()
            if 'categories' in after:
                cats = Category.objects.filter(store=store, name__in=after['categories'])
                product.categories.set(cats)

    elif action.tool_name == 'propose_create_product':
        from products.serializers import ProductSerializer
        draft = AIProductDraft.objects.get(pk=action.target_ids[0])
        data = draft.extracted_data
        serializer = ProductSerializer(data={
            'name': data['name'], 'price': data['price'], 'description': data.get('description', ''),
        })
        serializer.is_valid(raise_exception=True)
        product = serializer.save(store=store)
        draft.status = 'created'
        draft.created_product = product
        draft.save(update_fields=['status', 'created_product'])

    elif action.tool_name == 'propose_update_order_status':
        from orders.views import _transition_order_status
        item = action.payload[0]
        order = store.orders.get(pk=item['id'])
        _transition_order_status(store, order, item['after']['status'], changed_by=None, note=item['after'].get('note', "Action confirmée via l'agent IA"))


def _log_ai_agent_action(request, store, action, audit_action):
    try:
        actor_name = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.email
        AuditLog.objects.create(
            store=store, actor=request.user, actor_name=actor_name, actor_role='ai_agent',
            action=audit_action, target_type='ai_pending_action', target_id=action.id,
            target_repr=action.summary, description=action.summary, metadata={'payload': action.payload},
        )
    except Exception:
        pass  # best-effort, même philosophie que audit.utils.log_audit


class PendingActionConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = get_store(request)
        try:
            action = AIPendingAction.objects.select_related('conversation').get(pk=pk, conversation__store=store)
        except AIPendingAction.DoesNotExist:
            return Response({'detail': 'Action introuvable.'}, status=404)
        if action.status != 'pending':
            return Response({'detail': f"Cette action a déjà été résolue ({action.status})."}, status=409)
        if action.is_expired():
            action.status = 'expired'
            action.resolved_at = timezone.now()
            action.save(update_fields=['status', 'resolved_at'])
            return Response({'detail': "Cette proposition a expiré, redemandez à l'assistant."}, status=409)

        with transaction.atomic():
            _execute_pending_action(store, action)
            action.status = 'confirmed'
            action.resolved_at = timezone.now()
            action.save(update_fields=['status', 'resolved_at'])

        _log_ai_agent_action(request, store, action, 'ai_agent.action_confirmed')
        return Response({'status': 'confirmed'})


class PendingActionRejectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = get_store(request)
        try:
            action = AIPendingAction.objects.select_related('conversation').get(pk=pk, conversation__store=store)
        except AIPendingAction.DoesNotExist:
            return Response({'detail': 'Action introuvable.'}, status=404)
        if action.status != 'pending':
            return Response({'detail': f"Cette action a déjà été résolue ({action.status})."}, status=409)

        action.status = 'rejected'
        action.resolved_at = timezone.now()
        action.save(update_fields=['status', 'resolved_at'])
        _log_ai_agent_action(request, store, action, 'ai_agent.action_rejected')
        return Response({'status': 'rejected'})
