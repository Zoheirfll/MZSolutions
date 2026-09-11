import requests
from django.core.cache import cache

from ..wilaya_codes import wilaya_code
from .base import BaseCarrierClient, MockCarrierClient, ShipmentResult

BASE_URL = 'https://freeship.dzbuild.com'

# ⚠️ Passerelle tierce (dzbuild.com/dzship, github.com/DZBuild-com/dzship) —
# décision produit 2026-09 : utilisée UNIQUEMENT pour les transporteurs sans
# compte réel chez MZSolutions (donc sans vraie clé API à exposer à un tiers
# non audité). Noest/Yalidine/ZR Express (comptes réels ou API propre
# documentée) ne passent jamais par cette classe — voir CLAUDE.md, section
# Livraison, pour le détail des risques (pas d'audit de sécurité, projet
# jeune, credentials transmis en clair à chaque requête).


class DzshipClient(BaseCarrierClient):
    """Client générique pour tout transporteur routé via l'API gratuite
    dzship (freeship.dzbuild.com) — un seul appel HTTP paramétré par
    `dzship_key` (identifiant du transporteur côté dzship) sert toutes les
    sous-classes, chacune ne définissant que `dzship_key`/`credential_fields`.
    `credential_fields` = tuple des noms de champs attendus par dzship, dans
    l'ordre où ils sont mappés sur `carrier_account.api_id` puis
    `.api_token` (1 champ = api_token seul, 2 champs = api_id puis
    api_token — même convention positionnelle que les autres transporteurs
    à 2 identifiants comme Noest/Yalidine)."""
    dzship_key = None
    credential_fields = ()

    def _credentials(self):
        values = [self.carrier_account.api_id, self.carrier_account.api_token]
        return {name: values[i] for i, name in enumerate(self.credential_fields) if values[i]}

    def _has_credentials(self):
        return len(self._credentials()) == len(self.credential_fields) and bool(self.credential_fields)

    def _call(self, path, body):
        resp = requests.post(f"{BASE_URL}{path}", json=body, timeout=15)
        if resp.status_code >= 400:
            try:
                detail = resp.json().get('message') or resp.text
            except ValueError:
                detail = resp.text
            raise RuntimeError(f"Erreur dzship ({self.dzship_key}) : {detail}")
        return resp.json()

    def create_shipment(self, order):
        if not self._has_credentials():
            return MockCarrierClient(self.carrier_account).create_shipment(order)

        body = {
            'courier': self.dzship_key,
            'credentials': self._credentials(),
            'options': {'fromWilaya': wilaya_code(self.carrier_account.departure_wilaya) or None},
            'order': {
                'fullName':     f"{order.first_name} {order.last_name}".strip() or order.first_name,
                'phone':        order.phone,
                'wilayaCode':   wilaya_code(order.wilaya) or 16,
                'communeName':  order.commune or order.wilaya,
                'addressLine':  (order.address or order.commune or order.wilaya)[:255],
                'deliveryType': 'stopdesk' if order.stop_desk else 'home',
                'stopDeskId':   order.station_code or None,
                'productList':  (', '.join(i.product_name for i in order.items.all()) or 'Commande')[:500],
                'codAmount':    int(order.total),
                'reference':    f"MZORDER{order.id}"[:64],
                'freeShipping': float(order.shipping_cost) == 0,
                'isExchange':   'exchange' in (order.delivery_types or []),
            },
        }
        data = self._call('/v1/orders', body)
        return ShipmentResult(tracking_number=data['trackingNumber'], status=data.get('status', 'created'), raw_response=data)

    def get_status(self, tracking_number):
        if not self._has_credentials():
            return 'created'
        try:
            data = self._call('/v1/track', {
                'courier': self.dzship_key,
                'trackingNumber': tracking_number,
                'credentials': self._credentials(),
            })
            return data.get('status', 'created')
        except (requests.RequestException, RuntimeError):
            return 'created'

    def get_rates(self, wilaya_id):
        if not self._has_credentials():
            return None
        cache_key = f'dzship_rates_{self.carrier_account.id}_{wilaya_id}'
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
        try:
            home = self._call('/v1/rates', {
                'courier': self.dzship_key,
                'credentials': self._credentials(),
                'query': {'toWilaya': wilaya_id, 'deliveryType': 'home'},
            })
            stopdesk = self._call('/v1/rates', {
                'courier': self.dzship_key,
                'credentials': self._credentials(),
                'query': {'toWilaya': wilaya_id, 'deliveryType': 'stopdesk'},
            })
        except (requests.RequestException, RuntimeError):
            return None
        tarif = home.get('price') or home.get('tarif')
        if tarif is None:
            return None
        result = {'tarif': float(tarif), 'tarif_stopdesk': float(stopdesk.get('price') or stopdesk.get('tarif') or tarif)}
        cache.set(cache_key, result, 60 * 60 * 6)
        return result

    def get_label(self, tracking_number):
        # dzship n'expose pas de génération d'étiquette unifiée dans sa doc
        # publique (chaque transporteur garde son propre format) — mock en
        # attendant, même comportement que MdmClient qui n'a pas non plus
        # de label côté dzship (capabilities.label=false).
        return MockCarrierClient(self.carrier_account).get_label(tracking_number)
