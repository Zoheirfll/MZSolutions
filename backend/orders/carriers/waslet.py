from .base import MockCarrierClient


class WasletClient(MockCarrierClient):
    carrier_code = 'waslet'
