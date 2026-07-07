from .base import MockCarrierClient


class GuepexClient(MockCarrierClient):
    carrier_code = 'guepex'
