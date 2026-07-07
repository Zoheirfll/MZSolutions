from .ecotrack import EcotrackClient


class ExpediachronoClient(EcotrackClient):
    carrier_code = 'expediachrono'
    api_domain = 'https://expediachrono.ecotrack.dz/'
