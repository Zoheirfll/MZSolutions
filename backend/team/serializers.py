from django.utils import timezone
from rest_framework import serializers
from .models import TeamMember
from accounts.models import User


class TeamMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeamMember
        fields = [
            'id', 'role', 'first_name', 'last_name', 'email', 'phone',
            'is_active', 'invited_at', 'activated_at',
            'wilaya', 'commune', 'address',
        ]
        read_only_fields = ['id', 'invited_at', 'activated_at', 'is_active']


class InviteSerializer(serializers.Serializer):
    role       = serializers.ChoiceField(choices=TeamMember.ROLES)
    first_name = serializers.CharField(max_length=150)
    last_name  = serializers.CharField(max_length=150)
    email      = serializers.EmailField()
    phone      = serializers.CharField(max_length=20, required=False, allow_blank=True)
    wilaya     = serializers.CharField(max_length=60, required=False, allow_blank=True)
    commune    = serializers.CharField(max_length=60, required=False, allow_blank=True)
    address    = serializers.CharField(required=False, allow_blank=True)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Un compte existe déjà avec cet email.")
        return value


class AcceptInvitationSerializer(serializers.Serializer):
    token    = serializers.CharField()
    password = serializers.CharField(min_length=8)

    def validate_token(self, value):
        try:
            member = TeamMember.objects.get(invite_token=value, is_active=False, user__isnull=True)
        except TeamMember.DoesNotExist:
            raise serializers.ValidationError("Lien d'invitation invalide ou déjà utilisé.")
        self._member = member
        return value

    def save(self):
        member = self._member
        user = User.objects.create(
            email=member.email,
            first_name=member.first_name,
            last_name=member.last_name,
            phone=member.phone,
            is_active=True,
            is_email_verified=True,
        )
        user.set_password(self.validated_data['password'])
        user.save(update_fields=['password'])
        member.user = user
        member.is_active = True
        member.activated_at = timezone.now()
        member.save(update_fields=['user', 'is_active', 'activated_at'])
        return member
