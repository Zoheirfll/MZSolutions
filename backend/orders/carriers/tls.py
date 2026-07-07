from .base import MockCarrierClient


class TlsClient(MockCarrierClient):
    carrier_code = 'tls'
