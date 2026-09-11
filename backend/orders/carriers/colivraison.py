from .dzship import DzshipClient


class ColivraisonClient(DzshipClient):
    carrier_code = 'colivraison'
    dzship_key = 'colivraison'
    credential_fields = ('publicKey', 'token')
