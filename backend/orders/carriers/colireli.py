from .ecotrack import EcotrackClient


class ColireliClient(EcotrackClient):
    carrier_code = 'colireli'
    api_domain = 'https://colireli.ecotrack.dz/'
