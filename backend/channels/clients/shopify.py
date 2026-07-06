import requests
from django.conf import settings

from .base import BaseChannelClient, MockChannelClient, SyncResult


class ShopifyClient(MockChannelClient):
    """Client Shopify réel — utilise le token OAuth obtenu via le flux de
    connexion (channels/shopify_oauth.py) une fois le marchand connecté.
    Retombe sur le comportement mocké (MockChannelClient) si la connexion
    n'a pas encore de access_token (ex: connexion créée à l'ancienne, avant
    l'intégration OAuth)."""
    channel_code = 'shopify'

    def _graphql(self, query, variables=None):
        shop = self.connection.shop_url
        url = f"https://{shop}/admin/api/{settings.SHOPIFY_API_VERSION}/graphql.json"
        resp = requests.post(
            url,
            json={'query': query, 'variables': variables or {}},
            headers={
                'X-Shopify-Access-Token': self.connection.access_token,
                'Content-Type': 'application/json',
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        if 'errors' in data:
            raise RuntimeError(str(data['errors']))
        return data['data']

    def push_products(self, products):
        if not self.connection.access_token:
            return super().push_products(products)

        synced = 0
        errors = []
        for product in products:
            try:
                self._graphql(
                    """
                    mutation productSet($input: ProductSetInput!) {
                      productSet(input: $input) {
                        product { id }
                        userErrors { field message }
                      }
                    }
                    """,
                    {'input': {
                        'title': product.name,
                        'descriptionHtml': product.description or '',
                        'productOptions': [{'name': 'Title', 'values': [{'name': 'Default Title'}]}],
                        'variants': [{
                            'price': str(product.price),
                            'sku': product.sku or '',
                            'optionValues': [{'optionName': 'Title', 'name': 'Default Title'}],
                        }],
                    }},
                )
                synced += 1
            except Exception as e:
                errors.append(f"{product.name}: {e}")

        message = f"{synced} produit(s) synchronisé(s) vers Shopify."
        if errors:
            message += f" {len(errors)} échec(s) : " + '; '.join(errors[:5])
        return SyncResult(items_synced=synced, message=message, success=not errors or synced > 0)

    def pull_products(self):
        if not self.connection.access_token:
            return super().pull_products()

        from products.models import Product

        data = self._graphql(
            """
            query {
              products(first: 100) {
                edges {
                  node {
                    title
                    descriptionHtml
                    variants(first: 1) {
                      edges { node { price sku inventoryQuantity } }
                    }
                  }
                }
              }
            }
            """
        )
        edges = data.get('products', {}).get('edges', [])
        store = self.connection.store
        imported = 0
        for edge in edges:
            node = edge['node']
            variant_edges = node.get('variants', {}).get('edges', [])
            variant = variant_edges[0]['node'] if variant_edges else {}
            sku = (variant.get('sku') or '').strip()

            name = node.get('title', 'Produit Shopify')
            defaults = {
                'name': name,
                'description': node.get('descriptionHtml', '') or '',
                'price': variant.get('price') or 0,
                'stock': max(variant.get('inventoryQuantity') or 0, 0),
            }
            if sku:
                _, created = Product.objects.update_or_create(store=store, sku=sku, defaults=defaults)
            else:
                # Pas de SKU côté Shopify — on évite de dupliquer à chaque
                # import en matchant sur le nom, seul repère disponible.
                defaults.pop('name')
                _, created = Product.objects.update_or_create(store=store, sku='', name=name, defaults=defaults)
            if created:
                imported += 1

        return SyncResult(items_synced=len(edges), message=f"{len(edges)} produit(s) importé(s) depuis Shopify ({imported} nouveau(x)).")

    def pull_orders(self):
        # Les commandes arrivent désormais en temps réel via le webhook
        # `orders/create` (voir channels/views.py::ShopifyOrderWebhookView),
        # enregistré automatiquement à la connexion — le pull manuel reste
        # disponible en secours mais n'est pas implémenté pour l'instant.
        if not self.connection.access_token:
            return super().pull_orders()
        return SyncResult(items_synced=0, message="Les commandes Shopify sont importées automatiquement en temps réel via webhook — rien à importer manuellement.")

    def sync_stock(self, product):
        if not self.connection.access_token:
            return super().sync_stock(product)
        # TODO: nécessite de connaître l'inventory_item_id Shopify du produit
        # (à stocker lors du push initial) pour cibler le bon inventoryLevel.
        # Non critique tant que le mapping produit MZSolutions <-> Shopify
        # n'est pas persisté — best-effort, ne bloque jamais la commande.
        return SyncResult(items_synced=0, message="Synchronisation de stock Shopify non encore implémentée (nécessite le mapping produit).", success=True)
