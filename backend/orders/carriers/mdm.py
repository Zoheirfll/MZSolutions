from .base import MockCarrierClient


class MdmClient(MockCarrierClient):
    carrier_code = 'mdm'
