from rest_framework import serializers
from .models import (
    Order, OrderItem, OrderStatusHistory, STATUS_CHOICES,
    OrderAssignment, FailureReason, CallAttempt, CALL_STATUS_CHOICES,
    PAYMENT_METHOD_CHOICES,
)


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model  = OrderItem
        fields = ['id', 'product', 'variant_option', 'product_name', 'price', 'quantity']


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()
    status_label    = serializers.SerializerMethodField()

    class Meta:
        model  = OrderStatusHistory
        fields = ['id', 'status', 'status_label', 'changed_by_name', 'changed_at', 'note']

    def get_changed_by_name(self, obj):
        if obj.changed_by:
            return f"{obj.changed_by.first_name} {obj.changed_by.last_name}".strip() or obj.changed_by.email
        return 'Système'

    def get_status_label(self, obj):
        return dict(STATUS_CHOICES).get(obj.status, obj.status)


class FailureReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FailureReason
        fields = ['id', 'label', 'is_active', 'order']
        read_only_fields = ['id']


class OrderAssignmentSerializer(serializers.ModelSerializer):
    confirmateur_name = serializers.SerializerMethodField()
    confirmateur_id   = serializers.SerializerMethodField()

    class Meta:
        model  = OrderAssignment
        fields = ['id', 'confirmateur_id', 'confirmateur_name', 'assigned_at', 'assigned_by']

    def get_confirmateur_name(self, obj):
        if obj.confirmateur:
            return f"{obj.confirmateur.first_name} {obj.confirmateur.last_name}".strip()
        return None

    def get_confirmateur_id(self, obj):
        return obj.confirmateur_id


class CallAttemptSerializer(serializers.ModelSerializer):
    status_label         = serializers.SerializerMethodField()
    failure_reason_label = serializers.SerializerMethodField()
    agent_name           = serializers.SerializerMethodField()

    class Meta:
        model  = CallAttempt
        fields = ['id', 'agent', 'agent_name', 'attempt_number', 'status', 'status_label',
                  'failure_reason', 'failure_reason_label', 'note', 'attempted_at']
        read_only_fields = ['id', 'attempted_at']

    def get_status_label(self, obj):
        return dict(CALL_STATUS_CHOICES).get(obj.status, obj.status)

    def get_failure_reason_label(self, obj):
        return obj.failure_reason.label if obj.failure_reason else None

    def get_agent_name(self, obj):
        if obj.agent:
            return f"{obj.agent.first_name} {obj.agent.last_name}".strip()
        return None


class OrderSerializer(serializers.ModelSerializer):
    items_count          = serializers.SerializerMethodField()
    status_label         = serializers.SerializerMethodField()
    confirmateur_name    = serializers.SerializerMethodField()
    payment_method_label = serializers.SerializerMethodField()

    class Meta:
        model  = Order
        fields = [
            'id', 'status', 'status_label',
            'first_name', 'last_name', 'phone', 'wilaya', 'commune',
            'subtotal', 'shipping_cost', 'total',
            'delivery_type', 'payment_method', 'payment_method_label', 'note',
            'items_count', 'confirmateur_name', 'created_at',
        ]

    def get_items_count(self, obj):
        return obj.items.count()

    def get_status_label(self, obj):
        return dict(STATUS_CHOICES).get(obj.status, obj.status)

    def get_payment_method_label(self, obj):
        return dict(PAYMENT_METHOD_CHOICES).get(obj.payment_method, obj.payment_method)

    def get_confirmateur_name(self, obj):
        try:
            a = obj.assignment
            if a and a.confirmateur:
                return f"{a.confirmateur.first_name} {a.confirmateur.last_name}".strip()
        except Exception:
            pass
        return None


class OrderDetailSerializer(OrderSerializer):
    items         = OrderItemSerializer(many=True, read_only=True)
    history       = OrderStatusHistorySerializer(many=True, read_only=True)
    assignment    = OrderAssignmentSerializer(read_only=True)
    call_attempts = CallAttemptSerializer(many=True, read_only=True)

    class Meta(OrderSerializer.Meta):
        fields = OrderSerializer.Meta.fields + [
            'items', 'history', 'assignment', 'call_attempts', 'address', 'updated_at',
        ]
