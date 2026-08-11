from difflib import get_close_matches

import requests
from django.core.cache import cache

from ..wilaya_codes import wilaya_code
from .base import BaseCarrierClient, MockCarrierClient, ShipmentResult

BASE_URL = 'https://app.noest-dz.com'


class NoestClient(BaseCarrierClient):
    """Client réel Noest Express — API propre (pas Ecotrack), confirmée via
    documentation officielle obtenue directement du compte partenaire
    (api_documentation_v2_3.pdf, mai 2026). Auth par Bearer token + un GUID
    partenaire transmis dans le corps de chaque requête. `carrier_account.api_id`
    porte le GUID, `.api_token` porte le token Bearer — même convention que
    les autres transporteurs (champs "Clé API"/"Jeton API" dans l'UI)."""
    carrier_code = 'noest'

    def _headers(self):
        return {
            'Authorization': f'Bearer {self.carrier_account.api_token}',
            'Content-Type': 'application/json',
        }

    def _resolve_commune(self, wilaya_id, commune_name):
        """Noest rejette toute commune qui ne correspond pas EXACTEMENT à sa
        base (ex: 'Bab Ezzouar' saisi par le client vs 'Bab Azzouar' chez
        Noest — repéré en testant une vraie commande). Corrige
        automatiquement via la liste officielle du transporteur, avec un
        rapprochement flou (orthographe proche) en dernier recours."""
        commune_name = (commune_name or '').strip()
        if not commune_name:
            return commune_name

        cache_key = f'noest_communes_{self.carrier_account.id}_{wilaya_id}'
        communes = cache.get(cache_key)
        if communes is None:
            try:
                resp = requests.get(f"{BASE_URL}/api/public/get/communes/{wilaya_id}", headers=self._headers(), timeout=10)
                communes = [c['nom'] for c in resp.json()] if resp.status_code == 200 else []
            except requests.RequestException:
                communes = []
            cache.set(cache_key, communes, 60 * 60 * 24)  # 24h — la liste des communes ne change quasiment jamais

        if not communes or commune_name in communes:
            return commune_name

        matches = get_close_matches(commune_name, communes, n=1, cutoff=0.6)
        return matches[0] if matches else commune_name

    def create_shipment(self, order):
        if not self.carrier_account.api_token or not self.carrier_account.api_id:
            return MockCarrierClient(self.carrier_account).create_shipment(order)

        user_guid = self.carrier_account.api_id
        wid = wilaya_code(order.wilaya) or 16
        payload = {
            'user_guid': user_guid,
            'reference': f"MZORDER{order.id}",  # min. 5 caractères exigés par Noest
            'client':    f"{order.first_name} {order.last_name}".strip(),
            'phone':     order.phone,
            'adresse':   order.address or order.commune or order.wilaya,
            'wilaya_id': wid,
            'commune':   self._resolve_commune(wid, order.commune or order.wilaya),
            'montant':   float(order.total),
            'remarque':  order.note or '',
            'produit':   ', '.join(i.product_name for i in order.items.all()) or 'Commande',
            'type_id':   1,  # 1 = Livraison
            'stop_desk': 0,  # livraison à domicile par défaut
        }
        resp = requests.post(f"{BASE_URL}/api/public/create/order", json=payload, headers=self._headers(), timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if not data.get('success'):
            raise RuntimeError(data.get('message', 'Erreur Noest lors de la création de la commande.'))
        tracking = data['tracking']

        # Sans validation, la commande n'est pas transmise à la logistique
        # (reste "brouillon" côté Noest) — on valide immédiatement pour
        # obtenir un comportement équivalent aux autres transporteurs
        # (expédition effectivement prise en charge dès la confirmation).
        try:
            requests.post(
                f"{BASE_URL}/api/public/valid/order",
                json={'user_guid': user_guid, 'tracking': tracking},
                headers=self._headers(), timeout=15,
            )
        except requests.RequestException:
            pass  # la commande existe déjà chez Noest même si la validation échoue

        return ShipmentResult(tracking_number=tracking, status='created', raw_response=data)

    def get_status(self, tracking_number):
        if not self.carrier_account.api_token:
            return 'created'
        try:
            resp = requests.post(
                f"{BASE_URL}/api/public/get/trackings/info",
                json={'trackings': [tracking_number]},
                headers=self._headers(), timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            activity = data.get(tracking_number, {}).get('activity', [])
            if activity:
                return activity[-1].get('event', 'created')
        except requests.RequestException:
            pass
        return 'created'
