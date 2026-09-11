from .dzship import DzshipClient


class WeCanClient(DzshipClient):
    """Plateforme Yalidine chez dzship (même famille que Guepex/Yalitec)."""
    carrier_code = 'wecan'
    dzship_key = 'wecan'
    credential_fields = ('apiId', 'apiToken')
