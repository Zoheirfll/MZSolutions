from dataclasses import dataclass, field


@dataclass
class SyncResult:
    items_synced: int
    message: str
    success: bool = True
    raw_response: dict = field(default_factory=dict)


class BaseChannelClient:
    channel_code = None

    def __init__(self, connection):
        self.connection = connection

    def push_products(self, products):
        """Envoie le catalogue (produits + stock) vers le canal."""
        raise NotImplementedError

    def pull_orders(self):
        """Récupère les commandes passées sur le canal."""
        raise NotImplementedError

    def pull_products(self):
        """Importe les produits existants du canal vers le catalogue MZSolutions."""
        raise NotImplementedError

    def sync_stock(self, product):
        """Pousse le stock d'un seul produit — appelé à chaque commande pour
        éviter la survente (US-8.2.1 AC)."""
        raise NotImplementedError


class MockChannelClient(BaseChannelClient):
    """Client de canal simulé — utilisé tant que les accès API réels
    (app Shopify Partners, compte de service Google) ne sont pas obtenus.
    Même stratégie que MockCarrierClient (orders/carriers/base.py) : aucun
    appel réseau réel, mais l'architecture (modèles, journal, endpoints,
    UI) est complète et prête à brancher le vrai client dès réception des
    accès — il suffira de remplacer le contenu de shopify.py/google_sheets.py."""

    def push_products(self, products):
        count = len(products)
        return SyncResult(items_synced=count, message=f"[MOCK] {count} produit(s) synchronisé(s) — aucun appel réseau réel.")

    def pull_orders(self):
        return SyncResult(items_synced=0, message="[MOCK] Aucune commande distante à importer (client simulé).")

    def pull_products(self):
        return SyncResult(items_synced=0, message="[MOCK] Aucun produit distant à importer (client simulé).")

    def sync_stock(self, product):
        return SyncResult(items_synced=1, message=f"[MOCK] Stock de « {product.name} » synchronisé.")
