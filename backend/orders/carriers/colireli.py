from .base import MockCarrierClient


class ColireliClient(MockCarrierClient):
    carrier_code = 'colireli'
