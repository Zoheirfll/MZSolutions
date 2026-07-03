from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Store, StoreSettings, StorePage, MediaFolder, MediaFile, PixelConfig, PIXEL_TYPE_CHOICES
from .serializers import (StoreSerializer, SubscriptionQuotaSerializer, StoreSettingsSerializer,
                           StorePageSerializer, MediaFolderSerializer, MediaFileSerializer, PixelConfigSerializer)
from core.permissions import IsOwnerOrAdminForWrites


class MyStoreView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        try:
            store = request.user.store
        except Store.DoesNotExist:
            return Response({'detail': 'Aucune boutique associée.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(StoreSerializer(store).data)

    def put(self, request):
        store = request.user.store
        serializer = StoreSerializer(store, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class QuotaView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        try:
            quota = request.user.store.quota
        except Exception:
            return Response({'detail': 'Quota introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(SubscriptionQuotaSerializer(quota).data)


class StoreSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _settings(self, request):
        try:
            store = request.user.store
        except Exception:
            return None, Response({'detail': 'Aucune boutique.'}, status=403)
        settings, _ = StoreSettings.objects.get_or_create(store=store)
        return settings, None

    def get(self, request):
        s, err = self._settings(request)
        if err: return err
        return Response(StoreSettingsSerializer(s).data)

    def put(self, request):
        s, err = self._settings(request)
        if err: return err
        ser = StoreSettingsSerializer(s, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
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
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        pages = store.pages.all()
        return Response(StorePageSerializer(pages, many=True).data)

    def post(self, request):
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        ser = StorePageSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(store=store)
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
        page, err = self._get(request, pk)
        if err: return err
        return Response(StorePageSerializer(page).data)

    def put(self, request, pk):
        page, err = self._get(request, pk)
        if err: return err
        ser = StorePageSerializer(page, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, pk):
        page, err = self._get(request, pk)
        if err: return err
        page.delete()
        return Response(status=204)


# ─── Gestionnaire de fichiers ─────────────────────────────────────────────────

class MediaFolderListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        return Response(MediaFolderSerializer(store.media_folders.all(), many=True).data)

    def post(self, request):
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


# ─── Pixels marketing (Epic 8.3) ──────────────────────────────────────────────

class PixelConfigListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        qs = store.pixels.all()
        pixel_type = request.query_params.get('pixel_type')
        if pixel_type:
            qs = qs.filter(pixel_type=pixel_type)
        return Response(PixelConfigSerializer(qs, many=True).data)

    def post(self, request):
        store = _get_store_from_request(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        if request.data.get('pixel_type') not in dict(PIXEL_TYPE_CHOICES):
            return Response({'detail': f"pixel_type invalide. Valeurs : {list(dict(PIXEL_TYPE_CHOICES))}"}, status=400)
        serializer = PixelConfigSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(store=store)
        return Response(serializer.data, status=201)


class PixelConfigDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _get(self, request, pk):
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
        return Response(serializer.data)

    def delete(self, request, pk):
        pixel, err = self._get(request, pk)
        if err: return err
        pixel.delete()
        return Response(status=204)
