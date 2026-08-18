from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            'id', 'actor', 'actor_name', 'actor_role', 'action',
            'target_type', 'target_id', 'target_repr',
            'description', 'metadata', 'created_at',
        ]
