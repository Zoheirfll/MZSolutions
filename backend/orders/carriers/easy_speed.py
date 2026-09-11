from .dzship import DzshipClient


class EasySpeedClient(DzshipClient):
    carrier_code = 'easy_speed'
    dzship_key = 'easyandspeed'
    credential_fields = ('apiId', 'apiToken')
