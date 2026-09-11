from .dzship import DzshipClient


class EcomDzClient(DzshipClient):
    carrier_code = 'ecomdz'
    dzship_key = 'ecomdelivery'
    credential_fields = ('apiKey', 'apiToken')
