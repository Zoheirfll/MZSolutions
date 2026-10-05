"""FAQ et pages légales éditables (admin plateforme — phase 12).
Lecture admin/superadmin ; écriture superadmin ; tout est audité."""
from django.http import HttpResponse
from django.utils.html import escape
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .account_views import log_platform_audit
from .content_models import FaqItem, LegalPage
from .permissions import is_platform_admin, is_platform_superadmin

LEGAL_SLUGS = dict(LegalPage.SLUG_CHOICES)


def _faq_row(f):
    return {'id': f.id, 'question': f.question, 'answer': f.answer, 'order': f.order, 'is_active': f.is_active}


def _faq_clean(data, partial=False):
    out = {}
    if 'question' in data or not partial:
        q = (data.get('question') or '').strip()
        if not 3 <= len(q) <= 200:
            return None, 'Question requise (3 à 200 caractères).'
        out['question'] = q
    if 'answer' in data or not partial:
        a = (data.get('answer') or '').strip()
        if not 3 <= len(a) <= 3000:
            return None, 'Réponse requise (3 à 3000 caractères).'
        out['answer'] = a
    if 'order' in data:
        try:
            out['order'] = max(0, min(int(data['order']), 10000))
        except (TypeError, ValueError):
            return None, 'Ordre invalide.'
    if 'is_active' in data:
        out['is_active'] = bool(data['is_active'])
    return out, None


class VendorFaqView(APIView):
    """FAQ lue par les vendeurs dans leur dashboard (éléments actifs, dans l'ordre)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response([_faq_row(f) for f in FaqItem.objects.filter(is_active=True)])


class PlatformFaqListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        return Response([_faq_row(f) for f in FaqItem.objects.all()])

    def post(self, request):
        if not is_platform_superadmin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        data, err = _faq_clean(request.data)
        if err:
            return Response({'detail': err}, status=400)
        item = FaqItem.objects.create(**data)
        log_platform_audit(request, 'platform.faq_created', description=f'Question FAQ créée : {item.question}', target=item)
        return Response(_faq_row(item), status=201)


class PlatformFaqDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        if not is_platform_superadmin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        item = FaqItem.objects.filter(pk=pk).first()
        if not item:
            return Response({'detail': 'Introuvable.'}, status=404)
        data, err = _faq_clean(request.data, partial=True)
        if err:
            return Response({'detail': err}, status=400)
        for k, v in data.items():
            setattr(item, k, v)
        item.save()
        log_platform_audit(request, 'platform.faq_updated', description=f'Question FAQ modifiée : {item.question}', target=item)
        return Response(_faq_row(item))

    def delete(self, request, pk):
        if not is_platform_superadmin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        item = FaqItem.objects.filter(pk=pk).first()
        if not item:
            return Response({'detail': 'Introuvable.'}, status=404)
        label = item.question
        item.delete()
        log_platform_audit(request, 'platform.faq_deleted', description=f'Question FAQ supprimée : {label}')
        return Response(status=204)


class PlatformLegalPagesView(APIView):
    """GET : les deux pages (vides si jamais éditées). PUT /<slug>/ : superadmin."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_platform_admin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        rows = []
        for slug, label in LegalPage.SLUG_CHOICES:
            page = LegalPage.objects.filter(slug=slug).first()
            rows.append({'slug': slug, 'label': label, 'title': page.title if page else '', 'body': page.body if page else '',
                         'updated_at': page.updated_at if page else None})
        return Response(rows)


class PlatformLegalPageUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, slug):
        if not is_platform_superadmin(request):
            return Response({'detail': 'Accès refusé.'}, status=403)
        if slug not in LEGAL_SLUGS:
            return Response({'detail': 'Page inconnue.'}, status=404)
        title = (request.data.get('title') or '').strip()
        body = (request.data.get('body') or '').strip()
        if not 3 <= len(title) <= 150 or not 20 <= len(body) <= 30000:
            return Response({'detail': 'Titre (3 à 150 car.) et texte (20 à 30000 car.) requis.'}, status=400)
        page, _ = LegalPage.objects.update_or_create(slug=slug, defaults={'title': title, 'body': body})
        log_platform_audit(request, 'platform.legal_page_updated', description=f'Page légale modifiée : {LEGAL_SLUGS[slug]}', target=page)
        return Response({'slug': slug, 'title': page.title, 'body': page.body, 'updated_at': page.updated_at})


def render_legal_page(slug):
    """HTML public d'une page légale éditée, ou None pour retomber sur la page
    historique. Le texte est ÉCHAPPÉ puis découpé en paragraphes."""
    page = LegalPage.objects.filter(slug=slug).first()
    if not page:
        return None
    paragraphs = ''.join(f'<p>{escape(p).replace(chr(10), "<br>")}</p>' for p in page.body.split('\n\n') if p.strip())
    return HttpResponse(
        '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
        f'<title>{escape(page.title)} — MZSolutions</title><meta name="viewport" content="width=device-width, initial-scale=1">'
        '<style>body{font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222}h1{font-size:1.5rem}</style>'
        f'</head><body><h1>{escape(page.title)}</h1><p>Dernière mise à jour : {page.updated_at:%d/%m/%Y}</p>{paragraphs}</body></html>')
