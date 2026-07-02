import json
from datetime import date, timedelta
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q, Count, Case, When, IntegerField
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from .models import Order, OrderItem, OrderStatusHistory, STATUS_CHOICES, OrderAssignment, FailureReason, CallAttempt, CALL_STATUS_CHOICES, PaymentWebhookLog
from .serializers import OrderSerializer, OrderDetailSerializer, OrderAssignmentSerializer, FailureReasonSerializer, CallAttemptSerializer
from .utils import assign_order_round_robin
from . import chargily
from core.permissions import IsOwnerOrAdminForWrites, is_owner_or_admin


def _get_store(request):
    try:
        return request.user.store
    except Exception:
        pass
    try:
        return request.user.team_membership.store
    except Exception:
        return None


class OrderListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        qs = store.orders.prefetch_related('items').all()

        # Confirmateur : seulement ses commandes assignées
        try:
            membership = request.user.team_membership
            if membership.role == 'confirmateur':
                qs = qs.filter(assignment__confirmateur=membership)
        except Exception:
            pass

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(phone__icontains=search)
            )

        page     = max(1, int(request.query_params.get('page', 1)))
        per_page = int(request.query_params.get('per_page', 10))
        total    = qs.count()
        qs       = qs[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  OrderSerializer(qs, many=True).data,
        })

    @transaction.atomic
    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Création réservée au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        try:
            quota = store.quota
            if quota.orders_used >= quota.orders_limit:
                return Response({'detail': 'Quota de commandes atteint.'}, status=403)
        except Exception:
            quota = None

        items_data = request.data.get('items', [])
        if not items_data:
            return Response({'detail': 'La commande doit contenir au moins un article.'}, status=400)

        order = Order.objects.create(
            store         = store,
            first_name    = request.data.get('first_name', ''),
            last_name     = request.data.get('last_name', ''),
            phone         = request.data.get('phone', ''),
            wilaya        = request.data.get('wilaya', ''),
            commune       = request.data.get('commune', ''),
            address       = request.data.get('address', ''),
            shipping_cost = request.data.get('shipping_cost', 0),
            delivery_type = request.data.get('delivery_type', ''),
            note          = request.data.get('note', ''),
        )

        for item in items_data:
            OrderItem.objects.create(
                order             = order,
                product_id        = item.get('product'),
                variant_option_id = item.get('variant_option'),
                product_name      = item.get('product_name', ''),
                price             = item.get('price', 0),
                quantity          = item.get('quantity', 1),
            )

        order.recalculate()
        OrderStatusHistory.objects.create(order=order, status='pending', changed_by=request.user)
        assign_order_round_robin(order)

        if quota:
            quota.orders_used += 1
            quota.save(update_fields=['orders_used'])

        return Response(OrderDetailSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.orders.prefetch_related('items', 'history__changed_by').get(pk=pk), None
        except Order.DoesNotExist:
            return None, Response({'detail': 'Commande introuvable.'}, status=404)

    def get(self, request, pk):
        order, err = self._get(request, pk)
        if err: return err
        return Response(OrderDetailSerializer(order).data)

    def put(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Modification réservée au propriétaire ou administrateur.'}, status=403)
        order, err = self._get(request, pk)
        if err: return err
        allowed = ['first_name', 'last_name', 'phone', 'wilaya', 'commune',
                   'address', 'shipping_cost', 'delivery_type', 'note']
        for field in allowed:
            if field in request.data:
                setattr(order, field, request.data[field])
        order.save()
        order.recalculate()
        return Response(OrderDetailSerializer(order).data)

    def delete(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Suppression réservée au propriétaire ou administrateur.'}, status=403)
        order, err = self._get(request, pk)
        if err: return err
        order.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrderStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            order = store.orders.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=404)

        new_status = request.data.get('status')
        valid = [s[0] for s in STATUS_CHOICES]
        if new_status not in valid:
            return Response({'detail': f'Statut invalide. Valeurs : {valid}'}, status=400)

        order.status = new_status
        order.save(update_fields=['status'])
        OrderStatusHistory.objects.create(
            order      = order,
            status     = new_status,
            changed_by = request.user,
            note       = request.data.get('note', ''),
        )
        return Response(OrderDetailSerializer(order).data)


class OrderStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        result = {'total': store.orders.count()}
        for code, label in STATUS_CHOICES:
            result[code] = {'label': label, 'count': store.orders.filter(status=code).count()}
        return Response(result)


class ConfirmationRateView(APIView):
    permission_classes = [IsAuthenticated]

    CONFIRMED_STATUSES = ['confirmed', 'shipped', 'delivered']
    PROCESSED_STATUSES = ['no_answer_1', 'no_answer_2', 'no_answer_3', 'confirmed', 'shipped', 'delivered', 'returned', 'cancelled']

    def get(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        # Calcul de la plage de dates
        period    = request.query_params.get('period', 'week')
        today     = date.today()
        if period == 'day':
            date_from = today
            date_to   = today
        elif period == 'month':
            date_from = today - timedelta(days=30)
            date_to   = today
        elif period == 'custom':
            try:
                date_from = date.fromisoformat(request.query_params.get('date_from', str(today - timedelta(days=7))))
                date_to   = date.fromisoformat(request.query_params.get('date_to', str(today)))
            except ValueError:
                return Response({'detail': 'Format de date invalide (YYYY-MM-DD).'}, status=400)
        else:  # week (default)
            date_from = today - timedelta(days=7)
            date_to   = today

        qs = store.orders.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)

        # Stats globales
        totals = qs.aggregate(
            processed=Count(Case(When(status__in=self.PROCESSED_STATUSES, then=1), output_field=IntegerField())),
            confirmed=Count(Case(When(status__in=self.CONFIRMED_STATUSES, then=1), output_field=IntegerField())),
        )
        processed = totals['processed'] or 0
        confirmed = totals['confirmed'] or 0
        rate = round(confirmed / processed * 100, 1) if processed else 0.0

        # Stats par confirmateur via OrderAssignment
        assignments = (
            store.orders
            .filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
            .filter(assignment__isnull=False)
            .values('assignment__confirmateur__id',
                    'assignment__confirmateur__first_name',
                    'assignment__confirmateur__last_name')
            .annotate(
                processed=Count(Case(When(status__in=self.PROCESSED_STATUSES, then=1), output_field=IntegerField())),
                confirmed=Count(Case(When(status__in=self.CONFIRMED_STATUSES, then=1), output_field=IntegerField())),
            )
        )

        by_confirmateur = []
        for a in assignments:
            conf_processed = a['processed'] or 0
            conf_confirmed = a['confirmed'] or 0
            conf_rate = round(conf_confirmed / conf_processed * 100, 1) if conf_processed else 0.0
            by_confirmateur.append({
                'confirmateur_id':   a['assignment__confirmateur__id'],
                'confirmateur_name': f"{a['assignment__confirmateur__first_name']} {a['assignment__confirmateur__last_name']}".strip(),
                'processed':         conf_processed,
                'confirmed':         conf_confirmed,
                'rate':              conf_rate,
            })

        by_confirmateur.sort(key=lambda x: x['rate'], reverse=True)

        return Response({
            'period':     period,
            'date_from':  str(date_from),
            'date_to':    str(date_to),
            'total_processed': processed,
            'total_confirmed': confirmed,
            'confirmation_rate': rate,
            'by_confirmateur': by_confirmateur,
        })


class PublicOrderView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        from stores.models import Store
        store_slug = request.data.get('store_slug')
        if not store_slug:
            return Response({'detail': 'store_slug requis.'}, status=400)
        try:
            store = Store.objects.get(slug=store_slug, is_active=True)
        except Store.DoesNotExist:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        try:
            quota = store.quota
            if quota.orders_used >= quota.orders_limit:
                return Response({'detail': 'Cette boutique ne peut plus accepter de commandes.'}, status=403)
        except Exception:
            quota = None

        items_data = request.data.get('items', [])
        if not items_data:
            return Response({'detail': 'Panier vide.'}, status=400)

        payment_method = request.data.get('payment_method', 'cod')
        if payment_method not in ('cod', 'chargily'):
            return Response({'detail': 'Mode de paiement invalide.'}, status=400)

        order = Order.objects.create(
            store         = store,
            first_name    = request.data.get('first_name', ''),
            last_name     = request.data.get('last_name', ''),
            phone         = request.data.get('phone', ''),
            wilaya        = request.data.get('wilaya', ''),
            commune       = request.data.get('commune', ''),
            address       = request.data.get('address', ''),
            shipping_cost = request.data.get('shipping_cost', 0),
            payment_method = payment_method,
            note          = request.data.get('note', ''),
        )

        for item in items_data:
            OrderItem.objects.create(
                order             = order,
                product_id        = item.get('product'),
                variant_option_id = item.get('variant_option'),
                product_name      = item.get('product_name', ''),
                price             = item.get('price', 0),
                quantity          = item.get('quantity', 1),
            )

        order.recalculate()
        OrderStatusHistory.objects.create(order=order, status='pending')
        assign_order_round_robin(order)

        payment_url = None
        detail = 'Commande reçue.'

        if payment_method == 'cod':
            if quota:
                quota.orders_used += 1
                quota.save(update_fields=['orders_used'])
        else:
            try:
                checkout_id, payment_link = chargily.create_checkout(order)
                order.chargily_checkout_id  = checkout_id
                order.chargily_payment_link = payment_link
                order.save(update_fields=['chargily_checkout_id', 'chargily_payment_link'])
                payment_url = payment_link
            except chargily.ChargilyError:
                detail = "Commande créée mais le lien de paiement n'a pas pu être généré. Le vendeur vous contactera."

        return Response({'id': order.id, 'detail': detail, 'payment_url': payment_url}, status=status.HTTP_201_CREATED)


class ChargilyWebhookView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw_body = request.body
        signature_header = request.headers.get('Signature', '')
        signature_valid = chargily.verify_webhook_signature(raw_body, signature_header)

        try:
            payload = json.loads(raw_body or b'{}')
        except json.JSONDecodeError:
            payload = {}

        event_type  = payload.get('type', '')
        data        = payload.get('data', {}) or {}
        checkout_id = data.get('id', '')

        order = None
        if checkout_id:
            order = Order.objects.filter(chargily_checkout_id=checkout_id).first()
        if not order:
            order_id = (data.get('metadata') or {}).get('order_id')
            if order_id:
                order = Order.objects.filter(id=order_id).first()

        log = PaymentWebhookLog.objects.create(
            order           = order,
            event_type      = event_type,
            checkout_id     = checkout_id,
            raw_payload     = payload,
            signature_valid = signature_valid,
            status          = 'received',
        )

        try:
            if not order:
                log.status = 'error'
                log.error_message = 'Aucune commande correspondante trouvée.'
                log.save(update_fields=['status', 'error_message'])
                return Response(status=200)

            if event_type == 'checkout.paid':
                order.status = 'confirmed'
                order.save(update_fields=['status'])
                OrderStatusHistory.objects.create(
                    order  = order,
                    status = 'confirmed',
                    note   = 'Paiement confirmé automatiquement via Chargily.',
                )
                try:
                    quota = order.store.quota
                    quota.orders_used += 1
                    quota.save(update_fields=['orders_used'])
                except Exception:
                    pass
                log.status = 'processed'
                log.save(update_fields=['status'])

            elif event_type in ('checkout.failed', 'checkout.expired'):
                OrderStatusHistory.objects.create(
                    order  = order,
                    status = order.status,
                    note   = "Paiement Chargily échoué. Commande non confirmée automatiquement.",
                )
                if order.store.email:
                    send_mail(
                        subject=f"MZSolutions — Paiement échoué pour la commande #{order.id}",
                        message=(
                            f"Le paiement en ligne (Chargily) pour la commande #{order.id} "
                            f"({order.first_name} {order.last_name}) a échoué.\n\n"
                            "La commande n'a pas été confirmée automatiquement. "
                            "Vous pouvez la traiter manuellement depuis votre tableau de bord."
                        ),
                        from_email=None,
                        recipient_list=[order.store.email],
                        fail_silently=True,
                    )
                log.status = 'processed'
                log.save(update_fields=['status'])

            else:
                log.status = 'error'
                log.error_message = f"Type d'événement non géré : {event_type}"
                log.save(update_fields=['status', 'error_message'])

        except Exception as e:
            log.status = 'error'
            log.error_message = str(e)
            log.save(update_fields=['status', 'error_message'])

        return Response(status=200)


# ─── Assignment ───────────────────────────────────────────────────────────────

class OrderAssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def _order(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store, store.orders.get(pk=pk), None
        except Order.DoesNotExist:
            return store, None, Response({'detail': 'Commande introuvable.'}, status=404)

    def get(self, request, pk):
        store, order, err = self._order(request, pk)
        if err: return err
        try:
            return Response(OrderAssignmentSerializer(order.assignment).data)
        except OrderAssignment.DoesNotExist:
            return Response(None)

    def put(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Réassignation réservée au propriétaire ou administrateur.'}, status=403)
        from team.models import TeamMember
        store, order, err = self._order(request, pk)
        if err: return err
        confirmateur_id = request.data.get('confirmateur')
        if not confirmateur_id:
            return Response({'detail': 'confirmateur requis.'}, status=400)
        try:
            confirmateur = store.team_members.get(pk=confirmateur_id, role='confirmateur', is_active=True)
        except Exception:
            return Response({'detail': 'Confirmateur invalide.'}, status=400)
        assignment, _ = OrderAssignment.objects.update_or_create(
            order=order,
            defaults={'confirmateur': confirmateur, 'assigned_by': request.user},
        )
        return Response(OrderAssignmentSerializer(assignment).data)


# ─── Call Attempts ────────────────────────────────────────────────────────────

class CallAttemptListView(APIView):
    permission_classes = [IsAuthenticated]

    def _order(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.orders.get(pk=pk), None
        except Order.DoesNotExist:
            return None, Response({'detail': 'Commande introuvable.'}, status=404)

    def get(self, request, pk):
        order, err = self._order(request, pk)
        if err: return err
        return Response(CallAttemptSerializer(order.call_attempts.all(), many=True).data)

    def post(self, request, pk):
        from team.models import TeamMember
        order, err = self._order(request, pk)
        if err: return err

        call_status = request.data.get('status')
        if call_status not in [s[0] for s in CALL_STATUS_CHOICES]:
            return Response({'detail': 'Statut invalide.'}, status=400)

        # Déterminer l'agent (confirmateur connecté si team_member)
        agent = None
        try:
            agent = request.user.team_membership
        except Exception:
            pass

        attempt = CallAttempt.objects.create(
            order          = order,
            agent          = agent,
            attempt_number = order.call_attempts.count() + 1,
            status         = call_status,
            failure_reason_id = request.data.get('failure_reason'),
            note           = request.data.get('note', ''),
        )
        return Response(CallAttemptSerializer(attempt).data, status=status.HTTP_201_CREATED)


class CallAttemptDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, cid):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            attempt = CallAttempt.objects.get(pk=cid, order__store=store, order_id=pk)
        except CallAttempt.DoesNotExist:
            return Response({'detail': 'Tentative introuvable.'}, status=404)
        attempt.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Failure Reasons ─────────────────────────────────────────────────────────

class FailureReasonListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        qs = store.failure_reasons.all()
        if request.query_params.get('active') == '1':
            qs = qs.filter(is_active=True)
        return Response(FailureReasonSerializer(qs, many=True).data)

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        s = FailureReasonSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save(store=store)
        return Response(s.data, status=status.HTTP_201_CREATED)


class FailureReasonDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.failure_reasons.get(pk=pk), None
        except FailureReason.DoesNotExist:
            return None, Response({'detail': 'Introuvable.'}, status=404)

    def put(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        reason, err = self._get(request, pk)
        if err: return err
        s = FailureReasonSerializer(reason, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def delete(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        reason, err = self._get(request, pk)
        if err: return err
        reason.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
