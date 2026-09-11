from .dzship import DzshipClient


class NearDeliveryClient(DzshipClient):
    carrier_code = 'near_delivery'
    dzship_key = 'neardelivery'
    credential_fields = ('apiKey', 'apiSecret')
