from .base import MockCarrierClient


class UpsClient(MockCarrierClient):
    carrier_code = 'ups'
