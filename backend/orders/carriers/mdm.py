from .dzship import DzshipClient


class MdmClient(DzshipClient):
    """MDM Express via dzship — pas de tarifs ni de labels côté dzship
    (`capabilities.rates`/`label` = false), `get_rates`/`get_label`
    retombent donc sur le comportement par défaut (None / mock)."""
    carrier_code = 'mdm'
    dzship_key = 'mdm'
    credential_fields = ('apiKey',)

    def get_rates(self, wilaya_id):
        return None
