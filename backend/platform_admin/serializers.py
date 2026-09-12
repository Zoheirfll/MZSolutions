from django.utils import timezone
from rest_framework import serializers

from accounts.models import User
from .models import PlatformConfirmationAccount, PlatformConfirmateur, PlatformConfirmateurAssignment


class StoreConfirmationSerializer(serializers.ModelSerializer):
    store_id         = serializers.IntegerField(source='store.id', read_only=True)
    store_name       = serializers.CharField(source='store.name', read_only=True)
    store_slug       = serializers.CharField(source='store.slug', read_only=True)
    store_owner_email = serializers.CharField(source='store.owner.email', read_only=True)

    class Meta:
        model = PlatformConfirmationAccount
        fields = ['id', 'store_id', 'store_name', 'store_slug', 'store_owner_email',
                  'is_active', 'mode', 'note', 'activated_at', 'created_at']
        read_only_fields = ['id', 'activated_at', 'created_at']


class StoreListItemSerializer(serializers.Serializer):
    """Toute boutique de la plateforme, avec son état de service de
    confirmation s'il existe déjà (jamais créé tant que le superadmin ne l'a
    pas activée au moins une fois)."""
    id              = serializers.IntegerField()
    name            = serializers.CharField()
    slug            = serializers.CharField()
    owner_email     = serializers.SerializerMethodField()
    confirmation    = serializers.SerializerMethodField()

    def get_owner_email(self, store):
        try:
            return store.owner.email
        except Exception:
            return None

    def get_confirmation(self, store):
        account = getattr(store, 'platform_confirmation_account', None)
        if account is None:
            return None
        return StoreConfirmationSerializer(account).data


class PlatformConfirmateurSerializer(serializers.ModelSerializer):
    invite_expired = serializers.ReadOnlyField()
    is_activated   = serializers.SerializerMethodField()

    class Meta:
        model = PlatformConfirmateur
        fields = ['id', 'first_name', 'last_name', 'email', 'phone',
                  'is_active', 'invited_at', 'activated_at', 'invite_expired', 'is_activated']
        read_only_fields = ['id', 'invited_at', 'activated_at']

    def get_is_activated(self, obj):
        return obj.user_id is not None


class PlatformConfirmateurInviteSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name  = serializers.CharField(max_length=150)
    email      = serializers.EmailField()
    phone      = serializers.CharField(max_length=20, required=False, allow_blank=True)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Un compte existe déjà avec cet email.")
        if PlatformConfirmateur.objects.filter(email__iexact=value, user__isnull=True).exists():
            raise serializers.ValidationError("Une invitation est déjà en attente pour cet email.")
        return value


class PlatformAcceptInvitationSerializer(serializers.Serializer):
    token    = serializers.CharField()
    password = serializers.CharField(min_length=8)

    def validate_token(self, value):
        try:
            confirmateur = PlatformConfirmateur.objects.get(invite_token=value, user__isnull=True)
        except PlatformConfirmateur.DoesNotExist:
            raise serializers.ValidationError("Lien d'invitation invalide ou déjà utilisé.")
        if confirmateur.invite_expired:
            raise serializers.ValidationError("Ce lien d'invitation a expiré (48h). Demandez au superadmin de renvoyer l'invitation.")
        self._confirmateur = confirmateur
        return value

    def save(self):
        confirmateur = self._confirmateur
        user = User.objects.create(
            email=confirmateur.email,
            first_name=confirmateur.first_name,
            last_name=confirmateur.last_name,
            phone=confirmateur.phone,
            is_active=True,
            is_email_verified=True,
        )
        user.set_password(self.validated_data['password'])
        user.save(update_fields=['password'])
        confirmateur.user = user
        confirmateur.activated_at = timezone.now()
        confirmateur.save(update_fields=['user', 'activated_at'])
        return confirmateur


class PlatformConfirmateurAssignmentSerializer(serializers.ModelSerializer):
    confirmateur_name = serializers.SerializerMethodField()
    store_name        = serializers.CharField(source='account.store.name', read_only=True)
    store_id          = serializers.IntegerField(source='account.store.id', read_only=True)

    class Meta:
        model = PlatformConfirmateurAssignment
        fields = ['id', 'confirmateur', 'confirmateur_name', 'account', 'store_id', 'store_name',
                  'is_active', 'assigned_at']
        read_only_fields = ['id', 'assigned_at']

    def get_confirmateur_name(self, obj):
        return f"{obj.confirmateur.first_name} {obj.confirmateur.last_name}"
