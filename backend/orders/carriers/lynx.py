from .ecotrack import EcotrackClient


class LynxClient(EcotrackClient):
    carrier_code = 'lynx'
    api_domain = 'https://lynx.ecotrack.dz/'
