from rest_framework import serializers
from .models import Store, SubscriptionQuota, StoreSettings


class SubscriptionQuotaSerializer(serializers.ModelSerializer):
    orders_remaining = serializers.ReadOnlyField()
    is_trial_active = serializers.ReadOnlyField()

    class Meta:
        model = SubscriptionQuota
        fields = ['orders_limit', 'orders_used', 'orders_remaining', 'trial_ends_at', 'is_trial_active']


class StoreSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model  = StoreSettings
        fields = ['low_stock_threshold']


class StoreSerializer(serializers.ModelSerializer):
    quota = SubscriptionQuotaSerializer(read_only=True)

    class Meta:
        model = Store
        fields = ['id', 'name', 'slug', 'description', 'phone', 'email', 'logo', 'is_active', 'created_at', 'quota']
        read_only_fields = ['id', 'slug', 'created_at', 'quota']
