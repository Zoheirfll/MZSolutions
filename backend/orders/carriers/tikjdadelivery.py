from .ecotrack import EcotrackClient


class TikjdadeliveryClient(EcotrackClient):
    carrier_code = 'tikjdadelivery'
    api_domain = 'https://tikjdadelivery.ecotrack.dz/'
