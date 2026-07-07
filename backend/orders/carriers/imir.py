from .ecotrack import EcotrackClient


class ImirClient(EcotrackClient):
    carrier_code = 'imir'
    api_domain = 'https://imir.ecotrack.dz/'
