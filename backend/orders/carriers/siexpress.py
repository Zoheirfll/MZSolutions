from .base import MockCarrierClient


class SiexpressClient(MockCarrierClient):
    carrier_code = 'siexpress'
