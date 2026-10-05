"""Suspension d'une boutique par l'admin plateforme (Store.is_active=False).

Source unique de la règle « qui est bloqué » — utilisée par l'authentification
(chaque requête), la connexion, et jamais dupliquée ailleurs. Un compte admin
plateforme n'est jamais bloqué, même s'il possède une boutique suspendue.
"""
from .models import Store


def suspended_store_for_user(user):
    """Renvoie la boutique suspendue dont dépend cet utilisateur (propriétaire ou
    membre d'équipe actif), sinon None."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return None
    if getattr(user, 'is_platform_admin', False) or getattr(user, 'is_platform_superadmin', False):
        return None
    store = Store.objects.filter(owner=user, is_active=False).first()
    if store:
        return store
    from team.models import TeamMember
    member = TeamMember.objects.filter(user=user, is_active=True, store__is_active=False).select_related('store').first()
    return member.store if member else None


def suspension_message(store):
    base = "Cette boutique a été suspendue par l'administration de la plateforme."
    return f"{base} Motif : {store.suspension_reason}" if store.suspension_reason else base
