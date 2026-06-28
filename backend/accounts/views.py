import random
import string
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.text import slugify
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User, EmailVerificationCode
from .serializers import RegisterSerializer, LoginSerializer, UserSerializer, get_tokens
from stores.models import Store, SubscriptionQuota

token_generator = PasswordResetTokenGenerator()


def _generate_code():
    return ''.join(random.choices(string.digits, k=6))


def _send_verification_email(user, code):
    send_mail(
        subject='MZSolutions — Votre code de vérification',
        message=(
            f"Bonjour {user.first_name},\n\n"
            f"Votre code de vérification est : {code}\n\n"
            f"Ce code expire dans 15 minutes.\n\n"
            f"L'équipe MZSolutions"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.create(serializer.validated_data)

        code = _generate_code()
        EmailVerificationCode.objects.update_or_create(
            user=user, defaults={'code': code}
        )
        _send_verification_email(user, code)

        return Response(
            {'pending_verification': True, 'email': user.email},
            status=status.HTTP_201_CREATED,
        )


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip()
        code = request.data.get('code', '').strip()

        try:
            user = User.objects.get(email=email)
            vc = user.verification_code
        except (User.DoesNotExist, EmailVerificationCode.DoesNotExist):
            return Response({'detail': 'Code invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        if timezone.now() - vc.created_at > timedelta(minutes=15):
            vc.delete()
            return Response({'detail': 'Code expiré. Demandez un nouveau code.'}, status=status.HTTP_400_BAD_REQUEST)

        if vc.code != code:
            return Response({'detail': 'Code incorrect.'}, status=status.HTTP_400_BAD_REQUEST)

        user.is_active = True
        user.is_email_verified = True
        user.save(update_fields=['is_active', 'is_email_verified'])
        vc.delete()

        return Response({
            'user': UserSerializer(user).data,
            **get_tokens(user),
        })


class ResendVerificationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip()
        try:
            user = User.objects.get(email=email, is_email_verified=False)
        except User.DoesNotExist:
            return Response({'detail': 'OK'})  # ne pas révéler

        code = _generate_code()
        EmailVerificationCode.objects.update_or_create(user=user, defaults={'code': code})
        _send_verification_email(user, code)
        return Response({'detail': 'Code renvoyé.'})


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            errors = serializer.errors.get('non_field_errors', [])
            code = errors[0].code if errors else None
            if code == 'email_not_verified':
                return Response(
                    {'detail': str(errors[0]), 'code': 'email_not_verified', 'email': request.data.get('email')},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.validated_data['user']
        return Response({
            'user': UserSerializer(user).data,
            **get_tokens(user),
        })


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


# ── Password reset ──────────────────────────────────────────────────────────

class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip()
        try:
            user = User.objects.get(email=email, is_active=True)
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = token_generator.make_token(user)
            link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
            send_mail(
                subject='MZSolutions — Réinitialisation de votre mot de passe',
                message=(
                    f"Bonjour {user.first_name},\n\n"
                    f"Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe :\n{link}\n\n"
                    f"Ce lien expire dans 1 heure.\n\n"
                    f"Si vous n'avez pas fait cette demande, ignorez cet email.\n\n"
                    f"L'équipe MZSolutions"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
            )
        except User.DoesNotExist:
            pass  # ne pas révéler l'existence du compte
        return Response({'detail': 'Si cet email existe, un lien a été envoyé.'})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        uid = request.data.get('uid', '')
        token = request.data.get('token', '')
        new_password = request.data.get('new_password', '')

        if len(new_password) < 8:
            return Response({'detail': 'Le mot de passe doit contenir au moins 8 caractères.'}, status=400)

        try:
            pk = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=pk)
        except Exception:
            return Response({'detail': 'Lien invalide ou expiré.'}, status=status.HTTP_400_BAD_REQUEST)

        if not token_generator.check_token(user, token):
            return Response({'detail': 'Lien invalide ou expiré.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save(update_fields=['password'])
        return Response({'detail': 'Mot de passe mis à jour avec succès.'})


# ── Google OAuth ────────────────────────────────────────────────────────────

def _verify_google_token(id_token_str):
    info = google_id_token.verify_oauth2_token(
        id_token_str,
        google_requests.Request(),
        settings.GOOGLE_CLIENT_ID,
    )
    return info  # contient: sub, email, given_name, family_name


class GoogleRegisterView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        id_token_str = request.data.get('id_token', '')
        store_name = request.data.get('store_name', '').strip()
        store_slug = slugify(request.data.get('store_slug', '').strip())

        if not store_name or not store_slug:
            return Response({'detail': 'Nom et slug de boutique requis.'}, status=400)

        try:
            info = _verify_google_token(id_token_str)
        except Exception:
            return Response({'detail': 'Token Google invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        email = info.get('email')
        if User.objects.filter(email=email).exists():
            return Response(
                {'detail': 'Un compte existe déjà avec cet email Google. Connectez-vous.'},
                status=status.HTTP_409_CONFLICT,
            )

        if Store.objects.filter(slug=store_slug).exists():
            return Response({'detail': 'Ce slug de boutique est déjà pris.'}, status=400)

        user = User.objects.create(
            email=email,
            first_name=info.get('given_name', ''),
            last_name=info.get('family_name', ''),
            google_id=info.get('sub', ''),
            is_email_verified=True,
            is_active=True,
        )
        user.set_unusable_password()
        user.save()

        store = Store.objects.create(owner=user, name=store_name, slug=store_slug)
        SubscriptionQuota.objects.create(store=store)

        return Response({
            'user': UserSerializer(user).data,
            **get_tokens(user),
        }, status=status.HTTP_201_CREATED)


class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        id_token_str = request.data.get('id_token', '')

        try:
            info = _verify_google_token(id_token_str)
        except Exception:
            return Response({'detail': 'Token Google invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        email = info.get('email')
        try:
            user = User.objects.get(email=email, is_active=True)
        except User.DoesNotExist:
            return Response(
                {'detail': "Aucun compte associé à cet email Google. Veuillez vous inscrire d'abord."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response({
            'user': UserSerializer(user).data,
            **get_tokens(user),
        })
