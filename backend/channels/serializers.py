from rest_framework import serializers
from .models import ChannelConnection, ChannelSyncLog, CHANNEL_CHOICES


class ChannelConnectionSerializer(serializers.ModelSerializer):
    """`api_key`/`api_secret` sont écrits mais jamais renvoyés en clair (Epic
    8.6 — `api_key` fuitait auparavant en clair vers le frontend/logs alors
    que seul `api_secret` était protégé) : même pattern que
    `CarrierAccountSerializer.api_token_masked` (orders/serializers.py)."""
    channel_label   = serializers.SerializerMethodField()
    api_key         = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_key_masked  = serializers.SerializerMethodField()
    api_secret      = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_secret_set  = serializers.SerializerMethodField()
    oauth_connected = serializers.SerializerMethodField()

    class Meta:
        model  = ChannelConnection
        fields = ['id', 'channel', 'channel_label', 'shop_url', 'api_key', 'api_key_masked',
                  'api_secret', 'api_secret_set', 'oauth_connected', 'is_active', 'connected_at', 'last_synced_at']
        read_only_fields = ['id', 'connected_at', 'last_synced_at']

    def get_oauth_connected(self, obj):
        return bool(obj.access_token)

    def get_channel_label(self, obj):
        return dict(CHANNEL_CHOICES).get(obj.channel, obj.channel)

    def get_api_key_masked(self, obj):
        if not obj.api_key:
            return ''
        return '•' * max(0, len(obj.api_key) - 4) + obj.api_key[-4:]

    def get_api_secret_set(self, obj):
        return bool(obj.api_secret)


class ChannelSyncLogSerializer(serializers.ModelSerializer):
    channel_label   = serializers.SerializerMethodField()
    direction_label = serializers.SerializerMethodField()

    class Meta:
        model  = ChannelSyncLog
        fields = ['id', 'channel', 'channel_label', 'direction', 'direction_label',
                  'status', 'items_synced', 'message', 'started_at']

    def get_channel_label(self, obj):
        return dict(CHANNEL_CHOICES).get(obj.channel, obj.channel)

    def get_direction_label(self, obj):
        return obj.get_direction_display()
