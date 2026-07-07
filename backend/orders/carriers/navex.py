from .base import MockCarrierClient


class NavexClient(MockCarrierClient):
    carrier_code = 'navex'
