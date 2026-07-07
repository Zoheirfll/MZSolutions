from .base import MockCarrierClient


class WorldexpressClient(MockCarrierClient):
    carrier_code = 'worldexpress'
