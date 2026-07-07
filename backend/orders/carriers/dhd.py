from .ecotrack import EcotrackClient


class DhdClient(EcotrackClient):
    carrier_code = 'dhd'
    api_domain = 'https://dhd.ecotrack.dz/'
