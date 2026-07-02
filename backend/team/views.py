import logging
from django.conf import settings
from django.core.mail import send_mail
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from .models import TeamMember
from .serializers import InviteSerializer, TeamMemberSerializer, AcceptInvitationSerializer
from accounts.serializers import get_tokens, UserSerializer
from core.permissions import IsOwnerOrAdminForWrites

logger = logging.getLogger(__name__)


def _get_store(request):
    try:
        return request.user.store
    except Exception:
        try:
            return request.user.team_membership.store
        except Exception:
            return None


class InviteView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def post(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Aucune boutique associée.'}, status=403)

        serializer = InviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        member = TeamMember.objects.create(
            store=store,
            role=d['role'],
            first_name=d['first_name'],
            last_name=d['last_name'],
            email=d['email'],
            phone=d.get('phone', ''),
            wilaya=d.get('wilaya', ''),
            commune=d.get('commune', ''),
            address=d.get('address', ''),
        )

        link = f"{settings.FRONTEND_URL}/accept-invitation?token={member.invite_token}"
        role_label = dict(TeamMember.ROLES).get(member.role, member.role)
        try:
            send_mail(
                subject=f"Invitation à rejoindre {store.name} sur MZSolutions",
                message=(
                    f"Bonjour {member.first_name},\n\n"
                    f"Vous avez été invité(e) à rejoindre la boutique « {store.name} » "
                    f"en tant que {role_label}.\n\n"
                    f"Cliquez sur le lien ci-dessous pour activer votre compte :\n{link}\n\n"
                    f"Ce lien expire dans 48h.\n\n"
                    f"L'équipe MZSolutions"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[member.email],
                fail_silently=False,
            )
        except Exception as e:
            logger.error(f"Invitation email failed: {e}")

        return Response(TeamMemberSerializer(member).data, status=status.HTTP_201_CREATED)


class TeamListView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Aucune boutique.'}, status=403)
        qs = store.team_members.all()
        role = request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)
        return Response(TeamMemberSerializer(qs, many=True).data)


class TeamMemberDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def _get_member(self, request, pk):
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.team_members.get(pk=pk), None
        except TeamMember.DoesNotExist:
            return None, Response({'detail': 'Membre introuvable.'}, status=404)

    def put(self, request, pk):
        member, err = self._get_member(request, pk)
        if err:
            return err
        serializer = TeamMemberSerializer(member, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        member, err = self._get_member(request, pk)
        if err:
            return err
        member.is_active = False
        member.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class AcceptInvitationView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = request.query_params.get('token', '')
        try:
            member = TeamMember.objects.select_related('store').get(
                invite_token=token, is_active=False, user__isnull=True
            )
        except TeamMember.DoesNotExist:
            return Response({'detail': 'Lien invalide ou déjà utilisé.'}, status=400)
        return Response({
            'first_name': member.first_name,
            'last_name':  member.last_name,
            'role':       member.role,
            'store_name': member.store.name,
            'email':      member.email,
        })

    def post(self, request):
        serializer = AcceptInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = serializer.save()
        return Response({
            'detail': 'Compte activé avec succès.',
            'user': UserSerializer(member.user).data,
            **get_tokens(member.user),
        })
