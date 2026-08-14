from rest_framework import serializers
from .models import Category, Product, ProductImage, ProductVariant, VariantOption, VariantSubOption, Supplier, SupplierCredit, SupplierPayment, ProductReview, Promotion, StockMovement


def _abs_url(request, file_field):
    if file_field and request:
        return request.build_absolute_uri(file_field.url)
    return None


def _can_view_purchase_prices(context):
    """Masque cost_price (prix d'achat) si l'utilisateur n'a pas la
    permission 'purchase_prices_view' (Epic 7.5) — donnée sensible jamais
    gatée avant cette epic."""
    request = context.get('request')
    if not request:
        return True
    from core.permissions import has_permission
    return has_permission(request, 'purchase_prices_view')


class CategorySerializer(serializers.ModelSerializer):
    children_count = serializers.SerializerMethodField()
    image_url      = serializers.SerializerMethodField()
    # Explicite pour contourner un piège DRF : sur une requête multipart/
    # form-data (QueryDict), un BooleanField absent de la requête est traité
    # comme False (mimique une case à cocher HTML décochée) plutôt que de
    # retomber sur le default=True du modèle — n'affecte pas l'UI actuelle
    # (le formulaire envoie toujours is_active explicitement) mais casserait
    # silencieusement tout futur appelant qui omettrait le champ.
    is_active = serializers.BooleanField(required=False, default=True)

    class Meta:
        model  = Category
        fields = ['id', 'name', 'image', 'image_url', 'parent', 'is_active', 'is_deleted', 'created_at', 'children_count']
        read_only_fields = ['id', 'created_at']

    def get_children_count(self, obj):
        return obj.children.filter(is_deleted=False).count()

    def get_image_url(self, obj):
        return _abs_url(self.context.get('request'), obj.image)


class ProductImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model  = ProductImage
        fields = ['id', 'image', 'image_url', 'order']

    def get_image_url(self, obj):
        return _abs_url(self.context.get('request'), obj.image)


class VariantSubOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = VariantSubOption
        fields = ['id', 'value', 'price', 'cost_price', 'stock', 'sku',
                  'dropshipping_price', 'minimum_selling_price',
                  'allow_out_of_stock', 'is_active', 'order']
        read_only_fields = ['id']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not _can_view_purchase_prices(self.context):
            data.pop('cost_price', None)
        return data


class VariantOptionSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    sub_options = VariantSubOptionSerializer(many=True, read_only=True)

    class Meta:
        model  = VariantOption
        fields = ['id', 'value', 'price', 'cost_price', 'stock', 'sku',
                  'image', 'image_url', 'allow_out_of_stock', 'is_active', 'order', 'sub_options']
        read_only_fields = ['id']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not _can_view_purchase_prices(self.context):
            data.pop('cost_price', None)
        return data

    def get_image_url(self, obj):
        return _abs_url(self.context.get('request'), obj.image)


class ProductVariantSerializer(serializers.ModelSerializer):
    options = VariantOptionSerializer(many=True, read_only=True)

    class Meta:
        model  = ProductVariant
        fields = ['id', 'name', 'sub_option_name', 'order', 'options']
        read_only_fields = ['id']


class SupplierCreditSerializer(serializers.ModelSerializer):
    supplier_name = serializers.SerializerMethodField()

    class Meta:
        model  = SupplierCredit
        fields = ['id', 'supplier', 'supplier_name', 'amount', 'note', 'date', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_supplier_name(self, obj):
        return f"{obj.supplier.first_name} {obj.supplier.last_name}"


class SupplierPaymentSerializer(serializers.ModelSerializer):
    supplier_name = serializers.SerializerMethodField()

    class Meta:
        model  = SupplierPayment
        fields = ['id', 'supplier', 'supplier_name', 'amount', 'note', 'date', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_supplier_name(self, obj):
        return f"{obj.supplier.first_name} {obj.supplier.last_name}"


class SupplierSerializer(serializers.ModelSerializer):
    balance        = serializers.SerializerMethodField()
    total_credits  = serializers.SerializerMethodField()
    total_payments = serializers.SerializerMethodField()

    class Meta:
        model  = Supplier
        fields = ['id', 'first_name', 'last_name', 'email', 'phone', 'address',
                  'created_at', 'total_credits', 'total_payments', 'balance']
        read_only_fields = ['id', 'created_at']

    def _totals(self, obj):
        from django.db.models import Sum
        c = obj.credits.aggregate(t=Sum('amount'))['t'] or 0
        p = obj.payments.aggregate(t=Sum('amount'))['t'] or 0
        return float(c), float(p)

    def get_total_credits(self, obj):
        c, _ = self._totals(obj)
        return c

    def get_total_payments(self, obj):
        _, p = self._totals(obj)
        return p

    def get_balance(self, obj):
        c, p = self._totals(obj)
        return c - p


class ProductReviewSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    image_url    = serializers.SerializerMethodField()

    class Meta:
        model  = ProductReview
        fields = ['id', 'product', 'product_name',
                  'first_name', 'last_name', 'email',
                  'rating', 'comment',
                  'image', 'image_url',
                  'is_approved', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_product_name(self, obj):
        return obj.product.name

    def get_image_url(self, obj):
        return _abs_url(self.context.get('request'), obj.image)

    def validate_rating(self, value):
        if not (1 <= value <= 5):
            raise serializers.ValidationError('La note doit être entre 1 et 5.')
        return value


class ProductSerializer(serializers.ModelSerializer):
    images         = ProductImageSerializer(many=True, read_only=True)
    variants       = ProductVariantSerializer(many=True, read_only=True)
    categories     = serializers.PrimaryKeyRelatedField(many=True, queryset=Category.objects.all(), required=False)
    category_names = serializers.SerializerMethodField()
    supplier_name  = serializers.SerializerMethodField()
    sold_count     = serializers.SerializerMethodField()
    total_stock    = serializers.SerializerMethodField()
    active_promotion = serializers.SerializerMethodField()

    class Meta:
        model  = Product
        fields = [
            'id', 'name', 'description', 'price', 'compare_price', 'cost_price',
            'stock', 'total_stock', 'sku', 'weight',
            'categories', 'category_names', 'supplier', 'supplier_name',
            'free_shipping', 'allow_out_of_stock', 'drop_shipping',
            'offer_enabled', 'offer_quantity', 'offer_price',
            'specific_shipping_enabled', 'specific_shipping_home_price', 'specific_shipping_desk_price',
            'dropshipping_price', 'minimum_selling_price',
            'stock_alert_1', 'stock_alert_2', 'stock_alert_3',
            'has_position', 'position_range', 'position_stage', 'position_slot',
            'show_title', 'show_images', 'show_full_price', 'show_discounted_price',
            'show_countdown', 'countdown_end',
            'is_active', 'created_at', 'images', 'variants', 'sold_count',
            'active_promotion', 'meta_title', 'meta_description',
            'meta_keywords', 'meta_robots', 'og_image', 'og_image_url', 'twitter_image', 'twitter_image_url',
        ]
        read_only_fields = ['id', 'created_at']

    og_image_url = serializers.SerializerMethodField()
    twitter_image_url = serializers.SerializerMethodField()

    def get_og_image_url(self, obj):
        return _abs_url(self.context.get('request'), obj.og_image)

    def get_twitter_image_url(self, obj):
        return _abs_url(self.context.get('request'), obj.twitter_image)

    def get_category_names(self, obj):
        return [c.name for c in obj.categories.all()]

    def get_active_promotion(self, obj):
        promo = obj.active_auto_promotion()
        if not promo:
            return None
        discounted_price = obj.price - promo.compute_discount(obj.price)
        return {
            'name': promo.name,
            'discount_type': promo.discount_type,
            'discount_value': str(promo.discount_value),
            'discounted_price': str(discounted_price),
        }

    def get_supplier_name(self, obj):
        if obj.supplier:
            return f"{obj.supplier.first_name} {obj.supplier.last_name}"
        return None

    def get_sold_count(self, obj):
        return 0  # rempli Sprint 4

    def get_total_stock(self, obj):
        return obj.total_stock

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not _can_view_purchase_prices(self.context):
            data.pop('cost_price', None)
        return data

    def validate(self, data):
        store    = self.context.get('store')
        sku      = data.get('sku', '')
        instance = self.instance
        if store and sku:
            qs = Product.objects.filter(store=store, sku=sku)
            if instance:
                qs = qs.exclude(pk=instance.pk)
            if qs.exists():
                raise serializers.ValidationError({'sku': 'Ce SKU est déjà utilisé dans cette boutique.'})
        return data


class PromotionSerializer(serializers.ModelSerializer):
    products   = serializers.PrimaryKeyRelatedField(many=True, queryset=Product.objects.all(), required=False)
    categories = serializers.PrimaryKeyRelatedField(many=True, queryset=Category.objects.all(), required=False)
    product_names   = serializers.SerializerMethodField()
    category_names  = serializers.SerializerMethodField()

    class Meta:
        model  = Promotion
        fields = ['id', 'name', 'kind', 'code', 'discount_type', 'discount_value',
                  'starts_at', 'ends_at', 'max_uses', 'uses_count', 'is_active',
                  'products', 'product_names', 'categories', 'category_names', 'created_at']
        read_only_fields = ['id', 'uses_count', 'created_at']

    def get_product_names(self, obj):
        return [p.name for p in obj.products.all()]

    def get_category_names(self, obj):
        return [c.name for c in obj.categories.all()]

    def validate(self, data):
        kind = data.get('kind', getattr(self.instance, 'kind', None))
        code = data.get('code', getattr(self.instance, 'code', ''))
        products   = data.get('products',   getattr(self.instance, 'products',   None))
        categories = data.get('categories', getattr(self.instance, 'categories', None))

        if kind == 'code':
            if not code:
                raise serializers.ValidationError({'code': 'Le code est requis pour un code promo.'})
            data['code'] = code.strip().upper()
        elif kind == 'auto':
            has_products   = products.exists() if hasattr(products, 'exists') else bool(products)
            has_categories = categories.exists() if hasattr(categories, 'exists') else bool(categories)
            if not has_products and not has_categories:
                raise serializers.ValidationError('Sélectionnez au moins un produit ou une catégorie pour une offre automatique.')

        store    = self.context.get('store')
        instance = self.instance
        if store and kind == 'code' and data.get('code'):
            qs = Promotion.objects.filter(store=store, kind='code', code=data['code'])
            if instance:
                qs = qs.exclude(pk=instance.pk)
            if qs.exists():
                raise serializers.ValidationError({'code': 'Ce code est déjà utilisé dans cette boutique.'})
        return data


class StockMovementSerializer(serializers.ModelSerializer):
    reason_label = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    option_value = serializers.SerializerMethodField()
    option_group = serializers.SerializerMethodField()

    class Meta:
        model  = StockMovement
        fields = ['id', 'product', 'product_name', 'variant_option', 'option_value', 'option_group',
                  'quantity', 'stock_before', 'stock_after', 'reason', 'reason_label', 'note', 'created_at']

    def get_reason_label(self, obj):
        return obj.get_reason_display()

    def get_product_name(self, obj):
        return obj.product.name

    def get_option_value(self, obj):
        return obj.variant_option.value if obj.variant_option else None

    def get_option_group(self, obj):
        return obj.variant_option.variant.name if obj.variant_option else None
