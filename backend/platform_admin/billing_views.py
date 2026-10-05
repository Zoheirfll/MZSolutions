"""Abonnements & paiements de la plateforme (admin plateforme — phase 3).

Paliers modifiables, historique des paiements SofizPay, export CSV comptable,
remboursement ENREGISTRÉ (le virement de retour se fait chez SofizPay : aucune
API de remboursement) et gestes commerciaux (quota, prolongation d'essai, palier
offert). Lecture au niveau admin ; toute écriture financière est superadmin.
"""
import csv
import io
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import parse_pagination
from stores.models import Store, SubscriptionPayment, SubscriptionPlan

from .account_views import MAX_REASON, MIN_REASON, log_platform_audit
from .permissions import is_platform_admin, is_platform_superadmin

EXPORT_MAX_ROWS = 10_000
UNLIMITED = 10 ** 9  # même convention que le flux de paiement (orders_limit illimité)


def _forbidden(superadmin=False):
    who = 'au superadmin' if superadmin else 'aux administrateurs de la plateforme'
    return Response({'detail': f'Accès réservé {who}.'}, status=403)


def _clean_reason(request):
    reason = (request.data.get('reason') or '').strip()
    if not (MIN_REASON <= len(reason) <= MAX_REASON):
        return None, Response({'detail': f'Le motif est obligatoire ({MIN_REASON} à {MAX_REASON} caractères).'}, status=400)
    return reason, None


# ─── Paliers ───────────────────────────────────────────────────────────────

def _plan_row(plan, subscribers=None):
    return {
        'id': plan.id, 'name': plan.name, 'orders_limit': plan.orders_limit,
        'price_monthly': plan.price_monthly, 'price_yearly': plan.price_yearly,
        'features': plan.features, 'is_active': plan.is_active, 'order': plan.order,
        'ai_daily_limit': plan.ai_daily_limit, 'ai_weekly_limit': plan.ai_weekly_limit,
        'subscribers': subscribers if subscribers is not None else plan.subscribers.count(),
    }


def _validate_plan(data, partial=False):
    """Renvoie (valeurs_validées, erreur). Les prix ne s'appliquent qu'aux NOUVEAUX
    paiements : les paiements passés gardent leur montant."""
    out, errors = {}, []

    if 'name' in data or not partial:
        name = (data.get('name') or '').strip()
        if not (1 <= len(name) <= 50):
            errors.append('Nom requis (50 caractères maximum).')
        out['name'] = name

    if 'orders_limit' in data or not partial:
        raw = data.get('orders_limit')
        if raw in (None, ''):
            out['orders_limit'] = None
        else:
            try:
                value = int(raw)
                if value < 1:
                    raise ValueError
                out['orders_limit'] = value
            except (TypeError, ValueError):
                errors.append('Limite de commandes invalide (entier ≥ 1, ou vide pour illimité).')

    for field, label in (('price_monthly', 'mensuel'), ('price_yearly', 'annuel')):
        if field in data or not partial:
            try:
                value = Decimal(str(data.get(field)))
                if value < 0 or value > Decimal('9999999.99'):
                    raise InvalidOperation
                out[field] = value
            except (InvalidOperation, ValueError, TypeError):
                errors.append(f'Prix {label} invalide.')

    if 'features' in data or not partial:
        features = data.get('features', [])
        if not isinstance(features, list) or len(features) > 10 or any(not isinstance(f, str) or len(f) > 100 for f in features):
            errors.append('Caractéristiques : liste de 10 textes maximum (100 caractères chacun).')
        else:
            out['features'] = [f.strip() for f in features if f.strip()]

    for field, label in (('ai_daily_limit', 'quotidienne'), ('ai_weekly_limit', 'hebdomadaire')):
        if field in data:
            try:
                value = int(data.get(field) or 0)
                if not 0 <= value <= 1_000_000:
                    raise ValueError
                out[field] = value
            except (TypeError, ValueError):
                errors.append(f'Limite IA {label} invalide (0 = illimité).')

    if 'is_active' in data:
        out['is_active'] = bool(data.get('is_active'))

    if 'order' in data:
        try:
            out['order'] = max(0, int(data.get('order')))
        except (TypeError, ValueError):
            errors.append('Ordre invalide.')

    return out, ('; '.join(errors) if errors else None)


class PlatformPlanListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        plans = SubscriptionPlan.objects.annotate(n=Count('subscribers')).order_by('order', 'id')
        return Response({'results': [_plan_row(p, p.n) for p in plans]})

    def post(self, request):
        if not is_platform_superadmin(request):
            return _forbidden(True)
        values, error = _validate_plan(request.data)
        if error:
            return Response({'detail': error}, status=400)
        plan = SubscriptionPlan.objects.create(**values)
        log_platform_audit(request, 'platform.plan_created', target=plan, description=f'Palier « {plan.name} » créé',
                           metadata={'after': {k: str(v) for k, v in values.items()}})
        return Response(_plan_row(plan, 0), status=201)


class PlatformPlanDetailView(APIView):
    """Modification d'un palier (superadmin). Jamais de suppression : on désactive
    (`is_active`), car des boutiques et des paiements y sont rattachés."""
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        if not is_platform_superadmin(request):
            return _forbidden(True)
        plan = SubscriptionPlan.objects.filter(pk=pk).first()
        if not plan:
            return Response({'detail': 'Palier introuvable.'}, status=404)
        values, error = _validate_plan(request.data, partial=True)
        if error:
            return Response({'detail': error}, status=400)
        before = {k: str(getattr(plan, k)) for k in values}
        for k, v in values.items():
            setattr(plan, k, v)
        plan.save()
        changed = {k: {'before': before[k], 'after': str(v)} for k, v in values.items() if before[k] != str(v)}
        log_platform_audit(request, 'platform.plan_updated', target=plan, description=f'Palier « {plan.name} » modifié',
                           metadata={'changes': changed})
        return Response(_plan_row(plan))


# ─── Paiements ─────────────────────────────────────────────────────────────

def _payments_qs(request):
    qs = SubscriptionPayment.objects.select_related('store', 'store__owner', 'plan').order_by('-created_at', '-id')
    params = request.query_params
    if params.get('status') in dict(SubscriptionPayment.STATUS_CHOICES):
        qs = qs.filter(status=params['status'])
    if params.get('store'):
        qs = qs.filter(store_id=params['store'])
    search = params.get('search', '').strip()
    if search:
        qs = qs.filter(Q(store__name__icontains=search) | Q(store__owner__email__icontains=search) | Q(transaction_id__icontains=search))
    if params.get('date_from'):
        qs = qs.filter(created_at__date__gte=params['date_from'])
    if params.get('date_to'):
        qs = qs.filter(created_at__date__lte=params['date_to'])
    return qs


def _payment_row(p):
    return {
        'id': p.id, 'store_id': p.store_id, 'store_name': p.store.name, 'owner_email': p.store.owner.email,
        'plan': p.plan.name, 'billing_cycle': p.billing_cycle, 'amount': p.amount, 'status': p.status,
        'transaction_id': p.transaction_id, 'created_at': p.created_at,
        'refunded_at': p.refunded_at, 'refund_reason': p.refund_reason,
    }


class PlatformPaymentListView(APIView):
    """Historique des paiements d'abonnement (`?status=&store=&search=&date_from=&date_to=&page=`)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        qs = _payments_qs(request)
        summary = {
            'collected': qs.filter(status='success').aggregate(s=Sum('amount'))['s'] or 0,
            'refunded': qs.filter(status='refunded').aggregate(s=Sum('amount'))['s'] or 0,
            'success_count': qs.filter(status='success').count(),
        }
        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        rows = [_payment_row(p) for p in qs[(page - 1) * per_page: page * per_page]]
        return Response({'count': total, 'page': page, 'per_page': per_page, 'summary': summary, 'results': rows})


def _csv_cell(value):
    """Neutralise l'injection de formule (Excel) : un champ saisi par un utilisateur
    (nom de boutique) commençant par = + - @ est préfixé d'une apostrophe."""
    text = '' if value is None else str(value)
    return "'" + text if text[:1] in ('=', '+', '-', '@') else text


class PlatformPaymentExportView(APIView):
    """Export CSV comptable (`;` + BOM UTF-8 pour Excel FR), mêmes filtres que la
    liste, plafonné à 10 000 lignes. Superadmin : donnée financière."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_superadmin(request):
            return _forbidden(True)
        qs = _payments_qs(request)[:EXPORT_MAX_ROWS]
        buffer = io.StringIO()
        writer = csv.writer(buffer, delimiter=';')
        writer.writerow(['Date', 'Boutique', 'Email propriétaire', 'Palier', 'Cycle', 'Montant (DA)', 'Statut', 'Transaction', 'Remboursé le', 'Motif de remboursement'])
        count = 0
        for p in qs:
            writer.writerow([_csv_cell(v) for v in (
                p.created_at.strftime('%Y-%m-%d %H:%M'), p.store.name, p.store.owner.email, p.plan.name, p.billing_cycle,
                p.amount, p.status, p.transaction_id, p.refunded_at.strftime('%Y-%m-%d') if p.refunded_at else '', p.refund_reason)])
            count += 1
        log_platform_audit(request, 'platform.payments_exported', description=f'Export CSV des paiements ({count} lignes)', metadata={'rows': count})
        response = HttpResponse('﻿' + buffer.getvalue(), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="paiements.csv"'
        return response


class PlatformPaymentRefundView(APIView):
    """Enregistre le remboursement d'un paiement confirmé. N'appelle AUCUNE API de
    remboursement : le virement de retour se fait chez SofizPay. `revoke_access`
    retire le palier accordé par ce paiement (idempotent : un paiement déjà
    remboursé est refusé, jamais de double retrait)."""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        if not is_platform_superadmin(request):
            return _forbidden(True)
        reason, err = _clean_reason(request)
        if err:
            return err
        # of=('self',) : verrouille uniquement la ligne du paiement (PostgreSQL refuse
        # FOR UPDATE sur le côté nullable d'une jointure, ici store__quota).
        payment = (SubscriptionPayment.objects.select_for_update(of=('self',))
                   .select_related('store', 'store__quota', 'plan').filter(pk=pk).first())
        if not payment:
            return Response({'detail': 'Paiement introuvable.'}, status=404)
        if payment.status != 'success':
            return Response({'detail': 'Seul un paiement confirmé peut être remboursé.'}, status=400)
        payment.status = 'refunded'
        payment.refunded_at = timezone.now()
        payment.refund_reason = reason
        payment.save(update_fields=['status', 'refunded_at', 'refund_reason'])

        revoked = False
        if request.data.get('revoke_access'):
            quota = payment.store.quota
            if quota.plan_id == payment.plan_id:
                quota.plan = None
                quota.billing_cycle = ''
                quota.period_end = None
                quota.save(update_fields=['plan', 'billing_cycle', 'period_end'])
                revoked = True
        log_platform_audit(request, 'platform.payment_refunded', store=payment.store, target=payment,
                           description=f'Paiement de {payment.amount} DA remboursé — {reason}',
                           metadata={'reason': reason, 'revoked_access': revoked, 'amount': str(payment.amount)})
        return Response({**_payment_row(payment), 'revoked_access': revoked})


# ─── Gestes commerciaux ────────────────────────────────────────────────────

class PlatformAccountGrantView(APIView):
    """Ajoute du quota / prolonge l'essai / offre un palier (superadmin, motif obligatoire).
    `action` : add_orders (value = commandes), extend_trial (value = jours),
    grant_plan (plan_id + value = mois)."""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, store_id):
        if not is_platform_superadmin(request):
            return _forbidden(True)
        reason, err = _clean_reason(request)
        if err:
            return err
        store = Store.objects.select_related('quota', 'quota__plan').filter(pk=store_id).first()
        if not store or not hasattr(store, 'quota'):
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        quota = store.quota
        action = request.data.get('action')
        try:
            value = int(request.data.get('value'))
        except (TypeError, ValueError):
            return Response({'detail': 'Valeur invalide.'}, status=400)
        before = {'orders_limit': quota.orders_limit, 'trial_ends_at': str(quota.trial_ends_at), 'plan': quota.plan.name if quota.plan_id else None,
                  'period_end': str(quota.period_end) if quota.period_end else None}
        now = timezone.now()

        if action == 'add_orders':
            if not 1 <= value <= 100_000:
                return Response({'detail': 'Entre 1 et 100 000 commandes.'}, status=400)
            quota.orders_limit = min(quota.orders_limit + value, UNLIMITED)
            quota.save(update_fields=['orders_limit'])
        elif action == 'extend_trial':
            if not 1 <= value <= 365:
                return Response({'detail': 'Entre 1 et 365 jours.'}, status=400)
            quota.trial_ends_at = max(now, quota.trial_ends_at) + timedelta(days=value)
            quota.save(update_fields=['trial_ends_at'])
        elif action == 'grant_plan':
            plan = SubscriptionPlan.objects.filter(pk=request.data.get('plan_id')).first()
            if not plan:
                return Response({'detail': 'Palier introuvable.'}, status=404)
            if not 1 <= value <= 24:
                return Response({'detail': 'Entre 1 et 24 mois.'}, status=400)
            base = max(now, quota.period_end) if quota.period_end else now
            days = 365 if value == 12 else 30 * value
            quota.plan = plan
            quota.billing_cycle = 'yearly' if value == 12 else 'monthly'
            quota.orders_limit = plan.orders_limit if plan.orders_limit is not None else UNLIMITED
            quota.orders_used = 0
            quota.period_end = base + timedelta(days=days)
            quota.save(update_fields=['plan', 'billing_cycle', 'orders_limit', 'orders_used', 'period_end'])
        else:
            return Response({'detail': 'Action inconnue (add_orders, extend_trial ou grant_plan).'}, status=400)

        after = {'orders_limit': quota.orders_limit, 'trial_ends_at': str(quota.trial_ends_at), 'plan': quota.plan.name if quota.plan_id else None,
                 'period_end': str(quota.period_end) if quota.period_end else None}
        log_platform_audit(request, 'platform.quota_granted', store=store, target=store,
                           description=f'Geste commercial ({action}) — {reason}',
                           metadata={'action': action, 'value': value, 'reason': reason, 'before': before, 'after': after})
        return Response({'before': before, 'after': after})
