from rest_framework import serializers

from .models import AIConversation, AIMessage, AIPendingAction, AIProductDraft


class AIPendingActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIPendingAction
        fields = ['id', 'tool_name', 'summary', 'payload', 'status', 'expires_at']


class AIProductDraftSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIProductDraft
        fields = ['id', 'source', 'extracted_data', 'status', 'created_at', 'source_image']


class AIMessageSerializer(serializers.ModelSerializer):
    pending_action = AIPendingActionSerializer(read_only=True)

    class Meta:
        model = AIMessage
        fields = ['id', 'role', 'content', 'created_at', 'pending_action']


class AIConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIConversation
        fields = ['id', 'title', 'created_at', 'updated_at']


class AIConversationDetailSerializer(serializers.ModelSerializer):
    messages = AIMessageSerializer(many=True, read_only=True)

    class Meta:
        model = AIConversation
        fields = ['id', 'title', 'created_at', 'updated_at', 'messages']
