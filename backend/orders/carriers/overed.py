from .base import MockCarrierClient


class OveredClient(MockCarrierClient):
    carrier_code = 'overed'
