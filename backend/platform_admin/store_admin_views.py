"""Gestion avancée d'une boutique (admin plateforme — phase 7) : modification, transfert de
propriété, export RGPD et anonymisation du vendeur. **Superadmin uniquement** : ce sont des
actions sensibles ou irréversibles, toutes journalisées."""
import json
import re

from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import FailedLoginAttempt, LoginHistory, User
from audit.models import AuditLog
from stores.models import Store, SubscriptionPayment

from .account_views import MAX_REASON, MIN_REASON, _revoke_tokens, _store_users, log_platform_audit
from .communication_models import ContactMessage
from .permissions import is_platform_superadmin

ANONYMIZE_KEYWORD = 'ANONYMISER'
ANON_DOMAIN = 'anonymise.invalid'
EDITABLE = {'name': 100, 'phone': 20, 'description': 2000}


def _forbidden():
    return Response({'detail': 'Accès réservé au superadmin.'}, status=403)


def _get(store_id):
    return Store.objects.select_related('owner', 'quota', 'quota__plan').filter(pk=store_id).first()


def _reason(request):
    reason = (request.data.get('reason') or '').strip()
    if not (MIN_REASON <= len(reason) <= MAX_REASON):
        return None, Response({'detail': f'Le motif est obligatoire ({MIN_REASON} à {MAX_REASON} caractères).'}, status=400)
    return reason, None


def _is_anonymized(store):
    return store.owner.email.endswith('@' + ANON_DOMAIN)


class StoreEditView(APIView):
    """Corrige le nom, le slug (⚠️ change l'URL publique), le téléphone, l'email ou la description."""
    permission_classes = [IsAuthenticated]

    def put(self, request, store_id):
        if not is_platform_superadmin(request):
            return _forbidden()
        store = _get(store_id)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        if _is_anonymized(store):
            return Response({'detail': 'Cette boutique est anonymisée.'}, status=400)
        data, errors = {}, []
        for field, limit in EDITABLE.items():
            if field in request.data:
                value = str(request.data[field] or '').strip()
                if len(value) > limit or (field == 'name' and not value):
                    errors.append(f'{field} invalide.')
                data[field] = value
        if 'email' in request.data:
            email = str(request.data['email'] or '').strip().lower()
            if email and not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
                errors.append('email invalide.')
            data['email'] = email
        if 'slug' in request.data:
            slug = slugify(str(request.data['slug'] or ''))[:80]
            if not slug:
                errors.append('slug invalide.')
            elif Store.objects.filter(slug=slug).exclude(pk=store.pk).exists():
                return Response({'detail': 'Ce slug est déjà utilisé par une autre boutique.'}, status=409)
            data['slug'] = slug
        if errors:
            return Response({'detail': ' '.join(errors)}, status=400)
        changes = {k: {'before': str(getattr(store, k)) if k != 'description' else '…', 'after': str(v) if k != 'description' else '…'}
                   for k, v in data.items() if getattr(store, k) != v}
        for k, v in data.items():
            setattr(store, k, v)
        store.save()
        if changes:
            log_platform_audit(request, 'platform.store_edited', store=store, target=store, description='Boutique modifiée',
                               metadata={'changes': changes})
        return Response({'id': store.id, 'name': store.name, 'slug': store.slug, 'phone': store.phone, 'email': store.email,
                         'description': store.description})


class StoreTransferView(APIView):
    """Transfère la propriété à un utilisateur EXISTANT, sans boutique ni équipe, qui n'est pas
    un compte d'administration. L'ancien propriétaire garde son compte (sans boutique)."""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, store_id):
        if not is_platform_superadmin(request):
            return _forbidden()
        reason, err = _reason(request)
        if err:
            return err
        store = _get(store_id)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        if _is_anonymized(store):
            return Response({'detail': 'Cette boutique est anonymisée.'}, status=400)
        email = (request.data.get('new_owner_email') or '').strip().lower()
        new_owner = User.objects.filter(email__iexact=email).first()
        if not new_owner:
            return Response({'detail': 'Aucun compte avec cet email.'}, status=404)
        if new_owner.pk == store.owner_id:
            return Response({'detail': 'Ce compte est déjà le propriétaire.'}, status=400)
        if not new_owner.is_active or new_owner.is_platform_admin or new_owner.is_platform_superadmin or new_owner.is_service_admin:
            return Response({'detail': 'Ce compte ne peut pas devenir propriétaire (inactif ou compte d\'administration).'}, status=400)
        if Store.objects.filter(owner=new_owner).exists() or hasattr(new_owner, 'team_membership'):
            return Response({'detail': 'Ce compte possède déjà une boutique ou fait partie d\'une équipe.'}, status=400)
        old_owner = store.owner
        store.owner = new_owner
        store.save(update_fields=['owner'])
        revoked = _revoke_tokens([old_owner])
        log_platform_audit(request, 'platform.store_transferred', store=store, target=store,
                           description=f'Propriété transférée — {reason}',
                           metadata={'reason': reason, 'from_user_id': old_owner.id, 'to_user_id': new_owner.id, 'revoked_sessions': revoked})
        return Response({'detail': 'Propriété transférée.', 'owner_email': new_owner.email})


class StoreExportView(APIView):
    """Export RGPD des données du vendeur et de sa boutique (JSON). Les données des
    CLIENTS FINAUX de la boutique (commandes) n'en font pas partie : le vendeur en est le
    responsable de traitement."""
    permission_classes = [IsAuthenticated]

    def get(self, request, store_id):
        if not is_platform_superadmin(request):
            return _forbidden()
        store = _get(store_id)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        owner = store.owner
        quota = getattr(store, 'quota', None)
        payload = {
            'exported_at': timezone.now().isoformat(),
            'owner': {k: getattr(owner, k) for k in ('email', 'first_name', 'last_name', 'phone', 'is_email_verified')}
                     | {'date_joined': owner.date_joined.isoformat(), 'last_login': owner.last_login.isoformat() if owner.last_login else None},
            'store': {k: getattr(store, k) for k in ('name', 'slug', 'description', 'phone', 'email', 'currency', 'is_active', 'suspension_reason')}
                     | {'created_at': store.created_at.isoformat()},
            'subscription': {'plan': quota.plan.name if quota and quota.plan_id else None, 'orders_used': quota.orders_used if quota else None,
                             'trial_ends_at': quota.trial_ends_at.isoformat() if quota else None,
                             'period_end': quota.period_end.isoformat() if quota and quota.period_end else None},
            'team_members': [{'first_name': m.first_name, 'last_name': m.last_name, 'email': m.email, 'phone': m.phone, 'role': m.role, 'is_active': m.is_active}
                             for m in store.team_members.all()],
            'subscription_payments': [{'date': p.created_at.isoformat(), 'amount': str(p.amount), 'plan': p.plan.name, 'status': p.status, 'transaction_id': p.transaction_id}
                                      for p in SubscriptionPayment.objects.filter(store=store).select_related('plan')],
            'login_history': [{'date': h.created_at.isoformat(), 'status': h.status, 'ip_address': h.ip_address, 'user_agent': h.user_agent}
                              for h in LoginHistory.objects.filter(user=owner)[:200]],
            'contact_messages': [{'date': m.created_at.isoformat(), 'subject': m.subject, 'body': m.body} for m in ContactMessage.objects.filter(store=store)],
        }
        log_platform_audit(request, 'platform.data_exported', store=store, target=store, description='Export RGPD des données du vendeur')
        response = HttpResponse(json.dumps(payload, ensure_ascii=False, indent=2), content_type='application/json; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="export-{store.slug}.json"'
        return response


class StoreAnonymizeView(APIView):
    """Anonymise le vendeur, son équipe et sa boutique (Loi 18-07). **Irréversible.**
    Garde-fous : la boutique doit d'abord être SUSPENDUE (état intermédiaire), le mot-clé
    `ANONYMISER` doit être saisi, un motif est obligatoire. L'historique de ventes (commandes,
    produits, paiements) est conservé ; les données personnelles du vendeur et de son équipe
    sont effacées."""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, store_id):
        if not is_platform_superadmin(request):
            return _forbidden()
        if request.data.get('confirm') != ANONYMIZE_KEYWORD:
            return Response({'detail': f'Saisissez « {ANONYMIZE_KEYWORD} » pour confirmer.'}, status=400)
        reason, err = _reason(request)
        if err:
            return err
        store = _get(store_id)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        if _is_anonymized(store):
            return Response({'detail': 'Cette boutique est déjà anonymisée.'}, status=400)
        if store.is_active:
            return Response({'detail': 'Suspendez d\'abord la boutique : l\'anonymisation est irréversible.'}, status=400)
        owner = store.owner
        if owner.is_platform_admin or owner.is_platform_superadmin or owner.is_service_admin:
            return Response({'detail': 'Ce propriétaire a un compte d\'administration : anonymisation refusée.'}, status=400)

        users = list(_store_users(store))
        revoked = _revoke_tokens(users)
        old_emails = [u.email.lower() for u in users]
        for u in users:
            _anonymize_user(u)
        for m in store.team_members.all():
            m.first_name, m.last_name, m.phone = 'Anonyme', '', ''
            m.email = f'anonyme-membre-{m.id}@{ANON_DOMAIN}'
            m.save(update_fields=['first_name', 'last_name', 'phone', 'email'])
        FailedLoginAttempt.objects.filter(email__in=old_emails).delete()
        ContactMessage.objects.filter(store=store).delete()
        AuditLog.objects.filter(actor__in=users).update(actor_name='Anonyme')

        store.name = f'Boutique anonymisée {store.id}'
        store.slug = f'anonymise-{store.id}'
        store.phone = store.email = store.description = ''
        store.logo = None
        for field in ('facebook_url', 'instagram_url', 'twitter_url', 'tiktok_url'):
            setattr(store, field, '')
        store.suspension_reason = 'Compte anonymisé (RGPD)'
        store.save()
        log_platform_audit(request, 'platform.store_anonymized', store=store, target=store,
                           description=f'Vendeur et équipe anonymisés — {reason}',
                           metadata={'reason': reason, 'users_anonymized': len(users), 'revoked_sessions': revoked})
        return Response({'detail': 'Données anonymisées.', 'users_anonymized': len(users)})


def _anonymize_user(u):
    u.first_name, u.last_name, u.phone, u.google_id = 'Anonyme', '', '', ''
    u.email = f'anonyme-{u.id}@{ANON_DOMAIN}'
    u.avatar = None
    u.is_active = False
    u.is_email_verified = False
    u.set_unusable_password()
    u.save()
    LoginHistory.objects.filter(user=u).delete()
