from .base import MockChannelClient


class ShopifyClient(MockChannelClient):
    channel_code = 'shopify'
    # Pour brancher la vraie API Shopify Admin (dès obtention des accès
    # Shopify Partners) : remplacer push_products/pull_orders/sync_stock
    # ci-dessus par de vrais appels REST/GraphQL, en utilisant
    # self.connection.shop_url / api_key / api_secret. Le reste du système
    # (ChannelConnection, ChannelSyncLog, endpoints, UI) n'a pas besoin de
    # changer — même principe que orders/carriers/yalidine.py.
