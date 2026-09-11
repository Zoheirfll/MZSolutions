from .dzship import DzshipClient


class SpeedDeliveryClient(DzshipClient):
    carrier_code = 'speeddelivery'
    dzship_key = 'speeddelivery'
    credential_fields = ('token',)
