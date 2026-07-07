from .ecotrack import EcotrackClient


class SiexpressClient(EcotrackClient):
    carrier_code = 'siexpress'
    api_domain = 'https://siexpress.ecotrack.dz/'
