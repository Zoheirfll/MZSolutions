from rest_framework import serializers
from .models import (Store, SubscriptionQuota, SubscriptionPlan, StoreSettings, StorePage,
                      MediaFolder, MediaFile, PixelConfig, PIXEL_TYPE_CHOICES)


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SubscriptionPlan
        fields = ['id', 'name', 'orders_limit', 'price_monthly', 'price_yearly', 'features', 'order']


class PixelConfigSerializer(serializers.ModelSerializer):
    pixel_type_label = serializers.SerializerMethodField()
    access_token               = serializers.CharField(write_only=True, required=False, allow_blank=True)
    access_token_masked        = serializers.SerializerMethodField()
    ga_service_account_json        = serializers.CharField(write_only=True, required=False, allow_blank=True)
    ga_service_account_configured  = serializers.SerializerMethodField()
    ga_api_secret        = serializers.CharField(write_only=True, required=False, allow_blank=True)
    ga_api_secret_masked = serializers.SerializerMethodField()

    class Meta:
        model  = PixelConfig
        fields = ['id', 'pixel_type', 'pixel_type_label', 'pixel_id', 'label', 'is_active', 'created_at',
                  'access_token', 'access_token_masked', 'domain_verification',
                  'ga_view_id', 'ga_service_account_json', 'ga_service_account_configured',
                  'ga_api_secret', 'ga_api_secret_masked']
        read_only_fields = ['id', 'created_at']

    def get_ga_api_secret_masked(self, obj):
        if not obj.ga_api_secret:
            return ''
        return '•' * max(0, len(obj.ga_api_secret) - 4) + obj.ga_api_secret[-4:]

    def get_pixel_type_label(self, obj):
        return dict(PIXEL_TYPE_CHOICES).get(obj.pixel_type, obj.pixel_type)

    def get_access_token_masked(self, obj):
        if not obj.access_token:
            return ''
        return '•' * max(0, len(obj.access_token) - 4) + obj.access_token[-4:]

    def get_ga_service_account_configured(self, obj):
        return bool(obj.ga_service_account_json)


class SubscriptionQuotaSerializer(serializers.ModelSerializer):
    orders_remaining = serializers.ReadOnlyField()
    is_trial_active = serializers.ReadOnlyField()
    is_subscription_active = serializers.ReadOnlyField()
    plan = SubscriptionPlanSerializer(read_only=True)

    class Meta:
        model = SubscriptionQuota
        fields = ['orders_limit', 'orders_used', 'orders_remaining', 'trial_ends_at', 'is_trial_active',
                  'plan', 'billing_cycle', 'period_end', 'is_subscription_active']


class StoreSettingsSerializer(serializers.ModelSerializer):
    sms_api_token        = serializers.CharField(write_only=True, required=False, allow_blank=True)
    sms_api_token_masked = serializers.SerializerMethodField()

    class Meta:
        model  = StoreSettings
        fields = ['low_stock_threshold', 'abandoned_cart_delay_hours',
                  'risk_threshold_orders', 'risk_period_days', 'insurance_fee',
                  'theme_template', 'theme_primary', 'theme_secondary', 'theme_font',
                  'menu_items',
                  'notify_duplicate_orders', 'notify_new_orders',
                  'sms_notifications_enabled', 'order_confirmed_otp_enabled', 'sms_api_token', 'sms_api_token_masked',
                  'deduct_stock_on_order_create',
                  'max_order_amount', 'max_order_quantity', 'order_prefix', 'order_suffix']

    def get_sms_api_token_masked(self, obj):
        if not obj.sms_api_token:
            return ''
        return '•' * max(0, len(obj.sms_api_token) - 4) + obj.sms_api_token[-4:]


class StorePageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = StorePage
        fields = ['id', 'title', 'slug', 'content', 'meta_title', 'meta_description',
                  'page_type', 'is_published', 'order', 'created_at', 'updated_at']
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
        fields = ['id', 'name', 'slug', 'description', 'phone', 'email', 'logo',
                  'meta_title', 'meta_description', 'facebook_url', 'instagram_url', 'twitter_url', 'tiktok_url',
                  'currency', 'currency_symbol', 'is_active', 'created_at', 'quota']
        read_only_fields = ['id', 'created_at', 'quota']

    def validate_slug(self, value):
        from django.utils.text import slugify
        normalized = slugify(value)
        if not normalized:
            raise serializers.ValidationError("Slug invalide.")
        qs = Store.objects.filter(slug=normalized)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Cette URL est déjà utilisée par une autre boutique.")
        return normalized
