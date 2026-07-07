from .base import MockCarrierClient


class SpeedMailClient(MockCarrierClient):
    carrier_code = 'speedmail'
