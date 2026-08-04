from rest_framework.throttling import UserRateThrottle


class AuthenticatedUserRateThrottle(UserRateThrottle):
    """Filet de sécurité par utilisateur authentifié (Sécurité — point 14) —
    ignore complètement les requêtes anonymes (retourne None au lieu de
    retomber sur l'IP comme UserRateThrottle par défaut). Les endpoints publics
    sensibles ont déjà leur propre throttle_scope dédié (order/complaint/...) ;
    faire retomber en plus ce throttle générique sur l'IP anonyme ferait
    partager UNE seule liste de timestamps à tout le trafic anonyme derrière
    une même IP/NAT — coût croissant par requête (comportement quadratique
    sous fort volume), constaté concrètement : la suite de tests est passée de
    ~5 min à un blocage de 36+ min avant ce correctif, tous les appels anonymes
    des tests partageant la même IP 127.0.0.1."""

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return super().get_cache_key(request, view)
