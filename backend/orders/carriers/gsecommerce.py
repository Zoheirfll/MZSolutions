from .dzship import DzshipClient


class GsEcommerceClient(DzshipClient):
    carrier_code = 'gsecommerce'
    dzship_key = 'gsecommerce'
    credential_fields = ('token',)
