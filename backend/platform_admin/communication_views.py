"""Communication, messages de contact et intégrations (admin plateforme — phase 5)."""
from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import parse_pagination
from core.permissions import get_store, is_owner_or_admin
from stores.models import Store

from .account_views import _filter_state, log_platform_audit, store_state
from .communication_models import ContactMessage, PlatformAnnouncement
from .permissions import is_platform_admin, is_platform_superadmin

EMAIL_MAX_RECIPIENTS = 2000  # plafond d'envoi d'un email groupé
TITLE_MAX, BODY_MAX, SUBJECT_MAX, MESSAGE_MAX = 120, 1000, 120, 2000
AUDIENCES = dict(PlatformAnnouncement.AUDIENCE_CHOICES)


def _forbidden(superadmin=False):
    who = 'au superadmin' if superadmin else 'aux administrateurs de la plateforme'
    return Response({'detail': f'Accès réservé {who}.'}, status=403)


# ─── Annonces ──────────────────────────────────────────────────────────────

def _audience_stores(audience):
    """Boutiques actives ciblées (une boutique suspendue ne reçoit jamais rien)."""
    qs = Store.objects.filter(is_active=True).select_related('owner', 'quota')
    if audience == 'all':
        return qs
    return _filter_state(qs, audience, timezone.now())


def _announcement_row(a):
    return {'id': a.id, 'title': a.title, 'body': a.body, 'audience': a.audience, 'level': a.level, 'is_active': a.is_active,
            'ends_at': a.ends_at, 'emailed_count': a.emailed_count, 'created_at': a.created_at}


def _clean_announcement(data, partial=False):
    out, errors = {}, []
    if 'title' in data or not partial:
        title = (data.get('title') or '').strip()
        if not (1 <= len(title) <= TITLE_MAX):
            errors.append(f'Titre requis ({TITLE_MAX} caractères maximum).')
        out['title'] = title
    if 'body' in data or not partial:
        body = (data.get('body') or '').strip()
        if not (1 <= len(body) <= BODY_MAX):
            errors.append(f'Message requis ({BODY_MAX} caractères maximum).')
        out['body'] = body
    if 'audience' in data or not partial:
        if data.get('audience', 'all') not in AUDIENCES:
            errors.append('Audience invalide.')
        else:
            out['audience'] = data.get('audience', 'all')
    if 'level' in data or not partial:
        if data.get('level', 'info') not in dict(PlatformAnnouncement.LEVEL_CHOICES):
            errors.append('Niveau invalide.')
        else:
            out['level'] = data.get('level', 'info')
    if 'is_active' in data:
        out['is_active'] = bool(data['is_active'])
    return out, ('; '.join(errors) if errors else None)


class PlatformAnnouncementListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        return Response({'results': [_announcement_row(a) for a in PlatformAnnouncement.objects.all()[:100]]})

    def post(self, request):
        """Crée l'annonce. Avec `send_email`, envoie aussi un email aux propriétaires ciblés
        — **après confirmation du nombre exact de destinataires** (`confirm_count`, 409 si
        le public a changé entre l'aperçu et l'envoi), plafonné à 2000."""
        if not is_platform_superadmin(request):
            return _forbidden(True)
        values, error = _clean_announcement(request.data)
        if error:
            return Response({'detail': error}, status=400)

        recipients = []
        if request.data.get('send_email'):
            recipients = [s.owner.email for s in _audience_stores(values['audience']) if s.owner.email]
            if len(recipients) > EMAIL_MAX_RECIPIENTS:
                return Response({'detail': f'Trop de destinataires ({len(recipients)} > {EMAIL_MAX_RECIPIENTS}).'}, status=400)
            if request.data.get('confirm_count') != len(recipients):
                return Response({'detail': 'Le nombre de destinataires a changé.', 'count': len(recipients)}, status=409)

        announcement = PlatformAnnouncement.objects.create(created_by=request.user, **values)
        sent = 0
        for email in recipients:
            try:
                send_mail(subject=f'MZSolutions — {announcement.title}', message=announcement.body,
                          from_email=settings.DEFAULT_FROM_EMAIL, recipient_list=[email], fail_silently=False)
                sent += 1
            except Exception:
                continue
        if sent:
            announcement.emailed_count = sent
            announcement.save(update_fields=['emailed_count'])
        log_platform_audit(request, 'platform.announcement_created', target=announcement,
                           description=f'Annonce « {announcement.title} » ({values["audience"]})',
                           metadata={'audience': values['audience'], 'emailed': sent, 'recipients': len(recipients)})
        return Response(_announcement_row(announcement), status=201)


class PlatformAnnouncementPreviewView(APIView):
    """Nombre exact de destinataires d'un email groupé, avant l'envoi."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_platform_superadmin(request):
            return _forbidden(True)
        audience = request.data.get('audience', 'all')
        if audience not in AUDIENCES:
            return Response({'detail': 'Audience invalide.'}, status=400)
        stores = list(_audience_stores(audience))
        return Response({'stores': len(stores), 'emails': sum(1 for s in stores if s.owner.email), 'max': EMAIL_MAX_RECIPIENTS})


class PlatformAnnouncementDetailView(APIView):
    """Modifier ou (dés)activer une annonce — jamais de renvoi d'email."""
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        if not is_platform_superadmin(request):
            return _forbidden(True)
        announcement = PlatformAnnouncement.objects.filter(pk=pk).first()
        if not announcement:
            return Response({'detail': 'Annonce introuvable.'}, status=404)
        values, error = _clean_announcement(request.data, partial=True)
        if error:
            return Response({'detail': error}, status=400)
        for k, v in values.items():
            setattr(announcement, k, v)
        announcement.save()
        log_platform_audit(request, 'platform.announcement_updated', target=announcement,
                           description=f'Annonce « {announcement.title} » modifiée', metadata={'fields': sorted(values)})
        return Response(_announcement_row(announcement))


class VendorAnnouncementListView(APIView):
    """Annonces actives applicables à la boutique du vendeur connecté (bandeau du dashboard)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = get_store(request)
        if not store:
            return Response({'results': []})
        now = timezone.now()
        state = store_state(store, now)
        qs = PlatformAnnouncement.objects.filter(is_active=True).filter(Q(ends_at__isnull=True) | Q(ends_at__gt=now))
        qs = qs.filter(Q(audience='all') | Q(audience=state))
        return Response({'results': [{'id': a.id, 'title': a.title, 'body': a.body, 'level': a.level} for a in qs[:5]]})


# ─── Messages de contact ───────────────────────────────────────────────────

class VendorContactView(APIView):
    """Un vendeur (propriétaire ou admin de boutique) écrit à l'équipe MZSolutions."""
    permission_classes = [IsAuthenticated]
    throttle_scope = 'contact'

    def post(self, request):
        store = get_store(request)
        if not store or not is_owner_or_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        subject = (request.data.get('subject') or '').strip()
        body = (request.data.get('body') or '').strip()
        if not (1 <= len(subject) <= SUBJECT_MAX) or not (1 <= len(body) <= MESSAGE_MAX):
            return Response({'detail': f'Sujet ({SUBJECT_MAX} car. max) et message ({MESSAGE_MAX} car. max) requis.'}, status=400)
        ContactMessage.objects.create(store=store, user=request.user, subject=subject, body=body)
        return Response({'detail': 'Message envoyé.'}, status=201)


def _message_row(m, full=False):
    row = {'id': m.id, 'store_id': m.store_id, 'store_name': m.store.name, 'owner_email': m.store.owner.email, 'subject': m.subject,
           'status': m.status, 'created_at': m.created_at}
    if full:
        row['body'] = m.body
    return row


class PlatformContactListView(APIView):
    """Boîte de réception admin (`?status=new|read|handled&search=&page=`) — le corps du
    message n'est renvoyé que pour un message précis (`GET /contact/<id>/`)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        qs = ContactMessage.objects.select_related('store', 'store__owner')
        status = request.query_params.get('status')
        if status in dict(ContactMessage.STATUS_CHOICES):
            qs = qs.filter(status=status)
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(subject__icontains=search) | Q(store__name__icontains=search) | Q(store__owner__email__icontains=search))
        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        rows = [_message_row(m) for m in qs[(page - 1) * per_page: page * per_page]]
        return Response({'count': total, 'new_count': ContactMessage.objects.filter(status='new').count(),
                        'page': page, 'per_page': per_page, 'results': rows})


class PlatformContactDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Ouvrir un message le marque comme lu s'il était nouveau."""
        if not is_platform_admin(request):
            return _forbidden()
        message = ContactMessage.objects.select_related('store', 'store__owner').filter(pk=pk).first()
        if not message:
            return Response({'detail': 'Message introuvable.'}, status=404)
        if message.status == 'new':
            message.status = 'read'
            message.save(update_fields=['status'])
        return Response(_message_row(message, full=True))

    def put(self, request, pk):
        if not is_platform_admin(request):
            return _forbidden()
        message = ContactMessage.objects.select_related('store', 'store__owner').filter(pk=pk).first()
        if not message:
            return Response({'detail': 'Message introuvable.'}, status=404)
        status = request.data.get('status')
        if status not in dict(ContactMessage.STATUS_CHOICES):
            return Response({'detail': 'Statut invalide.'}, status=400)
        message.status = status
        message.save(update_fields=['status'])
        return Response(_message_row(message))


# ─── Intégrations ──────────────────────────────────────────────────────────

def _integrations_for(store):
    """Intégrations d'une boutique — **jamais un secret** : seulement l'état et un
    booléen « configuré »."""
    from channels.models import ChannelConnection
    from orders.models import CarrierAccount
    from stores.models import PixelConfig
    from webhooks.models import WebhookEndpoint

    carriers = [{'carrier': c.carrier, 'label': c.get_carrier_display(), 'is_active': c.is_active, 'is_default': c.is_default,
                 'configured': bool(c.api_token)} for c in CarrierAccount.objects.filter(store=store).order_by('-is_default', 'carrier')]
    channels = [{'channel': c.channel, 'label': c.get_channel_display(), 'is_active': c.is_active, 'last_synced_at': c.last_synced_at,
                 'configured': bool(c.access_token or c.api_secret)} for c in ChannelConnection.objects.filter(store=store)]
    hooks = WebhookEndpoint.objects.filter(store=store)
    return {
        'carriers': carriers, 'channels': channels,
        'webhooks': {'total': hooks.count(), 'active': hooks.filter(is_active=True).count(),
                     'failing': hooks.filter(consecutive_failures__gt=0).count()},
        'pixels': PixelConfig.objects.filter(store=store, is_active=True).count(),
    }


class PlatformAccountIntegrationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, store_id):
        if not is_platform_admin(request):
            return _forbidden()
        store = Store.objects.filter(pk=store_id).first()
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        return Response(_integrations_for(store))


class PlatformIntegrationsOverviewView(APIView):
    """Adoption des intégrations sur toute la plateforme (par transporteur / canal)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return _forbidden()
        from channels.models import ChannelConnection
        from orders.models import CarrierAccount
        from webhooks.models import WebhookEndpoint

        carriers = (CarrierAccount.objects.values('carrier')
                    .annotate(stores=Count('store', distinct=True), active=Count('id', filter=Q(is_active=True)))
                    .order_by('-stores', 'carrier'))
        labels = dict(CarrierAccount._meta.get_field('carrier').choices)
        channels = (ChannelConnection.objects.values('channel')
                    .annotate(stores=Count('store', distinct=True), active=Count('id', filter=Q(is_active=True)))
                    .order_by('channel'))
        channel_labels = dict(ChannelConnection._meta.get_field('channel').choices)
        return Response({
            'carriers': [{**c, 'label': labels.get(c['carrier'], c['carrier'])} for c in carriers],
            'channels': [{**c, 'label': channel_labels.get(c['channel'], c['channel'])} for c in channels],
            'webhooks': {'total': WebhookEndpoint.objects.count(), 'failing': WebhookEndpoint.objects.filter(consecutive_failures__gt=0).count()},
        })
