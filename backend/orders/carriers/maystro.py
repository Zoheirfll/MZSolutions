from .dzship import DzshipClient


class MaystroClient(DzshipClient):
    carrier_code = 'maystro'
    dzship_key = 'maystro'
    credential_fields = ('apiKey',)
