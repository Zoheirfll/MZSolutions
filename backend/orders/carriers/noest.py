from difflib import get_close_matches

import requests
from django.core.cache import cache

from ..wilaya_codes import wilaya_code
from .base import BaseCarrierClient, MockCarrierClient, ShipmentResult
from .ecotrack import TrackingNotFoundError

BASE_URL = 'https://app.noest-dz.com'

# Mapping événement Noest -> statut MZSolutions, construit à partir de la
# table officielle "Liste des événements" (api_documentation_v2_3.pdf, §
# Suivi des commandes). Volontairement partiel : seuls les événements qui
# correspondent sans ambiguïté à une transition connue de notre workflow
# (expédiée/livrée/retournée) sont mappés — le reste (suspendu, échange,
# modifications, paiement...) ne fait avancer que `carrier_status`, jamais
# `Order.status`. Clé = libellé "event" tel que renvoyé par
# `get/trackings/info` (le champ `event_key` n'est pas toujours présent dans
# la réponse, le libellé français l'est systématiquement).
NOEST_STATUS_MAP = {
    'Colis Ramassé':                 'shipped',
    'Reception validé':              'shipped',
    'Enlevé par le livreur':         'shipped',
    'En livraison':                  'shipped',
    'Envoyé en redispatch':          'shipped',
    'Retour remis en livraison':     'shipped',
    'Livré':                         'delivered',
    'Retour demandé par le partenaire':      'returned',
    'Retour En transit':                     'returned',
    'Retour transmis au partenaire':         'returned',
    'Colis retour transmis au partenaire':   'returned',
    'Retour reçu par le partenaire':         'returned',
    'Retour validé par le partenaire':       'returned',
    'Retour transmis vers entrepôt':         'returned',
}


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
            'stop_desk': int(order.stop_desk),
        }
        if order.stop_desk and order.station_code:
            payload['station_code'] = order.station_code
        # Si stop_desk=1 sans station_code (bureau non choisi), Noest
        # renverra une erreur explicite ("Le code station est obligatoire
        # pour une livraison stop desk") plutôt que d'échouer silencieusement.
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

    def _last_activity(self, tracking_number):
        resp = requests.post(
            f"{BASE_URL}/api/public/get/trackings/info",
            json={'trackings': [tracking_number]},
            headers=self._headers(), timeout=15,
        )
        resp.raise_for_status()
        activity = resp.json().get(tracking_number, {}).get('activity', [])
        return activity[-1] if activity else None

    def get_status(self, tracking_number):
        if not self.carrier_account.api_token:
            return 'created'
        try:
            last = self._last_activity(tracking_number)
            if last:
                return last.get('event', 'created')
        except requests.RequestException:
            pass
        return 'created'

    def get_status_info(self, tracking_number):
        if not self.carrier_account.api_token:
            return {'carrier_status': 'created', 'order_status': None}
        try:
            last = self._last_activity(tracking_number)
        except requests.RequestException:
            return {'carrier_status': 'created', 'order_status': None}
        if not last:
            return {'carrier_status': 'created', 'order_status': None}
        label = last.get('event', 'created')
        return {'carrier_status': label, 'order_status': NOEST_STATUS_MAP.get(label)}

    def get_rates(self, wilaya_id):
        if not self.carrier_account.api_token:
            return None
        cache_key = f'noest_fees_{self.carrier_account.id}'
        tarifs = cache.get(cache_key)
        if tarifs is None:
            try:
                resp = requests.get(f"{BASE_URL}/api/public/fees", headers=self._headers(), timeout=10)
                resp.raise_for_status()
                tarifs = resp.json().get('tarifs', {}).get('delivery', {})
            except requests.RequestException:
                return None
            cache.set(cache_key, tarifs, 60 * 60 * 6)  # 6h — les tarifs changent rarement
        entry = tarifs.get(str(wilaya_id))
        if not entry:
            return None
        return {'tarif': float(entry['tarif']), 'tarif_stopdesk': float(entry['tarif_stopdesk'])}

    def get_desks(self, wilaya_id):
        if not self.carrier_account.api_token:
            return []
        cache_key = f'noest_desks_{self.carrier_account.id}'
        desks = cache.get(cache_key)
        if desks is None:
            try:
                resp = requests.get(f"{BASE_URL}/api/public/desks", headers=self._headers(), timeout=10)
                resp.raise_for_status()
                desks = resp.json()
            except requests.RequestException:
                return []
            cache.set(cache_key, desks, 60 * 60 * 24)  # 24h — la liste des bureaux change rarement

        # Le code bureau est préfixé par le numéro de wilaya sur 2 chiffres
        # (ex: "01A" → wilaya 1, "16B" → wilaya 16) — pas de champ wilaya_id
        # explicite dans la réponse Noest, donc dérivé du code lui-même.
        prefix = f"{wilaya_id:02d}"
        return [
            {'code': d['code'], 'name': d['name'], 'address': d['address']}
            for code, d in desks.items() if code.startswith(prefix)
        ]

    def get_label(self, tracking_number):
        if not self.carrier_account.api_token:
            return MockCarrierClient(self.carrier_account).get_label(tracking_number)
        resp = requests.get(
            f"{BASE_URL}/api/public/get/order/label",
            params={'tracking': tracking_number},
            headers=self._headers(),
            timeout=15,
        )
        if resp.status_code in (404, 422):
            raise TrackingNotFoundError(tracking_number)
        resp.raise_for_status()
        return resp.content
