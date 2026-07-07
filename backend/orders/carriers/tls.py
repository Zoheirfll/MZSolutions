from .ecotrack import EcotrackClient


class TlsClient(EcotrackClient):
    carrier_code = 'tls'
    api_domain = 'https://tsl.ecotrack.dz/'
