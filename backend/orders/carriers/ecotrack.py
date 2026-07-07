import requests

from ..wilaya_codes import wilaya_code
from .base import BaseCarrierClient, MockCarrierClient, ShipmentResult


class EcotrackClient(BaseCarrierClient):
    """Client réel pour tout transporteur bâti sur la plateforme partagée
    Ecotrack (ecotrack.dz) — 19+ sociétés de livraison algériennes
    (Anderson, DHD, Worldexpress, Pachers, TSL...) utilisent la même API,
    seul le sous-domaine et le token diffèrent. Une seule intégration sert
    donc plusieurs transporteurs : chaque sous-classe ne définit que
    `api_domain`. Retombe sur le mock si aucun token n'est configuré.
    Référence : https://github.com/PiteurStudio/CourierDZ (implémentation
    PHP open-source vérifiée, même contrat d'API)."""
    api_domain = None  # doit se terminer par '/', ex: 'https://anderson.ecotrack.dz/'

    def _headers(self):
        return {
            'Authorization': f'Bearer {self.carrier_account.api_token}',
            'Content-Type': 'application/json',
        }

    def create_shipment(self, order):
        if not self.carrier_account.api_token:
            return MockCarrierClient(self.carrier_account).create_shipment(order)

        payload = {
            'reference':   str(order.id),
            'nom_client':  f"{order.first_name} {order.last_name}".strip(),
            'telephone':   order.phone,
            'adresse':     order.address or order.commune or order.wilaya,
            'commune':     order.commune or order.wilaya,
            'code_wilaya': wilaya_code(order.wilaya) or 16,
            'montant':     float(order.total),
            'remarque':    order.note or '',
            'produit':     ', '.join(i.product_name for i in order.items.all()) or 'Commande',
            'type':        1,  # 1 = Livraison
            'stop_desk':   0,
        }
        resp = requests.post(f"{self.api_domain}api/v1/create/order", json=payload, headers=self._headers(), timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if data.get('success') is False:
            raise RuntimeError(data.get('message', 'Erreur Ecotrack lors de la création de l\'expédition.'))
        tracking = data.get('tracking') or data.get('tracking_number') or ''
        return ShipmentResult(tracking_number=tracking, status='created', raw_response=data)

    def get_status(self, tracking_number):
        # Ecotrack n'expose pas d'endpoint public simple de suivi par statut
        # dans l'API documentée — à affiner si besoin (webhooks Ecotrack,
        # voir CLAUDE.md).
        return 'created'
