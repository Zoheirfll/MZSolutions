from django.db.models import Count
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Store, StoreSettings, StorePage, MediaFolder, MediaFile, PixelConfig, PIXEL_TYPE_CHOICES, SubscriptionPlan
from .serializers import (StoreSerializer, SubscriptionQuotaSerializer, StoreSettingsSerializer,
                           StorePageSerializer, MediaFolderSerializer, MediaFileSerializer, PixelConfigSerializer,
                           SubscriptionPlanSerializer)
from core.permissions import IsOwnerOrAdminForWrites, is_owner_or_admin, has_permission
from audit.utils import log_audit


class MyStoreView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        # `request.user.store` (au lieu du `_get_store_from_request` standard
        # utilisé partout ailleurs dans ce fichier) ne fonctionnait QUE pour
        # l'owner — un admin légitime recevait un 404 accidentel, pas un vrai
        # contrôle d'accès. Corrigé (2026-08) en même temps que la fermeture
        # de l'accès confirmateur/dropshipper, désormais explicite (403).
        if not (is_owner_or_admin(request) or has_permission(request, 'store_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Aucune boutique associée.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(StoreSerializer(store, context={'request': request}).data)

    def put(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Aucune boutique associée.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = StoreSerializer(store, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_audit(request, 'store.updated', store=store, description="Boutique modifiée (Ma boutique)", metadata={'changed_fields': list(request.data.keys())})
        return Response(serializer.data)


class QuotaView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'subscription_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Quota introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            quota = store.quota
        except Exception:
            return Response({'detail': 'Quota introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(SubscriptionQuotaSerializer(quota).data)


class StoreSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _settings(self, request, allow_view_permission=False):
        allowed = is_owner_or_admin(request) or (allow_view_permission and has_permission(request, 'store_view'))
        if not allowed:
            return None, Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return None, Response({'detail': 'Aucune boutique.'}, status=403)
        settings, _ = StoreSettings.objects.get_or_create(store=store)
        return settings, None

    def get(self, request):
        # Écriture reste strict owner/admin (self._settings par défaut) —
        # seule la lecture s'ouvre à store_view (page "Ma boutique" > Thème/Menu).
        s, err = self._settings(request, allow_view_permission=True)
        if err: return err
        return Response(StoreSettingsSerializer(s).data)

    def put(self, request):
        s, err = self._settings(request)
        if err: return err
        ser = StoreSettingsSerializer(s, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        log_audit(request, 'store_settings.updated', store=s.store, description="Paramètres généraux modifiés", metadata={'changed_fields': list(request.data.keys())})
        return Response(ser.data)


# ─── Pages personnalisées ─────────────────────────────────────────────────────

def _get_store_from_request(request):
    try:
        return request.user.store
    except Exception:
        pass
    try:
        return request.user.team_membership.store
    except Exception:
        return None


class StorePageListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'store_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        pages = store.pages.all()
        return Response(StorePageSerializer(pages, many=True).data)

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        ser = StorePageSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        page = ser.save(store=store)
        log_audit(request, 'store_page.created', target=page, description=f"Page créée : {page.title}")
        return Response(ser.data, status=201)


class StorePageDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        store = _get_store_from_request(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.pages.get(pk=pk), None
        except StorePage.DoesNotExist:
            return None, Response({'detail': 'Page introuvable.'}, status=404)

    def get(self, request, pk):
        if not (is_owner_or_admin(request) or has_permission(request, 'store_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        page, err = self._get(request, pk)
        if err: return err
        return Response(StorePageSerializer(page).data)

    def put(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        page, err = self._get(request, pk)
        if err: return err
        ser = StorePageSerializer(page, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        log_audit(request, 'store_page.updated', target=page, description=f"Page modifiée : {page.title}")
        return Response(ser.data)

    def delete(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        page, err = self._get(request, pk)
        if err: return err
        slug = page.slug
        store = page.store
        log_audit(request, 'store_page.deleted', target=page, description=f"Page supprimée : {page.title}")
        page.delete()

        # Nettoyage auto du menu — un lien vers cette page devenait un lien
        # mort silencieux (aucune détection avant cette passe), on retire
        # désormais toute entrée (top-niveau ou sous-lien) qui la référençait.
        removed = 0
        try:
            settings = store.settings
            items = settings.menu_items or []

            def _clean(list_items):
                nonlocal removed
                kept = []
                for item in list_items:
                    if item.get('type') == 'page' and item.get('page_slug') == slug:
                        removed += 1
                        continue
                    if item.get('children'):
                        item['children'] = _clean(item['children'])
                    kept.append(item)
                return kept

            cleaned = _clean(items)
            if removed:
                settings.menu_items = cleaned
                settings.save(update_fields=['menu_items'])
        except Exception:
            pass

        return Response({'menu_links_removed': removed}, status=200)


# ─── Gestionnaire de fichiers ─────────────────────────────────────────────────

class MediaFolderListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'store_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        return Response(MediaFolderSerializer(store.media_folders.all(), many=True).data)

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        ser = MediaFolderSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(store=store)
        return Response(ser.data, status=201)


class MediaFolderDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            folder = store.media_folders.get(pk=pk)
        except MediaFolder.DoesNotExist:
            return Response({'detail': 'Dossier introuvable.'}, status=404)
        folder.delete()
        return Response(status=204)


class MediaFileListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'store_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        qs = store.media_files.all()
        folder_id = request.query_params.get('folder')
        if folder_id == 'none':
            qs = qs.filter(folder__isnull=True)
        elif folder_id:
            qs = qs.filter(folder_id=folder_id)
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(original_name__icontains=search)
        return Response(MediaFileSerializer(qs, many=True, context={'request': request}).data)


class MediaFileUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        folder_id = request.data.get('folder')
        folder = None
        if folder_id:
            try:
                folder = store.media_folders.get(pk=folder_id)
            except MediaFolder.DoesNotExist:
                pass
        files = request.FILES.getlist('files')
        if not files:
            return Response({'detail': 'Aucun fichier reçu.'}, status=400)

        from django.core.exceptions import ValidationError
        from core.validators import validate_uploaded_file
        for f in files:
            try:
                validate_uploaded_file(f)
            except ValidationError as e:
                return Response({'detail': f"{f.name} : {e.messages[0]}"}, status=400)

        created = []
        for f in files:
            mf = MediaFile.objects.create(
                store=store,
                folder=folder,
                file=f,
                original_name=f.name,
                size=f.size,
                mime_type=f.content_type or '',
            )
            created.append(MediaFileSerializer(mf, context={'request': request}).data)
        return Response(created, status=201)


class MediaFileDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            mf = store.media_files.get(pk=pk)
        except MediaFile.DoesNotExist:
            return Response({'detail': 'Fichier introuvable.'}, status=404)
        mf.file.delete(save=False)
        mf.delete()
        return Response(status=204)

    def put(self, request, pk):
        """Déplace un fichier vers un autre dossier (ou la racine si
        `folder` absent/null) — jusqu'ici le dossier n'était réglable qu'à
        l'upload, aucun moyen de réorganiser après coup."""
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            mf = store.media_files.get(pk=pk)
        except MediaFile.DoesNotExist:
            return Response({'detail': 'Fichier introuvable.'}, status=404)
        folder_id = request.data.get('folder')
        if folder_id:
            try:
                mf.folder = store.media_folders.get(pk=folder_id)
            except MediaFolder.DoesNotExist:
                return Response({'detail': 'Dossier introuvable.'}, status=404)
        else:
            mf.folder = None
        mf.save(update_fields=['folder'])
        return Response(MediaFileSerializer(mf, context={'request': request}).data)


class MediaFileBulkDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        ids = request.data.get('ids', [])
        qs = store.media_files.filter(pk__in=ids)
        count = qs.count()
        for mf in qs:
            mf.file.delete(save=False)
        qs.delete()
        return Response({'deleted': count})


class MediaStorageSummaryView(APIView):
    """Espace de stockage total utilisé — les tailles étaient suivies
    (MediaFile.size) mais jamais agrégées/affichées nulle part."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'store_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        from django.db.models import Sum
        agg = store.media_files.aggregate(total_size=Sum('size'), count=Count('id'))
        return Response({'total_size': agg['total_size'] or 0, 'count': agg['count'] or 0})


# ─── Pixels marketing (Epic 8.3) ──────────────────────────────────────────────

class PixelConfigListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_owner_or_admin(request) or has_permission(request, 'marketing_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        qs = store.pixels.all()
        pixel_type = request.query_params.get('pixel_type')
        if pixel_type:
            qs = qs.filter(pixel_type=pixel_type)
        return Response(PixelConfigSerializer(qs, many=True).data)

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        if request.data.get('pixel_type') not in dict(PIXEL_TYPE_CHOICES):
            return Response({'detail': f"pixel_type invalide. Valeurs : {list(dict(PIXEL_TYPE_CHOICES))}"}, status=400)
        serializer = PixelConfigSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pixel = serializer.save(store=store)
        log_audit(request, 'pixel.created', target=pixel, description=f"Pixel {pixel.get_pixel_type_display()} ajouté")
        return Response(serializer.data, status=201)


class PixelConfigDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        if not is_owner_or_admin(request):
            return None, Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store_from_request(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.pixels.get(pk=pk), None
        except PixelConfig.DoesNotExist:
            return None, Response({'detail': 'Pixel introuvable.'}, status=404)

    def put(self, request, pk):
        pixel, err = self._get(request, pk)
        if err: return err
        serializer = PixelConfigSerializer(pixel, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_audit(request, 'pixel.updated', target=pixel, description=f"Pixel {pixel.get_pixel_type_display()} modifié")
        return Response(serializer.data)

    def delete(self, request, pk):
        pixel, err = self._get(request, pk)
        if err: return err
        log_audit(request, 'pixel.deleted', target=pixel, description=f"Pixel {pixel.get_pixel_type_display()} supprimé")
        pixel.delete()
        return Response(status=204)


# ─── Abonnement (Epic 8.5) ────────────────────────────────────────────────────

class SubscriptionPlanListView(APIView):
    """Catalogue public (authentifié) des paliers d'abonnement (US-8.5.1)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        plans = SubscriptionPlan.objects.filter(is_active=True)
        return Response(SubscriptionPlanSerializer(plans, many=True).data)


class SubscribeView(APIView):
    """Crée un checkout Chargily pour le palier choisi — le quota n'est mis à
    jour qu'au webhook checkout.paid (paiement réel confirmé), pas ici."""
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def post(self, request):
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        try:
            plan = SubscriptionPlan.objects.get(id=request.data.get('plan_id'), is_active=True)
        except SubscriptionPlan.DoesNotExist:
            return Response({'detail': 'Palier introuvable.'}, status=404)

        billing_cycle = request.data.get('billing_cycle', 'monthly')
        if billing_cycle not in ('monthly', 'yearly'):
            return Response({'detail': "billing_cycle doit être 'monthly' ou 'yearly'."}, status=400)

        amount = plan.price_for(billing_cycle)
        if amount <= 0:
            return Response({'detail': "Ce palier n'a pas de montant à payer."}, status=400)

        from orders import chargily
        try:
            checkout_id, payment_link = chargily.create_subscription_checkout(store, amount, plan.id, billing_cycle)
        except chargily.ChargilyError as e:
            return Response({'detail': f"Erreur Chargily : {e}"}, status=502)

        log_audit(request, 'subscription.checkout_started', store=store, description=f"Checkout d'abonnement démarré — palier {plan.name} ({billing_cycle})", metadata={'plan': plan.name, 'billing_cycle': billing_cycle, 'checkout_id': checkout_id})
        return Response({'payment_url': payment_link, 'checkout_id': checkout_id})
