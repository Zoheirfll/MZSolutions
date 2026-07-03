from rest_framework import serializers
from .models import DropshipperProduct, Commission, CommissionEntry, CommissionPayment, COMMISSION_TYPE_CHOICES


class DropshipperProductSerializer(serializers.ModelSerializer):
    product_name  = serializers.CharField(source='product.name', read_only=True)
    product_price = serializers.DecimalField(source='product.price', max_digits=12, decimal_places=2, read_only=True)
    product_stock = serializers.IntegerField(source='product.total_stock', read_only=True)

    class Meta:
        model  = DropshipperProduct
        fields = ['id', 'product', 'product_name', 'product_price', 'product_stock', 'created_at']
        read_only_fields = ['id', 'created_at']


class CommissionSerializer(serializers.ModelSerializer):
    product_name           = serializers.CharField(source='product.name', read_only=True)
    dropshipper_name        = serializers.SerializerMethodField()
    commission_type_label   = serializers.SerializerMethodField()

    class Meta:
        model  = Commission
        fields = ['id', 'dropshipper', 'dropshipper_name', 'product', 'product_name',
                  'commission_type', 'commission_type_label', 'value', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_dropshipper_name(self, obj):
        return f"{obj.dropshipper.first_name} {obj.dropshipper.last_name}".strip()

    def get_commission_type_label(self, obj):
        return dict(COMMISSION_TYPE_CHOICES).get(obj.commission_type, obj.commission_type)


class CommissionEntrySerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    order_id     = serializers.IntegerField(source='order_item.order_id', read_only=True)

    class Meta:
        model  = CommissionEntry
        fields = ['id', 'order_id', 'product', 'product_name', 'amount', 'created_at']

    def get_product_name(self, obj):
        return obj.product.name if obj.product else obj.order_item.product_name


class CommissionPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CommissionPayment
        fields = ['id', 'amount', 'note', 'paid_at']
        read_only_fields = ['id', 'paid_at']


class DropshipperSummarySerializer(serializers.Serializer):
    id             = serializers.IntegerField()
    first_name     = serializers.CharField()
    last_name      = serializers.CharField()
    email          = serializers.CharField()
    products_count = serializers.IntegerField()
    total_earned   = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_paid     = serializers.DecimalField(max_digits=12, decimal_places=2)
    balance        = serializers.DecimalField(max_digits=12, decimal_places=2)
