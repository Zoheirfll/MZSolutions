from rest_framework import serializers
from .models import Category, Product, ProductImage, ProductVariant, VariantOption, Supplier, SupplierCredit, SupplierPayment, ProductReview, Promotion


def _abs_url(request, file_field):
    if file_field and request:
        return request.build_absolute_uri(file_field.url)
    return None


class CategorySerializer(serializers.ModelSerializer):
    children_count = serializers.SerializerMethodField()
    image_url      = serializers.SerializerMethodField()

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


class VariantOptionSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model  = VariantOption
        fields = ['id', 'value', 'price', 'cost_price', 'stock', 'sku',
                  'image', 'image_url', 'allow_out_of_stock', 'is_active', 'order']
        read_only_fields = ['id']

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

    class Meta:
        model  = Product
        fields = [
            'id', 'name', 'description', 'price', 'compare_price', 'cost_price',
            'stock', 'total_stock', 'sku', 'weight',
            'categories', 'category_names', 'supplier', 'supplier_name',
            'free_shipping', 'allow_out_of_stock', 'drop_shipping',
            'is_active', 'created_at', 'images', 'variants', 'sold_count',
        ]
        read_only_fields = ['id', 'created_at']

    def get_category_names(self, obj):
        return [c.name for c in obj.categories.all()]

    def get_supplier_name(self, obj):
        if obj.supplier:
            return f"{obj.supplier.first_name} {obj.supplier.last_name}"
        return None

    def get_sold_count(self, obj):
        return 0  # rempli Sprint 4

    def get_total_stock(self, obj):
        return obj.total_stock

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
