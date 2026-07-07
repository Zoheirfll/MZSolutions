from .ecotrack import EcotrackClient


class OnTimeClient(EcotrackClient):
    carrier_code = 'ontime'
    api_domain = 'https://ontime.ecotrack.dz/'
