from rest_framework import serializers
from .models import Cost, COST_CATEGORY_CHOICES


class CostSerializer(serializers.ModelSerializer):
    category_label = serializers.SerializerMethodField()

    class Meta:
        model  = Cost
        fields = ['id', 'category', 'category_label', 'label', 'amount',
                  'period_start', 'period_end', 'note', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_category_label(self, obj):
        return dict(COST_CATEGORY_CHOICES).get(obj.category, obj.category)

    def validate(self, data):
        period_start = data.get('period_start', getattr(self.instance, 'period_start', None))
        period_end   = data.get('period_end', getattr(self.instance, 'period_end', None))
        if period_start and period_end and period_end < period_start:
            raise serializers.ValidationError({'period_end': 'La date de fin doit être après la date de début.'})
        return data
