from .base import MockCarrierClient


class ImirClient(MockCarrierClient):
    carrier_code = 'imir'
