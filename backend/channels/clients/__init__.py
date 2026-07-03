from .shopify import ShopifyClient
from .google_sheets import GoogleSheetsClient

_CLIENTS = {
    'shopify':       ShopifyClient,
    'google_sheets': GoogleSheetsClient,
}


def get_channel_client(connection):
    cls = _CLIENTS.get(connection.channel)
    if not cls:
        raise ValueError(f"Canal inconnu: {connection.channel}")
    return cls(connection)
