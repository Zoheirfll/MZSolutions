import csv
from django.db.models import Q
from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from .models import (Category, Product, ProductImage, ProductVariant, VariantOption, Supplier,
                      SupplierCredit, SupplierPayment, ProductReview, Promotion, StockMovement)
from .serializers import (
    CategorySerializer, ProductSerializer, ProductImageSerializer,
    ProductVariantSerializer, VariantOptionSerializer,
    SupplierSerializer, SupplierCreditSerializer, SupplierPaymentSerializer,
    ProductReviewSerializer, PromotionSerializer, StockMovementSerializer,
)
from core.permissions import get_store as _get_store, IsOwnerOrAdminForWrites
from core.pagination import parse_pagination


# ─── Categories ───────────────────────────────────────────────────────────────

class CategoryListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Aucune boutique.'}, status=403)
        qs = store.categories.all()
        parent = request.query_params.get('parent')
        if parent == 'null':
            qs = qs.filter(parent__isnull=True)
        elif parent:
            qs = qs.filter(parent_id=parent)

        # Filtrage par état
        tab = request.query_params.get('tab', '')
        if tab == 'corbeille':
            qs = qs.filter(is_deleted=True)
        elif tab == 'publie':
            qs = qs.filter(is_active=True, is_deleted=False)
        elif tab == 'desactive':
            qs = qs.filter(is_active=False, is_deleted=False)
        else:
            qs = qs.filter(is_deleted=False)

        # Pagination
        page, per_page = parse_pagination(request, default_per_page=10)
        total    = qs.count()
        qs       = qs.order_by('-created_at')[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  CategorySerializer(qs, many=True, context={'request': request}).data,
        })

    def post(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Aucune boutique.'}, status=403)
        s = CategorySerializer(data=request.data, context={'request': request})
        s.is_valid(raise_exception=True)
        s.save(store=store)
        return Response(s.data, status=status.HTTP_201_CREATED)


class CategoryDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.categories.get(pk=pk), None
        except Category.DoesNotExist:
            return None, Response({'detail': 'Catégorie introuvable.'}, status=404)

    def get(self, request, pk):
        cat, err = self._get(request, pk)
        if err: return err
        return Response(CategorySerializer(cat, context={'request': request}).data)

    def put(self, request, pk):
        cat, err = self._get(request, pk)
        if err: return err
        s = CategorySerializer(cat, data=request.data, partial=True, context={'request': request})
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def delete(self, request, pk):
        cat, err = self._get(request, pk)
        if err: return err
        # Soft delete (Corbeille) — hard delete si déjà en corbeille
        if cat.is_deleted:
            cat.delete()
        else:
            cat.is_deleted = True
            cat.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class CategoryRestoreView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def post(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            cat = store.categories.get(pk=pk, is_deleted=True)
        except Category.DoesNotExist:
            return Response({'detail': 'Catégorie introuvable.'}, status=404)
        cat.is_deleted = False
        cat.save(update_fields=['is_deleted'])
        return Response(CategorySerializer(cat, context={'request': request}).data)


# ─── Products ────────────────────────────────────────────────────────────────

class ProductListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Aucune boutique.'}, status=403)

        qs = store.products.select_related('supplier').prefetch_related('categories', 'images', 'variants__options').all()

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(name__icontains=search)

        category = request.query_params.get('category', '').strip()
        if category:
            qs = qs.filter(categories__name__icontains=category).distinct()

        page, per_page = parse_pagination(request, default_per_page=10)
        total    = qs.count()
        qs       = qs.order_by('-created_at')[(page - 1) * per_page: page * per_page]

        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  ProductSerializer(qs, many=True, context={'request': request}).data,
        })

    def post(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Aucune boutique.'}, status=403)
        s = ProductSerializer(data=request.data, context={'request': request, 'store': store})
        s.is_valid(raise_exception=True)
        s.save(store=store)
        return Response(s.data, status=status.HTTP_201_CREATED)


class ProductDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.products.select_related('supplier').prefetch_related('images', 'categories', 'variants__options').get(pk=pk), None
        except Product.DoesNotExist:
            return None, Response({'detail': 'Produit introuvable.'}, status=404)

    def get(self, request, pk):
        p, err = self._get(request, pk)
        if err: return err
        return Response(ProductSerializer(p, context={'request': request}).data)

    def put(self, request, pk):
        p, err = self._get(request, pk)
        if err: return err
        store = _get_store(request)
        s = ProductSerializer(p, data=request.data, partial=True,
                              context={'request': request, 'store': store})
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def delete(self, request, pk):
        p, err = self._get(request, pk)
        if err: return err
        p.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductImageView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def post(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            product = store.products.get(pk=pk)
        except Product.DoesNotExist:
            return Response({'detail': 'Produit introuvable.'}, status=404)
        image_file = request.FILES.get('image')
        if not image_file:
            return Response({'detail': 'Aucun fichier image.'}, status=400)
        from django.core.exceptions import ValidationError
        from core.validators import validate_uploaded_file
        try:
            validate_uploaded_file(image_file)
        except ValidationError as e:
            return Response({'detail': e.messages[0]}, status=400)
        img = ProductImage.objects.create(
            product=product,
            image=image_file,
            order=product.images.count(),
        )
        return Response(ProductImageSerializer(img, context={'request': request}).data,
                        status=status.HTTP_201_CREATED)

    def delete(self, request, pk, img_id):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            img = ProductImage.objects.get(pk=img_id, product__store=store, product_id=pk)
        except ProductImage.DoesNotExist:
            return Response({'detail': 'Image introuvable.'}, status=404)
        img.image.delete(save=False)
        img.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductImageReorderView(APIView):
    """Réordonne les images d'un produit (glisser/monter-descendre côté
    ProductFormPage.jsx) — la première de la liste devient l'image principale
    (aucun champ booléen dédié, `order=0` fait déjà foi partout ailleurs,
    ex. StorefrontProductPage.jsx utilise `images[0]`)."""
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def put(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            product = store.products.get(pk=pk)
        except Product.DoesNotExist:
            return Response({'detail': 'Produit introuvable.'}, status=404)

        order_ids = request.data.get('order', [])
        images = {img.id: img for img in product.images.all()}
        if set(order_ids) != set(images.keys()):
            return Response({'detail': "La liste doit contenir exactement les images existantes du produit."}, status=400)

        for index, img_id in enumerate(order_ids):
            img = images[img_id]
            if img.order != index:
                img.order = index
                img.save(update_fields=['order'])

        return Response(ProductImageSerializer(product.images.order_by('order'), many=True, context={'request': request}).data)


# ─── Variants ────────────────────────────────────────────────────────────────

class ProductVariantView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _product(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.products.get(pk=pk), None
        except Product.DoesNotExist:
            return None, Response({'detail': 'Produit introuvable.'}, status=404)

    def get(self, request, pk):
        product, err = self._product(request, pk)
        if err: return err
        variants = product.variants.prefetch_related('options').all()
        return Response(ProductVariantSerializer(variants, many=True, context={'request': request}).data)

    def post(self, request, pk):
        product, err = self._product(request, pk)
        if err: return err
        s = ProductVariantSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save(product=product)
        return Response(s.data, status=status.HTTP_201_CREATED)


class ProductVariantDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _get(self, request, pk, vid):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            variant = ProductVariant.objects.get(pk=vid, product_id=pk, product__store=store)
            return variant, None
        except ProductVariant.DoesNotExist:
            return None, Response({'detail': 'Variante introuvable.'}, status=404)

    def put(self, request, pk, vid):
        variant, err = self._get(request, pk, vid)
        if err: return err
        s = ProductVariantSerializer(variant, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def delete(self, request, pk, vid):
        variant, err = self._get(request, pk, vid)
        if err: return err
        variant.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VariantOptionView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _variant(self, request, pk, vid):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            variant = ProductVariant.objects.get(pk=vid, product_id=pk, product__store=store)
            return variant, None
        except ProductVariant.DoesNotExist:
            return None, Response({'detail': 'Variante introuvable.'}, status=404)

    def post(self, request, pk, vid):
        variant, err = self._variant(request, pk, vid)
        if err: return err
        s = VariantOptionSerializer(data=request.data, context={'request': request})
        s.is_valid(raise_exception=True)
        s.save(variant=variant)
        return Response(s.data, status=status.HTTP_201_CREATED)


class VariantOptionDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _get(self, request, pk, vid, oid):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            opt = VariantOption.objects.get(pk=oid, variant_id=vid, variant__product_id=pk, variant__product__store=store)
            return opt, None
        except VariantOption.DoesNotExist:
            return None, Response({'detail': 'Option introuvable.'}, status=404)

    def put(self, request, pk, vid, oid):
        opt, err = self._get(request, pk, vid, oid)
        if err: return err
        # handle multipart (image upload)
        s = VariantOptionSerializer(opt, data=request.data, partial=True, context={'request': request})
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def delete(self, request, pk, vid, oid):
        opt, err = self._get(request, pk, vid, oid)
        if err: return err
        if opt.image:
            opt.image.delete(save=False)
        opt.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Low-stock alert ─────────────────────────────────────────────────────────

class LowStockView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            threshold = store.settings.low_stock_threshold
        except Exception:
            threshold = 5

        results = []
        products = store.products.prefetch_related('variants__options').filter(is_active=True)
        for p in products:
            variants = list(p.variants.all())
            options  = [opt for v in variants for opt in v.options.all()]
            if options:
                for v in variants:
                    for opt in v.options.all():
                        if opt.stock <= threshold:
                            results.append({
                                'product_id':   p.id,
                                'product_name': p.name,
                                'variant_name': v.name,
                                'option_value': opt.value,
                                'stock':        opt.stock,
                            })
            else:
                # Pas de variantes, ou des variantes sans aucune option — le stock
                # se gère alors directement sur le produit.
                if p.stock <= threshold:
                    results.append({
                        'product_id':   p.id,
                        'product_name': p.name,
                        'variant_name': None,
                        'option_value': None,
                        'stock':        p.stock,
                    })

        return Response({'threshold': threshold, 'count': len(results), 'results': results})


class InventoryListView(APIView):
    """Stock complet — tout ce que possède la boutique (pas seulement les
    articles sous le seuil d'alerte, contrairement à LowStockView)."""
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        search = request.query_params.get('search', '').strip()
        products = store.products.prefetch_related('variants__options').filter(is_active=True)
        if search:
            products = products.filter(name__icontains=search)

        try:
            threshold = store.settings.low_stock_threshold
        except Exception:
            threshold = 5
        stock_filter = request.query_params.get('stock_filter')  # 'low' | 'out'

        results = []
        for p in products:
            variants = list(p.variants.all())
            options  = [opt for v in variants for opt in v.options.all()]
            if options:
                for v in variants:
                    for opt in v.options.all():
                        results.append({
                            'product_id':        p.id,
                            'product_name':      p.name,
                            'variant_option_id': opt.id,
                            'variant_name':      v.name,
                            'option_value':      opt.value,
                            'sku':               opt.sku,
                            'stock':             opt.stock,
                        })
            else:
                # Pas de variantes, ou des variantes sans aucune option — le stock
                # se gère alors directement sur le produit.
                results.append({
                    'product_id':        p.id,
                    'product_name':      p.name,
                    'variant_option_id': None,
                    'variant_name':      None,
                    'option_value':      None,
                    'sku':               p.sku,
                    'stock':             p.stock,
                })

        if stock_filter == 'out':
            results = [r for r in results if r['stock'] == 0]
        elif stock_filter == 'low':
            results = [r for r in results if r['stock'] <= threshold]

        if request.query_params.get('export') == 'csv':
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = 'attachment; filename="inventaire.csv"'
            writer = csv.writer(response)
            writer.writerow(['Produit', 'Variante', 'Option', 'SKU', 'Stock'])
            for r in results:
                writer.writerow([r['product_name'], r['variant_name'] or '', r['option_value'] or '', r['sku'] or '', r['stock']])
            return response

        page, per_page = parse_pagination(request, default_per_page=20)
        total    = len(results)
        results  = results[(page - 1) * per_page: page * per_page]

        return Response({'count': total, 'page': page, 'per_page': per_page, 'threshold': threshold, 'results': results})


class StockAdjustmentView(APIView):
    """Ajustement manuel de stock (réception fournisseur, casse, inventaire
    physique...) — jusqu'ici le stock ne bougeait que via une vente ou un
    échange, aucun moyen de le corriger à la main sans passer par la fiche
    produit (qui ne journalise pas de StockMovement)."""
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def post(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        product_id = request.data.get('product_id')
        variant_option_id = request.data.get('variant_option_id')
        try:
            quantity = int(request.data.get('quantity'))
        except (TypeError, ValueError):
            return Response({'detail': 'Quantité invalide.'}, status=400)
        if quantity == 0:
            return Response({'detail': 'La quantité ne peut pas être nulle.'}, status=400)

        try:
            product = store.products.get(pk=product_id)
        except Product.DoesNotExist:
            return Response({'detail': 'Produit introuvable.'}, status=404)

        option = None
        if variant_option_id:
            try:
                option = VariantOption.objects.get(pk=variant_option_id, variant__product=product)
            except VariantOption.DoesNotExist:
                return Response({'detail': 'Variante introuvable.'}, status=404)
            option.stock = max(0, option.stock + quantity)
            option.save(update_fields=['stock'])
        else:
            product.stock = max(0, product.stock + quantity)
            product.save(update_fields=['stock'])

        movement = StockMovement.objects.create(
            store=store, product=product, variant_option=option,
            quantity=quantity, reason='manual_adjustment', note=request.data.get('note', ''),
        )
        return Response(StockMovementSerializer(movement).data, status=201)


class StockMovementListView(APIView):
    """Historique des mouvements de stock (US-7.2.2 — StockMovement existait
    déjà pour l'audit des échanges/ventes, jamais exposé côté dashboard)."""
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        qs = store.stock_movements.select_related('product', 'variant_option')
        product_id = request.query_params.get('product')
        if product_id:
            qs = qs.filter(product_id=product_id)
        page, per_page = parse_pagination(request, default_per_page=20)
        total = qs.count()
        qs = qs[(page - 1) * per_page: page * per_page]
        return Response({'count': total, 'page': page, 'per_page': per_page, 'results': StockMovementSerializer(qs, many=True).data})


# ─── Suppliers ───────────────────────────────────────────────────────────────

class SupplierListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Aucune boutique.'}, status=403)
        qs = store.suppliers.all().order_by('-created_at')
        return Response(SupplierSerializer(qs, many=True).data)

    def post(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Aucune boutique.'}, status=403)
        s = SupplierSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save(store=store)
        return Response(s.data, status=status.HTTP_201_CREATED)


class SupplierDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.suppliers.get(pk=pk), None
        except Supplier.DoesNotExist:
            return None, Response({'detail': 'Fournisseur introuvable.'}, status=404)

    def get(self, request, pk):
        sup, err = self._get(request, pk)
        if err: return err
        return Response(SupplierSerializer(sup).data)

    def put(self, request, pk):
        sup, err = self._get(request, pk)
        if err: return err
        s = SupplierSerializer(sup, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def delete(self, request, pk):
        sup, err = self._get(request, pk)
        if err: return err
        sup.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Promotions ───────────────────────────────────────────────────────────────

class PromotionListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Aucune boutique.'}, status=403)
        qs = store.promotions.all().order_by('-created_at')
        kind = request.query_params.get('kind')
        if kind in ('code', 'auto'):
            qs = qs.filter(kind=kind)
        return Response(PromotionSerializer(qs, many=True).data)

    def post(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Aucune boutique.'}, status=403)
        s = PromotionSerializer(data=request.data, context={'store': store})
        s.is_valid(raise_exception=True)
        s.save(store=store)
        return Response(s.data, status=status.HTTP_201_CREATED)


class PromotionDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.promotions.get(pk=pk), None
        except Promotion.DoesNotExist:
            return None, Response({'detail': 'Promotion introuvable.'}, status=404)

    def get(self, request, pk):
        promo, err = self._get(request, pk)
        if err: return err
        return Response(PromotionSerializer(promo).data)

    def put(self, request, pk):
        promo, err = self._get(request, pk)
        if err: return err
        s = PromotionSerializer(promo, data=request.data, partial=True, context={'store': promo.store})
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def delete(self, request, pk):
        promo, err = self._get(request, pk)
        if err: return err
        promo.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Supplier Credits & Payments ─────────────────────────────────────────────

class SupplierCreditView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _supplier(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.suppliers.get(pk=pk), None
        except Supplier.DoesNotExist:
            return None, Response({'detail': 'Fournisseur introuvable.'}, status=404)

    def get(self, request, pk):
        sup, err = self._supplier(request, pk)
        if err: return err
        qs = sup.credits.all().order_by('-date', '-created_at')
        return Response(SupplierCreditSerializer(qs, many=True).data)

    def post(self, request, pk):
        sup, err = self._supplier(request, pk)
        if err: return err
        s = SupplierCreditSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save(supplier=sup)
        return Response(s.data, status=status.HTTP_201_CREATED)


class SupplierCreditDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def delete(self, request, pk, cid):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            credit = SupplierCredit.objects.get(pk=cid, supplier_id=pk, supplier__store=store)
        except SupplierCredit.DoesNotExist:
            return Response({'detail': 'Crédit introuvable.'}, status=404)
        credit.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SupplierPaymentView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _supplier(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.suppliers.get(pk=pk), None
        except Supplier.DoesNotExist:
            return None, Response({'detail': 'Fournisseur introuvable.'}, status=404)

    def get(self, request, pk):
        sup, err = self._supplier(request, pk)
        if err: return err
        qs = sup.payments.all().order_by('-date', '-created_at')
        return Response(SupplierPaymentSerializer(qs, many=True).data)

    def post(self, request, pk):
        sup, err = self._supplier(request, pk)
        if err: return err
        s = SupplierPaymentSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save(supplier=sup)
        return Response(s.data, status=status.HTTP_201_CREATED)


class SupplierPaymentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def delete(self, request, pk, pid):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            payment = SupplierPayment.objects.get(pk=pid, supplier_id=pk, supplier__store=store)
        except SupplierPayment.DoesNotExist:
            return Response({'detail': 'Versement introuvable.'}, status=404)
        payment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SupplierBalanceView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            sup = store.suppliers.get(pk=pk)
        except Supplier.DoesNotExist:
            return Response({'detail': 'Fournisseur introuvable.'}, status=404)
        from django.db.models import Sum
        total_credits  = float(sup.credits.aggregate(t=Sum('amount'))['t'] or 0)
        total_payments = float(sup.payments.aggregate(t=Sum('amount'))['t'] or 0)
        return Response({
            'supplier_id':   pk,
            'total_credits':  total_credits,
            'total_payments': total_payments,
            'balance':        total_credits - total_payments,
        })


# ─── All suppliers credits/payments (cross-supplier views) ───────────────────

class AllCreditsView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        qs = SupplierCredit.objects.filter(supplier__store=store).select_related('supplier').order_by('-date', '-created_at')
        supplier_id = request.query_params.get('supplier')
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        return Response(SupplierCreditSerializer(qs, many=True).data)

    def post(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        # Validate supplier belongs to store
        supplier_id = request.data.get('supplier')
        if not supplier_id or not store.suppliers.filter(pk=supplier_id).exists():
            return Response({'detail': 'Fournisseur invalide.'}, status=400)
        s = SupplierCreditSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data, status=status.HTTP_201_CREATED)


class AllPaymentsView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        qs = SupplierPayment.objects.filter(supplier__store=store).select_related('supplier').order_by('-date', '-created_at')
        supplier_id = request.query_params.get('supplier')
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        return Response(SupplierPaymentSerializer(qs, many=True).data)

    def post(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        supplier_id = request.data.get('supplier')
        if not supplier_id or not store.suppliers.filter(pk=supplier_id).exists():
            return Response({'detail': 'Fournisseur invalide.'}, status=400)
        s = SupplierPaymentSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data, status=status.HTTP_201_CREATED)


# ─── Reviews ─────────────────────────────────────────────────────────────────

class ProductReviewListView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Aucune boutique.'}, status=403)
        qs = ProductReview.objects.filter(product__store=store).select_related('product').order_by('-created_at')
        approved = request.query_params.get('approved')
        if approved == '1':
            qs = qs.filter(is_approved=True)
        elif approved == '0':
            qs = qs.filter(is_approved=False)

        page, per_page = parse_pagination(request, default_per_page=10)
        total    = qs.count()
        qs       = qs[(page - 1) * per_page: page * per_page]
        return Response({
            'count':    total,
            'page':     page,
            'per_page': per_page,
            'results':  ProductReviewSerializer(qs, many=True, context={'request': request}).data,
        })

    def post(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Aucune boutique.'}, status=403)
        # Validate product belongs to store
        product_id = request.data.get('product')
        if not product_id or not store.products.filter(pk=product_id).exists():
            return Response({'detail': 'Produit invalide.'}, status=400)
        s = ProductReviewSerializer(data=request.data, context={'request': request})
        s.is_valid(raise_exception=True)
        s.save(is_approved=False)
        return Response(s.data, status=status.HTTP_201_CREATED)


class ProductReviewDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _get(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return ProductReview.objects.get(pk=pk, product__store=store), None
        except ProductReview.DoesNotExist:
            return None, Response({'detail': 'Avis introuvable.'}, status=404)

    def put(self, request, pk):
        review, err = self._get(request, pk)
        if err: return err
        s = ProductReviewSerializer(review, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def delete(self, request, pk):
        review, err = self._get(request, pk)
        if err: return err
        review.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Public Review (no auth — visiteur boutique) ─────────────────────────────

class PublicReviewView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = 'review'

    def post(self, request):
        from stores.models import Store
        store_slug = request.data.get('store_slug')
        if not store_slug:
            return Response({'detail': 'store_slug requis.'}, status=400)
        try:
            store = Store.objects.get(slug=store_slug, is_active=True)
        except Store.DoesNotExist:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        product_id = request.data.get('product')
        if not product_id or not store.products.filter(pk=product_id, is_active=True).exists():
            return Response({'detail': 'Produit invalide.'}, status=400)

        s = ProductReviewSerializer(data=request.data, context={'request': request})
        s.is_valid(raise_exception=True)
        s.save(is_approved=False)
        return Response({'detail': 'Avis soumis. Il sera publié après modération.'}, status=status.HTTP_201_CREATED)


# ─── Public Storefront ────────────────────────────────────────────────────────

def _get_public_store(slug):
    from stores.models import Store
    try:
        return Store.objects.get(slug=slug, is_active=True)
    except Store.DoesNotExist:
        return None


class PublicStoreView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        store = _get_public_store(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        logo_url = request.build_absolute_uri(store.logo.url) if store.logo else None
        try:
            s = store.settings
            theme = {
                'template':  s.theme_template,
                'primary':   s.theme_primary,
                'secondary': s.theme_secondary,
                'font':      s.theme_font,
            }
            menu_items = s.menu_items or []
        except Exception:
            theme = {'template': 'violet', 'primary': '', 'secondary': '', 'font': 'inter'}
            menu_items = []
        pages = list(store.pages.filter(is_published=True).values('id', 'title', 'slug', 'page_type', 'order'))
        pixels = list(store.pixels.filter(is_active=True).values('pixel_type', 'pixel_id'))
        return Response({
            'name':        store.name,
            'slug':        store.slug,
            'description': store.description,
            'meta_title':       store.meta_title,
            'meta_description': store.meta_description,
            'phone':       store.phone,
            'email':       store.email,
            'logo_url':    logo_url,
            'theme':       theme,
            'menu_items':  menu_items,
            'pages':       pages,
            'pixels':      pixels,
        })


class PublicCategoryListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        store = _get_public_store(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        cats = store.categories.filter(is_active=True, is_deleted=False, parent__isnull=True)
        data = [{'id': c.id, 'name': c.name, 'image_url': request.build_absolute_uri(c.image.url) if c.image else None} for c in cats]
        return Response(data)


class PublicProductListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        store = _get_public_store(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        qs = store.products.filter(is_active=True).prefetch_related('images', 'categories')

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(name__icontains=search)

        category = request.query_params.get('category')
        if category:
            qs = qs.filter(categories__id=category, categories__is_active=True)

        min_price = request.query_params.get('min_price')
        max_price = request.query_params.get('max_price')
        if min_price:
            try: qs = qs.filter(price__gte=float(min_price))
            except ValueError: pass
        if max_price:
            try: qs = qs.filter(price__lte=float(max_price))
            except ValueError: pass

        qs = qs.order_by('-created_at').distinct()

        page, per_page = parse_pagination(request, default_per_page=12)
        total    = qs.count()
        qs       = qs[(page - 1) * per_page: page * per_page]

        results = []
        for p in qs:
            first_image = p.images.order_by('order').first()
            image_url = request.build_absolute_uri(first_image.image.url) if first_image and first_image.image else None

            promo = p.active_auto_promotion()
            display_price = p.price
            original_price = None
            if promo:
                display_price = p.price - promo.compute_discount(p.price)
                original_price = p.price

            results.append({
                'id':              p.id,
                'name':            p.name,
                'price':           str(display_price),
                'original_price':  str(original_price) if original_price is not None else None,
                'compare_price':   str(p.compare_price) if p.compare_price else None,
                'image_url':       image_url,
                'categories':      [{'id': c.id, 'name': c.name} for c in p.categories.all()],
                'free_shipping':   p.free_shipping,
            })

        return Response({'count': total, 'page': page, 'per_page': per_page, 'results': results})


class PublicCatalogFeedView(APIView):
    """Flux catalogue public au format attendu par Meta Commerce Catalog
    (RSS 2.0 + espace de noms `g:`, même schéma que Google Merchant Center —
    Epic 8.2 US-8.2.2). Aucune clé API nécessaire côté vendeur pour cette
    brique : Meta vient lire cette URL périodiquement (contrairement à
    Shopify/Google Sheets, mockés en attendant leurs accès API)."""
    permission_classes = [AllowAny]

    def get(self, request, slug):
        from django.http import HttpResponse
        from django.utils.html import escape
        from django.conf import settings

        store = _get_public_store(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        products = store.products.filter(is_active=True).prefetch_related('images')
        store_link = f"{settings.FRONTEND_URL}/store/{store.slug}"

        items = []
        for p in products:
            first_image = p.images.order_by('order').first()
            image_url = request.build_absolute_uri(first_image.image.url) if first_image and first_image.image else ''
            promo = p.active_auto_promotion()
            price = p.price - promo.compute_discount(p.price) if promo else p.price
            availability = 'in stock' if p.total_stock > 0 or p.allow_out_of_stock else 'out of stock'
            items.append(f"""
  <item>
    <g:id>{p.id}</g:id>
    <title>{escape(p.name)}</title>
    <description>{escape(p.description or p.name)}</description>
    <link>{store_link}/products/{p.id}</link>
    <g:image_link>{escape(image_url)}</g:image_link>
    <g:availability>{availability}</g:availability>
    <g:price>{price} DZD</g:price>
    <g:condition>new</g:condition>
    <g:brand>{escape(store.name)}</g:brand>
  </item>""")

        xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>{escape(store.name)}</title>
  <link>{store_link}</link>
  <description>Catalogue produits — {escape(store.name)}</description>{''.join(items)}
</channel>
</rss>"""
        return HttpResponse(xml, content_type='application/xml; charset=utf-8')


class PublicSitemapView(APIView):
    """Sitemap XML standard (accueil, produits, pages publiées) pour
    l'indexation SEO — n'existait pas du tout jusqu'ici, aucun moyen pour un
    moteur de recherche de découvrir les URLs de la boutique publique."""
    permission_classes = [AllowAny]

    def get(self, request, slug):
        from django.http import HttpResponse
        from django.utils.html import escape
        from django.conf import settings

        store = _get_public_store(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)

        store_link = f"{settings.FRONTEND_URL}/store/{store.slug}"
        urls = [store_link, f"{store_link}/products"]
        for p in store.products.filter(is_active=True).values_list('id', flat=True):
            urls.append(f"{store_link}/products/{p}")
        for page_slug in store.pages.filter(is_published=True).values_list('slug', flat=True):
            urls.append(f"{store_link}/pages/{page_slug}")

        entries = ''.join(f"\n  <url><loc>{escape(u)}</loc></url>" for u in urls)
        xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{entries}
</urlset>"""
        return HttpResponse(xml, content_type='application/xml; charset=utf-8')


class PublicProductDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug, pk):
        store = _get_public_store(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        try:
            product = store.products.prefetch_related(
                'images', 'categories', 'variants__options', 'reviews'
            ).get(pk=pk, is_active=True)
        except Product.DoesNotExist:
            return Response({'detail': 'Produit introuvable.'}, status=404)

        images = [
            {'id': img.id, 'url': request.build_absolute_uri(img.image.url), 'order': img.order}
            for img in product.images.order_by('order') if img.image
        ]

        variants = []
        for v in product.variants.order_by('order'):
            options = []
            for opt in v.options.filter(is_active=True).order_by('order'):
                opt_image = request.build_absolute_uri(opt.image.url) if opt.image else None
                options.append({
                    'id': opt.id, 'value': opt.value,
                    'price': str(opt.price) if opt.price else None,
                    'stock': opt.stock, 'allow_out_of_stock': opt.allow_out_of_stock,
                    'image_url': opt_image,
                })
            if options:
                variants.append({'id': v.id, 'name': v.name, 'sub_option_name': v.sub_option_name, 'options': options})

        reviews = [
            {
                'id': r.id,
                'first_name': r.first_name,
                'last_name': r.last_name or '',
                'rating': r.rating,
                'comment': r.comment,
                'image_url': request.build_absolute_uri(r.image.url) if r.image else None,
                'created_at': r.created_at,
            }
            for r in product.reviews.filter(is_approved=True).order_by('-created_at')
        ]

        avg_rating = None
        if reviews:
            avg_rating = round(sum(r['rating'] for r in reviews) / len(reviews), 1)

        promo = product.active_auto_promotion()
        display_price = product.price
        original_price = None
        if promo:
            discount = promo.compute_discount(product.price)
            display_price = product.price - discount
            original_price = product.price

        return Response({
            'id':              product.id,
            'name':            product.name,
            'description':     product.description,
            'meta_title':      product.meta_title,
            'meta_description': product.meta_description,
            'price':           str(display_price),
            'original_price':  str(original_price) if original_price is not None else None,
            'compare_price':   str(product.compare_price) if product.compare_price else None,
            'stock':           product.stock,
            'free_shipping':   product.free_shipping,
            'allow_out_of_stock': product.allow_out_of_stock,
            'categories':      [{'id': c.id, 'name': c.name} for c in product.categories.all()],
            'images':          images,
            'variants':        variants,
            'reviews':         reviews,
            'avg_rating':      avg_rating,
            'reviews_count':   len(reviews),
        })


class PublicPromoValidateView(APIView):
    """Valide un code promo et calcule la réduction réelle pour le panier fourni
    (respecte le scope produits/catégories du coupon, s'il y en a un)."""
    permission_classes = [AllowAny]
    throttle_scope = 'promo'

    def post(self, request, slug, code):
        store = _get_public_store(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        try:
            promo = store.promotions.get(kind='code', code=code.strip().upper())
        except Promotion.DoesNotExist:
            return Response({'detail': 'Code promo introuvable.'}, status=404)
        if not promo.is_valid_now():
            return Response({'detail': "Ce code promo est expiré, inactif ou a atteint son nombre maximum d'utilisations."}, status=400)

        items = request.data.get('items', [])
        discount_amount = promo.compute_discount_for_items(items)
        if discount_amount <= 0:
            return Response({'detail': "Ce code promo ne s'applique à aucun article de votre panier."}, status=400)

        return Response({
            'code':             promo.code,
            'discount_type':    promo.discount_type,
            'discount_value':   str(promo.discount_value),
            'discount_amount':  str(discount_amount),
        })


# ─── Pages publiques ──────────────────────────────────────────────────────────

class PublicStorePageListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        store = _get_public_store(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        pages = store.pages.filter(is_published=True).values('id', 'title', 'slug', 'page_type', 'order')
        return Response(list(pages))


class PublicStorePageView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug, page_slug):
        store = _get_public_store(slug)
        if not store:
            return Response({'detail': 'Boutique introuvable.'}, status=404)
        try:
            from stores.serializers import StorePageSerializer
            page = store.pages.get(slug=page_slug, is_published=True)
            return Response(StorePageSerializer(page).data)
        except Exception:
            return Response({'detail': 'Page introuvable.'}, status=404)
