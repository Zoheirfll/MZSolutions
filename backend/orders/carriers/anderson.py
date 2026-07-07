from .ecotrack import EcotrackClient


class AndersonClient(EcotrackClient):
    carrier_code = 'anderson'
    api_domain = 'https://anderson-ecommerce.ecotrack.dz/'
