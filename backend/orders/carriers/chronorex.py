from .ecotrack import EcotrackClient


class ChronorexClient(EcotrackClient):
    carrier_code = 'chronorex'
    api_domain = 'https://chronorex.ecotrack.dz/'
