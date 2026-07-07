from .ecotrack import EcotrackClient


class AssilDeliveryClient(EcotrackClient):
    carrier_code = 'assil_delivery'
    api_domain = 'https://assildelivery.ecotrack.dz/'
