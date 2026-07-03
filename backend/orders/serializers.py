from rest_framework import serializers
from .models import (
    Order, OrderItem, OrderStatusHistory, STATUS_CHOICES,
    OrderAssignment, FailureReason, CallAttempt, CALL_STATUS_CHOICES,
    PAYMENT_METHOD_CHOICES, AbandonedCart, CarrierAccount, CARRIER_CHOICES,
    BlacklistedPhone, Complaint, ComplaintMessage, COMPLAINT_STATUS_CHOICES,
)


class CarrierAccountSerializer(serializers.ModelSerializer):
    carrier_label     = serializers.SerializerMethodField()
    api_token         = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_token_masked  = serializers.SerializerMethodField()

    class Meta:
        model  = CarrierAccount
        fields = ['id', 'carrier', 'carrier_label', 'name', 'departure_wilaya', 'api_id', 'api_token', 'api_token_masked',
                  'is_active', 'is_default', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_carrier_label(self, obj):
        return dict(CARRIER_CHOICES).get(obj.carrier, obj.carrier)

    def get_api_token_masked(self, obj):
        if not obj.api_token:
            return ''
        return '•' * max(0, len(obj.api_token) - 4) + obj.api_token[-4:]


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
    carrier_label        = serializers.SerializerMethodField()

    class Meta:
        model  = Order
        fields = [
            'id', 'status', 'status_label',
            'first_name', 'last_name', 'phone', 'wilaya', 'commune',
            'subtotal', 'shipping_cost', 'total',
            'delivery_type', 'payment_method', 'payment_method_label', 'note',
            'items_count', 'confirmateur_name', 'created_at',
            'carrier_label', 'carrier_tracking_number', 'carrier_status',
        ]

    def get_items_count(self, obj):
        return obj.items.count()

    def get_status_label(self, obj):
        return dict(STATUS_CHOICES).get(obj.status, obj.status)

    def get_payment_method_label(self, obj):
        return dict(PAYMENT_METHOD_CHOICES).get(obj.payment_method, obj.payment_method)

    def get_carrier_label(self, obj):
        return obj.carrier.get_carrier_display() if obj.carrier else None

    def get_confirmateur_name(self, obj):
        try:
            a = obj.assignment
            if a and a.confirmateur:
                return f"{a.confirmateur.first_name} {a.confirmateur.last_name}".strip()
        except Exception:
            pass
        return None


class AbandonedCartSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AbandonedCart
        fields = [
            'id', 'first_name', 'last_name', 'phone', 'email', 'wilaya',
            'items', 'total', 'reminder_sent', 'reminder_sent_at',
            'is_recovered', 'recovered_at', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'reminder_sent', 'reminder_sent_at', 'is_recovered', 'recovered_at', 'created_at', 'updated_at']


class OrderDetailSerializer(OrderSerializer):
    items         = OrderItemSerializer(many=True, read_only=True)
    history       = OrderStatusHistorySerializer(many=True, read_only=True)
    assignment    = OrderAssignmentSerializer(read_only=True)
    call_attempts = CallAttemptSerializer(many=True, read_only=True)

    class Meta(OrderSerializer.Meta):
        fields = OrderSerializer.Meta.fields + [
            'items', 'history', 'assignment', 'call_attempts', 'address', 'updated_at',
        ]


class BlacklistedPhoneSerializer(serializers.ModelSerializer):
    class Meta:
        model  = BlacklistedPhone
        fields = ['id', 'phone', 'message', 'blocked_attempts', 'last_attempt_at', 'created_at']
        read_only_fields = ['id', 'blocked_attempts', 'last_attempt_at', 'created_at']


class ComplaintMessageSerializer(serializers.ModelSerializer):
    author_name  = serializers.SerializerMethodField()
    status_label = serializers.SerializerMethodField()

    class Meta:
        model  = ComplaintMessage
        fields = ['id', 'message', 'status', 'status_label', 'author_name', 'created_at']

    def get_author_name(self, obj):
        if obj.author:
            return f"{obj.author.first_name} {obj.author.last_name}".strip() or obj.author.email
        return 'Client'

    def get_status_label(self, obj):
        return dict(COMPLAINT_STATUS_CHOICES).get(obj.status, obj.status) if obj.status else None


class ComplaintSerializer(serializers.ModelSerializer):
    status_label   = serializers.SerializerMethodField()
    order_display  = serializers.SerializerMethodField()
    order_phone    = serializers.SerializerMethodField()
    messages_count = serializers.SerializerMethodField()

    class Meta:
        model  = Complaint
        fields = ['id', 'order', 'order_display', 'order_phone', 'subject', 'description',
                  'status', 'status_label', 'messages_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_status_label(self, obj):
        return dict(COMPLAINT_STATUS_CHOICES).get(obj.status, obj.status)

    def get_order_display(self, obj):
        return f"#{obj.order_id} — {obj.order.first_name} {obj.order.last_name}".strip()

    def get_order_phone(self, obj):
        return obj.order.phone

    def get_messages_count(self, obj):
        return obj.messages.count()


class ComplaintDetailSerializer(ComplaintSerializer):
    messages = ComplaintMessageSerializer(many=True, read_only=True)

    class Meta(ComplaintSerializer.Meta):
        fields = ComplaintSerializer.Meta.fields + ['messages']
