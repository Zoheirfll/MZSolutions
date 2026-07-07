from .base import MockCarrierClient


class NoestClient(MockCarrierClient):
    carrier_code = 'noest'
