from .dzship import DzshipClient


class ZimouExpressClient(DzshipClient):
    carrier_code = 'zimou_express'
    dzship_key = 'zimou'
    credential_fields = ('token',)
