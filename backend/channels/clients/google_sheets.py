from .base import MockChannelClient


class GoogleSheetsClient(MockChannelClient):
    channel_code = 'google_sheets'
    # Pour brancher la vraie API Google Sheets (dès obtention d'un compte de
    # service Google avec credentials JSON) : remplacer push_products (écrit
    # les lignes du catalogue) et pull_orders (lit les commandes ajoutées
    # manuellement dans la feuille) ci-dessus par de vrais appels via
    # google-api-python-client, en utilisant self.connection.shop_url comme
    # ID/URL de la feuille. Même principe que shopify.py.
