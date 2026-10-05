"""Modules (fonctionnalités) activables/désactivables par l'admin plateforme — globalement ou par
boutique. Un module est actif sauf s'il figure dans la liste globale (`PlatformSettings
.disabled_features`) OU dans celle de la boutique (`Store.disabled_features`). En cas de doute
(table absente, erreur) le module reste actif : une panne de configuration ne doit jamais couper
le service d'un vendeur."""
from django.core.cache import cache

FEATURES = {
    'ai': 'Assistant IA',
    'webhooks': 'Webhooks sortants',
    'channels': 'Canaux de vente',
}
CACHE_KEY = 'platform-disabled-features'
CACHE_SECONDS = 30


def global_disabled():
    cached = cache.get(CACHE_KEY)
    if cached is not None:
        return cached
    try:
        from platform_admin.system_models import PlatformSettings
        value = [k for k in PlatformSettings.load().disabled_features if k in FEATURES]
    except Exception:
        return []
    cache.set(CACHE_KEY, value, CACHE_SECONDS)
    return value


def clear_cache():
    cache.delete(CACHE_KEY)


def feature_enabled(store, key):
    if key in global_disabled():
        return False
    try:
        return key not in (store.disabled_features or [])
    except Exception:
        return True
