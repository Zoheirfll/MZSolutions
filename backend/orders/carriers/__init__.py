from .yalidine import YalidineClient
from .zr_express import ZRExpressClient

_CLIENTS = {
    'yalidine':   YalidineClient,
    'zr_express': ZRExpressClient,
}


def get_carrier_client(carrier_account):
    cls = _CLIENTS.get(carrier_account.carrier)
    if not cls:
        raise ValueError(f"Transporteur inconnu: {carrier_account.carrier}")
    return cls(carrier_account)
