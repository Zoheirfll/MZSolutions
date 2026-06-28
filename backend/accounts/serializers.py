from django.contrib.auth import authenticate
from django.db import transaction
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from stores.models import Store, SubscriptionQuota


class UserSerializer(serializers.ModelSerializer):
    store_slug  = serializers.SerializerMethodField()
    store_name  = serializers.SerializerMethodField()
    team_role   = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'phone',
                  'store_slug', 'store_name', 'team_role', 'is_email_verified']

    def get_store_slug(self, obj):
        try:
            return obj.store.slug
        except Store.DoesNotExist:
            pass
        try:
            return obj.team_membership.store.slug
        except Exception:
            return None

    def get_store_name(self, obj):
        try:
            return obj.store.name
        except Store.DoesNotExist:
            pass
        try:
            return obj.team_membership.store.name
        except Exception:
            return None

    def get_team_role(self, obj):
        try:
            return obj.team_membership.role
        except Exception:
            return None


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, write_only=True)
    store_name = serializers.CharField(max_length=100)
    store_slug = serializers.SlugField(max_length=80)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Un compte avec cet email existe déjà.")
        return value

    def validate_store_slug(self, value):
        if Store.objects.filter(slug=value).exists():
            raise serializers.ValidationError("Ce slug de boutique est déjà pris.")
        return slugify(value)

    @transaction.atomic
    def create(self, validated_data):
        store_name = validated_data.pop('store_name')
        store_slug = validated_data.pop('store_slug')
        password = validated_data.pop('password')

        user = User(**validated_data)
        user.set_password(password)
        user.is_active = False
        user.is_email_verified = False
        user.save()

        store = Store.objects.create(owner=user, name=store_name, slug=store_slug)
        SubscriptionQuota.objects.create(store=store)

        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(username=data['email'], password=data['password'])
        if not user:
            raise serializers.ValidationError("Email ou mot de passe incorrect.")
        if not user.is_email_verified:
            raise serializers.ValidationError(
                "Veuillez vérifier votre email avant de vous connecter.",
                code='email_not_verified',
            )
        if not user.is_active:
            raise serializers.ValidationError("Ce compte est désactivé.")
        data['user'] = user
        return data


def get_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }
