from .base import MockCarrierClient


class OnTimeClient(MockCarrierClient):
    carrier_code = 'ontime'
