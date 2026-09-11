from .dzship import DzshipClient


class SpeedMailClient(DzshipClient):
    carrier_code = 'speedmail'
    dzship_key = 'speedmail'
    credential_fields = ('token',)
