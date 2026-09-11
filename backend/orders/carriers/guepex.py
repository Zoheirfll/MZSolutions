from .dzship import DzshipClient


class GuepexClient(DzshipClient):
    carrier_code = 'guepex'
    dzship_key = 'guepex'
    credential_fields = ('apiId', 'apiToken')
