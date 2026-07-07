from .ecotrack import EcotrackClient


class UpsClient(EcotrackClient):
    """UPS Algérie est en réalité opéré par Conexlog (revendeur officiel
    UPS en Algérie), sur la même plateforme Ecotrack — domaine différent
    des autres (pas de sous-domaine ecotrack.dz)."""
    carrier_code = 'ups'
    api_domain = 'https://app.conexlog-dz.com/'
