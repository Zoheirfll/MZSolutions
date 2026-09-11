from .dzship import DzshipClient


class YalitecClient(DzshipClient):
    carrier_code = 'yalitec'
    dzship_key = 'yalitec'
    credential_fields = ('apiId', 'apiToken')
