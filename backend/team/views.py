import logging
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from .models import TeamMember, RolePermission, TeamMemberPermission, PERMISSION_CATALOG, PERMISSION_CATEGORIES, ROLES_WITH_PERMISSIONS, get_effective_permissions
import secrets
from .serializers import InviteSerializer, TeamMemberSerializer, AcceptInvitationSerializer
from accounts.serializers import get_tokens, UserSerializer
from core.permissions import IsOwnerOrAdminForWrites, is_owner_or_admin, has_permission
from audit.utils import log_audit

logger = logging.getLogger(__name__)


def _get_store(request):
    try:
        return request.user.store
    except Exception:
        try:
            return request.user.team_membership.store
        except Exception:
            return None


def _send_invite_email(member):
    link = f"{settings.FRONTEND_URL}/accept-invitation?token={member.invite_token}"
    role_label = dict(TeamMember.ROLES).get(member.role, member.role)
    try:
        send_mail(
            subject=f"Invitation à rejoindre {member.store.name} sur MZSolutions",
            message=(
                f"Bonjour {member.first_name},\n\n"
                f"Vous avez été invité(e) à rejoindre la boutique « {member.store.name} » "
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

        permissions_payload = d.get('permissions')
        if permissions_payload:
            role_defaults = get_effective_permissions(store, member.role)
            for key, value in permissions_payload.items():
                if key not in dict(PERMISSION_CATALOG):
                    continue
                if role_defaults.get(key, False) != value:
                    TeamMemberPermission.objects.create(member=member, permission=key, enabled=value)

        _send_invite_email(member)
        log_audit(request, 'team.member_invited', target=member, description=f"Membre invité : {member.first_name} {member.last_name} ({member.role})")

        return Response(TeamMemberSerializer(member).data, status=status.HTTP_201_CREATED)


class TeamListView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def get(self, request):
        # IsOwnerOrAdminForWrites laisse passer la LECTURE à n'importe quel
        # membre authentifié (voir sa docstring) — sans ce garde-fou
        # supplémentaire, n'importe quel confirmateur/dropshipper pouvait
        # lister toute l'équipe (noms, emails, téléphones de ses collègues),
        # `team_view` existait déjà dans le catalogue de permissions mais
        # n'était jamais vérifiée par cette vue précise.
        if not (is_owner_or_admin(request) or has_permission(request, 'team_view')):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Aucune boutique.'}, status=403)
        qs = store.team_members.all()
        role = request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)
        is_active = request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active in ('1', 'true', 'True'))
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
        log_audit(request, 'team.member_updated', target=member, description=f"Membre modifié : {member.first_name} {member.last_name}", metadata={'changed_fields': list(request.data.keys())})
        return Response(serializer.data)

    def delete(self, request, pk):
        member, err = self._get_member(request, pk)
        if err:
            return err
        member.is_active = False
        member.save(update_fields=['is_active'])
        log_audit(request, 'team.member_deactivated', target=member, description=f"Membre désactivé : {member.first_name} {member.last_name}")
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamMemberReactivateView(APIView):
    """Réactive un membre précédemment désactivé — jusqu'ici `is_active` était
    en lecture seule dans le serializer, rendant la désactivation irréversible
    une fois le compte activé (user renseigné). Ne concerne pas les invitations
    jamais acceptées (user=None) — utiliser le renvoi d'invitation pour ce cas."""
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def post(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            member = store.team_members.get(pk=pk)
        except TeamMember.DoesNotExist:
            return Response({'detail': 'Membre introuvable.'}, status=404)
        if member.user_id is None:
            return Response({'detail': "Cette invitation n'a jamais été acceptée — renvoyez l'invitation plutôt que de réactiver."}, status=400)
        member.is_active = True
        member.save(update_fields=['is_active'])
        log_audit(request, 'team.member_reactivated', target=member, description=f"Membre réactivé : {member.first_name} {member.last_name}")
        return Response(TeamMemberSerializer(member).data)


class TeamMemberResendInviteView(APIView):
    """Renvoie l'email d'invitation avec un nouveau token et remet le
    compteur des 48h à zéro — jusqu'ici un lien perdu ou expiré forçait à
    supprimer puis réinviter le membre."""
    permission_classes = [IsAuthenticated, IsOwnerOrAdminForWrites]

    def post(self, request, pk):
        store = _get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        try:
            member = store.team_members.get(pk=pk, user__isnull=True, is_active=False)
        except TeamMember.DoesNotExist:
            return Response({'detail': "Membre introuvable ou déjà activé."}, status=404)
        member.invite_token = secrets.token_urlsafe(32)
        member.invited_at = timezone.now()
        member.save(update_fields=['invite_token', 'invited_at'])
        _send_invite_email(member)
        log_audit(request, 'team.invite_resent', target=member, description=f"Invitation renvoyée à {member.first_name} {member.last_name}")
        return Response(TeamMemberSerializer(member).data)


class AcceptInvitationView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = 'invitation'

    def get(self, request):
        token = request.query_params.get('token', '')
        try:
            member = TeamMember.objects.select_related('store').get(
                invite_token=token, is_active=False, user__isnull=True
            )
        except TeamMember.DoesNotExist:
            return Response({'detail': 'Lien invalide ou déjà utilisé.'}, status=400)
        if member.invite_expired:
            return Response({'detail': "Ce lien d'invitation a expiré (48h). Demandez au propriétaire de la boutique de renvoyer l'invitation."}, status=400)
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


class OnlineStatusView(APIView):
    """Auto-service — un confirmateur (ou tout membre d'équipe) bascule sa
    propre disponibilité et/ou envoie un heartbeat périodique. Pas de
    restriction owner/admin : chacun ne contrôle que son propre statut,
    jamais celui d'un autre membre."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            member = request.user.team_membership
        except Exception:
            return Response({'detail': "Réservé aux membres d'équipe (l'owner n'a pas de statut en ligne)."}, status=400)

        update_fields = ['last_seen_at']
        member.last_seen_at = timezone.now()
        status_changed = False
        if 'online' in request.data:
            new_online = bool(request.data.get('online'))
            status_changed = new_online != member.is_online
            member.is_online = new_online
            update_fields.append('is_online')
        member.save(update_fields=update_fields)
        # Un heartbeat silencieux (sans 'online', ou sans changement réel) ne
        # journalise rien — seul le vrai basculement de disponibilité compte,
        # sinon le journal serait noyé sous un ping/minute par confirmateur.
        if status_changed:
            log_audit(
                request, 'confirmateur.online' if member.is_online else 'confirmateur.offline',
                target=member,
                description=f"{member.first_name} {member.last_name} est passé {'disponible' if member.is_online else 'indisponible'}",
            )
        return Response(TeamMemberSerializer(member).data)


class RolePermissionsView(APIView):
    """Matrice de permissions par rôle (Epic 7.5) — owner/admin uniquement.
    GET renvoie le catalogue complet + les valeurs effectives par rôle ;
    POST fait un upsert d'un seul toggle (role, permission, enabled)."""
    permission_classes = [IsAuthenticated]

    def _get_store(self, request):
        try:
            return request.user.store
        except Exception:
            pass
        try:
            return request.user.team_membership.store
        except Exception:
            return None

    def get(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = self._get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)
        return Response({
            'catalog': [
                {'key': k, 'label': label, 'category': PERMISSION_CATEGORIES.get(k, ('Autres', 'Autres'))[0],
                 'subcategory': PERMISSION_CATEGORIES.get(k, ('Autres', 'Autres'))[1]}
                for k, label in PERMISSION_CATALOG
            ],
            'roles':   ROLES_WITH_PERMISSIONS,
            'matrix':  {role: get_effective_permissions(store, role) for role in ROLES_WITH_PERMISSIONS},
        })

    def post(self, request):
        if not is_owner_or_admin(request):
            return Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = self._get_store(request)
        if not store:
            return Response({'detail': 'Accès refusé.'}, status=403)

        role       = request.data.get('role')
        permission = request.data.get('permission')
        enabled    = bool(request.data.get('enabled'))
        if role not in ROLES_WITH_PERMISSIONS:
            return Response({'detail': f'Rôle invalide. Valeurs : {ROLES_WITH_PERMISSIONS}'}, status=400)
        if permission not in dict(PERMISSION_CATALOG):
            return Response({'detail': 'Permission inconnue.'}, status=400)

        RolePermission.objects.update_or_create(
            store=store, role=role, permission=permission,
            defaults={'enabled': enabled},
        )
        log_audit(
            request, 'team.permission_changed', store=store,
            description=f"Permission « {permission} » {'activée' if enabled else 'désactivée'} pour le rôle {role}",
            metadata={'role': role, 'permission': permission, 'enabled': enabled},
        )
        return Response({'role': role, 'permissions': get_effective_permissions(store, role)})


class TeamMemberPermissionsView(APIView):
    """Overrides de permissions pour un membre précis (au-dessus de la
    matrice par rôle) — owner/admin uniquement. GET renvoie le catalogue
    complet + valeurs effectives + indicateur is_custom ; POST upsert un
    seul toggle (permission, enabled)."""
    permission_classes = [IsAuthenticated]

    def _get_member(self, request, pk):
        if not is_owner_or_admin(request):
            return None, Response({'detail': 'Accès réservé au propriétaire ou administrateur.'}, status=403)
        store = _get_store(request)
        if not store:
            return None, Response({'detail': 'Accès refusé.'}, status=403)
        try:
            return store.team_members.get(pk=pk), None
        except TeamMember.DoesNotExist:
            return None, Response({'detail': 'Membre introuvable.'}, status=404)

    def get(self, request, pk):
        member, err = self._get_member(request, pk)
        if err:
            return err
        store = _get_store(request)
        effective = get_effective_permissions(store, member.role, member=member)
        custom_keys = set(TeamMemberPermission.objects.filter(member=member).values_list('permission', flat=True))
        return Response({
            'catalog': [
                {'key': k, 'label': label, 'enabled': effective.get(k, False), 'is_custom': k in custom_keys,
                 'category': PERMISSION_CATEGORIES.get(k, ('Autres', 'Autres'))[0],
                 'subcategory': PERMISSION_CATEGORIES.get(k, ('Autres', 'Autres'))[1]}
                for k, label in PERMISSION_CATALOG
            ],
        })

    def post(self, request, pk):
        member, err = self._get_member(request, pk)
        if err:
            return err
        store = _get_store(request)
        permission = request.data.get('permission')
        enabled    = bool(request.data.get('enabled'))
        if permission not in dict(PERMISSION_CATALOG):
            return Response({'detail': 'Permission inconnue.'}, status=400)

        TeamMemberPermission.objects.update_or_create(
            member=member, permission=permission,
            defaults={'enabled': enabled},
        )
        log_audit(
            request, 'team.member_permission_changed', target=member,
            description=f"Permission « {permission} » {'activée' if enabled else 'désactivée'} pour {member.first_name} {member.last_name}",
            metadata={'permission': permission, 'enabled': enabled},
        )
        return Response({'permissions': get_effective_permissions(store, member.role, member=member)})
