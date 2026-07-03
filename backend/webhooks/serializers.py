from rest_framework import serializers
from .models import WebhookEndpoint, WebhookLog, IncomingWebhookKey, WEBHOOK_EVENT_CHOICES


class WebhookEndpointSerializer(serializers.ModelSerializer):
    class Meta:
        model  = WebhookEndpoint
        fields = ['id', 'name', 'url', 'events', 'secret', 'is_active',
                  'consecutive_failures', 'last_triggered_at', 'created_at']
        read_only_fields = ['id', 'secret', 'consecutive_failures', 'last_triggered_at', 'created_at']

    def validate_events(self, value):
        valid = dict(WEBHOOK_EVENT_CHOICES)
        for e in value:
            if e not in valid:
                raise serializers.ValidationError(f"Événement inconnu : {e}")
        return value


class WebhookLogSerializer(serializers.ModelSerializer):
    endpoint_name  = serializers.SerializerMethodField()
    direction_label = serializers.SerializerMethodField()

    class Meta:
        model  = WebhookLog
        fields = ['id', 'endpoint', 'endpoint_name', 'direction', 'direction_label',
                  'event', 'payload', 'status_code', 'status', 'message', 'created_at']

    def get_endpoint_name(self, obj):
        return obj.endpoint.name or obj.endpoint.url if obj.endpoint else None

    def get_direction_label(self, obj):
        return obj.get_direction_display()


class IncomingWebhookKeySerializer(serializers.ModelSerializer):
    class Meta:
        model  = IncomingWebhookKey
        fields = ['id', 'key', 'is_active', 'created_at']
        read_only_fields = ['id', 'key', 'created_at']
