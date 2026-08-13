from rest_framework import serializers
from .models import Conversation, Message, CHANNEL_CHOICES, CONVERSATION_STATUS_CHOICES


class MessageSerializer(serializers.ModelSerializer):
    author_name    = serializers.SerializerMethodField()
    status_label   = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model  = Message
        fields = ['id', 'direction', 'body', 'status_change', 'status_label',
                  'author_name', 'attachment', 'attachment_url', 'created_at']
        extra_kwargs = {'attachment': {'write_only': True, 'required': False}}

    def get_author_name(self, obj):
        if obj.author:
            return f"{obj.author.first_name} {obj.author.last_name}".strip() or obj.author.email
        return 'Client'

    def get_status_label(self, obj):
        return dict(CONVERSATION_STATUS_CHOICES).get(obj.status_change, obj.status_change) if obj.status_change else None

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None
        request = self.context.get('request')
        url = obj.attachment.url
        return request.build_absolute_uri(url) if request else url


class ConversationSerializer(serializers.ModelSerializer):
    status_label      = serializers.SerializerMethodField()
    channel_label      = serializers.SerializerMethodField()
    order_display      = serializers.SerializerMethodField()
    order_phone         = serializers.SerializerMethodField()
    messages_count      = serializers.SerializerMethodField()
    assigned_to_name    = serializers.SerializerMethodField()
    days_open           = serializers.SerializerMethodField()

    class Meta:
        model  = Conversation
        fields = ['id', 'channel', 'channel_label', 'order', 'order_display', 'order_phone',
                  'subject', 'status', 'status_label', 'customer_name', 'customer_phone',
                  'messages_count', 'assigned_to_name', 'unread_count', 'days_open',
                  'last_message_at', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_status_label(self, obj):
        return dict(CONVERSATION_STATUS_CHOICES).get(obj.status, obj.status)

    def get_channel_label(self, obj):
        return dict(CHANNEL_CHOICES).get(obj.channel, obj.channel)

    def get_order_display(self, obj):
        if not obj.order_id:
            return None
        return f"#{obj.order_id} — {obj.order.first_name} {obj.order.last_name}".strip()

    def get_order_phone(self, obj):
        return obj.order.phone if obj.order_id else obj.customer_phone

    def get_messages_count(self, obj):
        return obj.messages.count()

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip()
        return None

    def get_days_open(self, obj):
        if obj.status == 'resolved':
            return None
        from django.utils import timezone
        return (timezone.now() - obj.created_at).days


class ConversationDetailSerializer(ConversationSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta(ConversationSerializer.Meta):
        fields = ConversationSerializer.Meta.fields + ['messages']
