from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from core.permissions import is_owner_or_admin, has_permission
from core.pagination import parse_pagination
from core.validators import validate_uploaded_file
from .models import Conversation, Message, CONVERSATION_STATUS_CHOICES
from .serializers import ConversationSerializer, ConversationDetailSerializer, MessageSerializer
from .assignment import assign_conversation_round_robin
from audit.utils import log_audit


def _get_store(request):
    try:
        return request.user.store
    except Exception:
        pass
    try:
        return request.user.team_membership.store
    except Exception:
        return None


def _can_view_inbox(request):
    return is_owner_or_admin(request) or has_permission(request, 'inbox_view')


def _validate_attachment(attachment):
    if not attachment:
        return None
    try:
        validate_uploaded_file(attachment)
    except DjangoValidationError as e:
        return Response({'detail': e.messages[0] if e.messages else 'Fichier invalide.'}, status=400)
    return None


class ConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store or not _can_view_inbox(request):
            return Response({'detail': 'Accès refusé.'}, status=403)

        qs = store.conversations.select_related('order', 'assigned_to').all()

        channel = request.query_params.get('channel')
        if channel:
            qs = qs.filter(channel=channel)

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        if request.query_params.get('unread') == '1':
            qs = qs.filter(unread_count__gt=0)

        assigned = request.query_params.get('assigned')
        if assigned:
            qs = qs.filter(assigned_to_id=assigned)

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(customer_phone__icontains=search) |
                Q(customer_name__icontains=search) |
                Q(subject__icontains=search) |
                Q(order__phone__icontains=search)
            )

        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  ConversationSerializer(qs, many=True, context={'request': request}).data,
        })


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store or not _can_view_inbox(request):
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.conversations.select_related('order', 'assigned_to').prefetch_related('messages__author').get(pk=pk), None
        except Conversation.DoesNotExist:
            return None, Response({'detail': 'Conversation introuvable.'}, status=404)

    def get(self, request, pk):
        conv, err = self._get(request, pk)
        if err: return err
        if conv.unread_count:
            conv.unread_count = 0
            conv.save(update_fields=['unread_count'])
        return Response(ConversationDetailSerializer(conv, context={'request': request}).data)


class ConversationAssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Réassignation réservée au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            conv = store.conversations.get(pk=pk)
        except Conversation.DoesNotExist:
            return Response({'detail': 'Conversation introuvable.'}, status=404)

        confirmateur_id = request.data.get('confirmateur')
        if not confirmateur_id:
            return Response({'detail': 'confirmateur requis.'}, status=400)
        try:
            confirmateur = store.team_members.get(pk=confirmateur_id, role='confirmateur', is_active=True)
        except Exception:
            return Response({'detail': 'Confirmateur invalide.'}, status=400)

        conv.assigned_to = confirmateur
        conv.assigned_at = timezone.now()
        conv.assigned_by = request.user
        conv.save(update_fields=['assigned_to', 'assigned_at', 'assigned_by'])
        log_audit(request, 'conversation.assigned', target=conv, description=f"Conversation réassignée à {confirmateur.first_name} {confirmateur.last_name}")
        return Response(ConversationSerializer(conv, context={'request': request}).data)


class ConversationStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store or not _can_view_inbox(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            conv = store.conversations.get(pk=pk)
        except Conversation.DoesNotExist:
            return Response({'detail': 'Conversation introuvable.'}, status=404)

        new_status = request.data.get('status')
        valid = [s[0] for s in CONVERSATION_STATUS_CHOICES]
        if new_status not in valid:
            return Response({'detail': f'Statut invalide. Valeurs : {valid}'}, status=400)

        attachment = request.FILES.get('attachment')
        err = _validate_attachment(attachment)
        if err: return err

        conv.status = new_status
        conv.save(update_fields=['status', 'updated_at'])
        Message.objects.create(
            conversation=conv, direction='outbound', status_change=new_status,
            body=request.data.get('note', ''), author=request.user, attachment=attachment,
        )
        conv.last_message_at = timezone.now()
        conv.save(update_fields=['last_message_at'])
        note = request.data.get('note', '')
        log_audit(
            request, 'conversation.status_changed', target=conv,
            description=f"Statut conversation changé à « {new_status} »" + (f" — note : {note}" if note else ""),
            metadata={'status': new_status, 'note': note},
        )
        return Response(ConversationDetailSerializer(conv, context={'request': request}).data)


class ConversationMessageCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store or not _can_view_inbox(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            conv = store.conversations.get(pk=pk)
        except Conversation.DoesNotExist:
            return Response({'detail': 'Conversation introuvable.'}, status=404)

        body = request.data.get('message', '').strip()
        attachment = request.FILES.get('attachment')
        if not body and not attachment:
            return Response({'detail': 'Message vide.'}, status=400)

        err = _validate_attachment(attachment)
        if err: return err

        Message.objects.create(conversation=conv, direction='outbound', body=body, author=request.user, attachment=attachment)
        conv.last_message_at = timezone.now()
        conv.save(update_fields=['last_message_at'])
        log_audit(request, 'conversation.message_sent', target=conv, description=f"Message envoyé — {body[:120]}" if body else "Message envoyé (pièce jointe)")
        return Response(ConversationDetailSerializer(conv, context={'request': request}).data, status=status.HTTP_201_CREATED)


class UnreadCountView(APIView):
    """Alimente la pastille de la cloche/sidebar — sondage 30s existant côté
    frontend (DashboardLayout.jsx), étendu plutôt que dupliqué."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store or not _can_view_inbox(request):
            return Response({'count': 0})
        count = store.conversations.filter(unread_count__gt=0).count()
        return Response({'count': count})


def _get_public_store(slug):
    from stores.models import Store
    try:
        return Store.objects.get(slug=slug, is_active=True)
    except Store.DoesNotExist:
        return None


class PublicComplaintCreateView(APIView):
    """Remplace orders.views.PublicComplaintCreateView (fusion 2026-08) — même
    contrat anti-énumération : le client ne fournit que son téléphone (+
    éventuellement le numéro de commande), jamais de liste de commandes
    renvoyée, pour éviter qu'un tiers ne devine un téléphone et consulte les
    commandes/montants de quelqu'un d'autre."""
    permission_classes = [AllowAny]
    throttle_scope = 'complaint'

    @transaction.atomic
    def post(self, request):
        store_slug = request.data.get('store_slug')
        if not store_slug:
            return Response({'detail': 'store_slug requis.'}, status=400)
        store = _get_public_store(store_slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        order_id    = request.data.get('order_id')
        phone       = (request.data.get('phone') or '').strip()
        subject     = (request.data.get('subject') or '').strip()
        description = (request.data.get('description') or '').strip()

        if not phone or not subject or not description:
            return Response({'detail': 'Tous les champs sont requis.'}, status=400)

        if order_id:
            order = store.orders.filter(pk=order_id, phone=phone).first()
        else:
            order = store.orders.filter(phone=phone).order_by('-created_at').first()

        if not order:
            return Response({'detail': 'Aucune commande trouvée avec ce numéro de téléphone.'}, status=404)

        attachment = request.FILES.get('attachment')
        err = _validate_attachment(attachment)
        if err: return err

        conv = Conversation.objects.create(
            store=store, channel='complaint', order=order, subject=subject, status='open',
            customer_name=f"{order.first_name} {order.last_name}".strip(), customer_phone=phone,
        )
        Message.objects.create(conversation=conv, direction='inbound', body=description, status_change='open', attachment=attachment)
        conv.last_message_at = timezone.now()
        conv.last_customer_message_at = timezone.now()
        conv.unread_count = 1
        conv.save(update_fields=['last_message_at', 'last_customer_message_at', 'unread_count'])

        assign_conversation_round_robin(conv)

        try:
            from notifications.service import notify
            notify(store, 'complaint', f"Nouvelle réclamation — {subject}",
                   body=description[:200], link=f"/dashboard/boite-reception/{conv.id}",
                   level='warning', permission='inbox_view')
        except Exception:
            pass

        return Response(ConversationSerializer(conv, context={'request': request}).data, status=status.HTTP_201_CREATED)
