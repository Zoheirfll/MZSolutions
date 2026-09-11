from .dzship import DzshipClient


class EconomiquaClient(DzshipClient):
    """Plateforme Yalidine chez dzship (même famille que Guepex/Yalitec)."""
    carrier_code = 'economiqua'
    dzship_key = 'economiqua'
    credential_fields = ('apiId', 'apiToken')
