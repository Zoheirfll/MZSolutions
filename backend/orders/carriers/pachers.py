from .ecotrack import EcotrackClient


class PachersClient(EcotrackClient):
    carrier_code = 'pachers'
    api_domain = 'https://packers.ecotrack.dz/'
