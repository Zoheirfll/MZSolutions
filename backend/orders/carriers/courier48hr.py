from .ecotrack import EcotrackClient


class Courier48HRClient(EcotrackClient):
    carrier_code = 'courier48hr'
    api_domain = 'https://48hr.ecotrack.dz/'
