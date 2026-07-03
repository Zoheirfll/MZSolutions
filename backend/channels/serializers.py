from rest_framework import serializers
from .models import ChannelConnection, ChannelSyncLog, CHANNEL_CHOICES


class ChannelConnectionSerializer(serializers.ModelSerializer):
    channel_label   = serializers.SerializerMethodField()
    api_secret      = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_secret_set  = serializers.SerializerMethodField()

    class Meta:
        model  = ChannelConnection
        fields = ['id', 'channel', 'channel_label', 'shop_url', 'api_key', 'api_secret', 'api_secret_set',
                  'is_active', 'connected_at', 'last_synced_at']
        read_only_fields = ['id', 'connected_at', 'last_synced_at']

    def get_channel_label(self, obj):
        return dict(CHANNEL_CHOICES).get(obj.channel, obj.channel)

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
