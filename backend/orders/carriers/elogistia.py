from .dzship import DzshipClient


class ElogistiaClient(DzshipClient):
    carrier_code = 'elogistia'
    dzship_key = 'elogistia'
    credential_fields = ('apiKey',)
