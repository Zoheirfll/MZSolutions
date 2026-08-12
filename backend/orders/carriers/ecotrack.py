import requests
from django.core.cache import cache

from ..wilaya_codes import wilaya_code
from .base import BaseCarrierClient, MockCarrierClient, ShipmentResult


class TrackingNotFoundError(Exception):
    pass


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
            'stop_desk':   int(order.stop_desk),
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

    def get_label(self, tracking_number):
        if not self.carrier_account.api_token:
            return MockCarrierClient(self.carrier_account).get_label(tracking_number)
        resp = requests.get(
            f"{self.api_domain}api/v1/get/order/label",
            params={'tracking': tracking_number},
            headers=self._headers(),
            timeout=15,
        )
        if resp.status_code == 422:
            raise TrackingNotFoundError(tracking_number)
        resp.raise_for_status()
        return resp.content

    def get_rates(self, wilaya_id):
        # ⚠️ Best-effort, non testé avec un vrai compte (structure de
        # réponse déduite du code source de la lib de référence, pas d'un
        # vrai appel observé) — à vérifier dès qu'un compte Ecotrack réel
        # est disponible pour tester.
        if not self.carrier_account.api_token:
            return None
        cache_key = f'ecotrack_fees_{self.carrier_account.id}'
        rates = cache.get(cache_key)
        if rates is None:
            try:
                resp = requests.get(f"{self.api_domain}api/v1/get/fees", headers=self._headers(), timeout=10)
                resp.raise_for_status()
                rates = resp.json().get('livraison', [])
            except requests.RequestException:
                return None
            cache.set(cache_key, rates, 60 * 60 * 6)
        entry = next((r for r in rates if r.get('wilaya_id') == wilaya_id), None)
        if not entry:
            return None
        home = entry.get('tarif') or entry.get('prix') or entry.get('domicile')
        stopdesk = entry.get('tarif_stopdesk') or entry.get('stopdesk') or entry.get('stop_desk')
        if home is None:
            return None
        return {'tarif': float(home), 'tarif_stopdesk': float(stopdesk) if stopdesk is not None else None}
