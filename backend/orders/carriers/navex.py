from .ecotrack import EcotrackClient


class NavexClient(EcotrackClient):
    carrier_code = 'navex'
    api_domain = 'https://navexdelivery.ecotrack.dz/'
