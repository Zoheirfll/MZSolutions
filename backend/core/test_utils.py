"""Utilitaires partagés pour les suites de tests (Epic 8.7) — évite de
dupliquer le boilerplate de création boutique/membre/authentification dans
chaque app. Pas un module de test lui-même (pas de classe Test*)."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from stores.models import Store, SubscriptionQuota
from team.models import TeamMember

User = get_user_model()

_counter = {'n': 0}


def _unique(prefix):
    _counter['n'] += 1
    return f"{prefix}{_counter['n']}"


def make_owner(email=None, store_name=None, store_slug=None):
    """Crée un propriétaire de boutique actif + vérifié, avec quota d'essai."""
    email = email or f"{_unique('owner')}@test.com"
    store_slug = store_slug or _unique('store')
    store_name = store_name or store_slug
    user = User.objects.create_user(
        email=email, password='TestPass123', first_name='Owner', last_name='Test',
        is_active=True, is_email_verified=True,
    )
    store = Store.objects.create(owner=user, name=store_name, slug=store_slug)
    SubscriptionQuota.objects.create(store=store)
    return user, store


def make_team_member(store, role, email=None):
    """Crée un membre d'équipe actif (admin/confirmateur/dropshipper) rattaché à `store`."""
    email = email or f"{_unique(role)}@test.com"
    user = User.objects.create_user(
        email=email, password='TestPass123', first_name=role.capitalize(), last_name='Test',
        is_active=True, is_email_verified=True,
    )
    member = TeamMember.objects.create(
        store=store, user=user, role=role,
        first_name=role.capitalize(), last_name='Test', email=email, is_active=True,
    )
    if role == 'confirmateur':
        # Le round-robin automatique (commandes/réclamations/inbox) ne
        # retient que les confirmateurs "en ligne" — en ligne par défaut
        # dans les fixtures de test pour ne pas casser tous les tests
        # d'auto-assignation existants qui ne testent pas ce comportement.
        member.is_online = True
        member.last_seen_at = timezone.now()
        member.save(update_fields=['is_online', 'last_seen_at'])
    return user, member


def auth_client(user):
    """Client DRF authentifié via un access token JWT frais pour `user`."""
    client = APIClient()
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


def clear_throttle_cache():
    """À appeler en setUp des tests qui frappent des vues throttled (Epic
    8.6) — le cache de throttling est partagé entre méthodes de test au sein
    du même process, sans ça un test peut être 429 à cause d'un test précédent."""
    cache.clear()
