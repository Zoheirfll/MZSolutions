from rest_framework import serializers
from .models import Store, SubscriptionQuota, StoreSettings, StorePage, MediaFolder, MediaFile, PixelConfig, PIXEL_TYPE_CHOICES


class PixelConfigSerializer(serializers.ModelSerializer):
    pixel_type_label = serializers.SerializerMethodField()

    class Meta:
        model  = PixelConfig
        fields = ['id', 'pixel_type', 'pixel_type_label', 'pixel_id', 'label', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_pixel_type_label(self, obj):
        return dict(PIXEL_TYPE_CHOICES).get(obj.pixel_type, obj.pixel_type)


class SubscriptionQuotaSerializer(serializers.ModelSerializer):
    orders_remaining = serializers.ReadOnlyField()
    is_trial_active = serializers.ReadOnlyField()

    class Meta:
        model = SubscriptionQuota
        fields = ['orders_limit', 'orders_used', 'orders_remaining', 'trial_ends_at', 'is_trial_active']


class StoreSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model  = StoreSettings
        fields = ['low_stock_threshold', 'abandoned_cart_delay_hours',
                  'risk_threshold_orders', 'risk_period_days',
                  'theme_template', 'theme_primary', 'theme_secondary', 'theme_font',
                  'menu_items']


class StorePageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = StorePage
        fields = ['id', 'title', 'slug', 'content', 'page_type', 'is_published', 'order', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class MediaFolderSerializer(serializers.ModelSerializer):
    file_count = serializers.SerializerMethodField()

    class Meta:
        model  = MediaFolder
        fields = ['id', 'name', 'file_count', 'created_at']

    def get_file_count(self, obj):
        return obj.files.count()


class MediaFileSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model  = MediaFile
        fields = ['id', 'folder', 'original_name', 'size', 'mime_type', 'url', 'created_at']

    def get_url(self, obj):
        request = self.context.get('request')
        return request.build_absolute_uri(obj.file.url) if obj.file and request else None


class StoreSerializer(serializers.ModelSerializer):
    quota = SubscriptionQuotaSerializer(read_only=True)

    class Meta:
        model = Store
        fields = ['id', 'name', 'slug', 'description', 'phone', 'email', 'logo', 'is_active', 'created_at', 'quota']
        read_only_fields = ['id', 'slug', 'created_at', 'quota']
