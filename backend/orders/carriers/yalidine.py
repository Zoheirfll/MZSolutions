import requests
from django.core.cache import cache

from ..wilaya_codes import wilaya_code
from .base import BaseCarrierClient, MockCarrierClient
from .ecotrack import TrackingNotFoundError

BASE_URL = 'https://api.yalidine.app/v1'

# Mapping statut Yalidine (champ `last_status`) -> statut MZSolutions, construit
# à partir de la liste exhaustive et officielle des statuts documentée dans
# yalidine.app/app/dev/docs/api (section Parcels, filtre last_status). Comme
# pour Noest, volontairement partiel : seuls les statuts qui correspondent sans
# ambiguïté à une transition connue (expédiée/livrée/retournée) sont mappés.
YALIDINE_STATUS_MAP = {
    'Ramassé':              'shipped',
    'Transfert':            'shipped',
    'Expédié':              'shipped',
    'Centre':               'shipped',
    'En localisation':      'shipped',
    'Vers Wilaya':          'shipped',
    'En transit':           'shipped',
    'Reçu à Wilaya':        'shipped',
    'Prêt pour livreur':    'shipped',
    'Sorti en livraison':   'shipped',
    'Livré':                'delivered',
    'Retour vers centre':     'returned',
    'Retourné au centre':     'returned',
    'Retour transfert':       'returned',
    'Retour groupé':          'returned',
    'Retour à retirer':       'returned',
    'Retour non retiré':      'returned',
    'Colis abandonné':        'returned',
    'Retour vers vendeur':    'returned',
    'Retourné au vendeur':    'returned',
}


class YalidineClient(BaseCarrierClient):
    """Client réel Yalidine — API REST propre (pas Ecotrack), documentation
    officielle consultée directement sur yalidine.app/app/dev/docs/api (compte
    partenaire, août 2026). Auth par deux headers `X-API-ID`/`X-API-TOKEN` (pas
    Bearer) — `CarrierAccount.api_id` porte l'API ID, `.api_token` porte l'API
    TOKEN, même convention que les autres transporteurs."""
    carrier_code = 'yalidine'

    def _headers(self):
        return {
            'X-API-ID': self.carrier_account.api_id,
            'X-API-TOKEN': self.carrier_account.api_token,
            'Content-Type': 'application/json',
        }

    def _compute_weight(self, order):
        """Somme du poids réel des articles (`Product.weight`, kg, optionnel)
        pondéré par la quantité — retombe sur 1 kg si aucun article de la
        commande n'a de poids renseigné (mêmes valeurs par défaut qu'avant,
        pour ne jamais envoyer 0 à Yalidine)."""
        total = sum(
            (item.product.weight or 0) * item.quantity
            for item in order.items.select_related('product').all()
            if item.product_id and item.product.weight
        )
        return float(total) if total else 1

    def create_shipment(self, order):
        if not self.carrier_account.api_token or not self.carrier_account.api_id:
            return MockCarrierClient(self.carrier_account).create_shipment(order)

        order_ref = f"MZORDER{order.id}"
        weight = self._compute_weight(order)
        payload = [{
            'order_id':          order_ref,
            'from_wilaya_name':  self.carrier_account.departure_wilaya or order.wilaya,
            'firstname':         order.first_name,
            'familyname':        order.last_name or order.first_name,
            'contact_phone':     order.phone,
            'address':           order.address or order.commune or order.wilaya,
            'to_commune_name':   order.commune,
            'to_wilaya_name':    order.wilaya,
            'product_list':      ', '.join(i.product_name for i in order.items.all()) or 'Commande',
            'price':             int(order.total),
            'do_insurance':      False,
            'declared_value':    int(order.total),
            # Longueur/largeur/hauteur non suivies dans notre catalogue produit
            # (aucun champ dimension sur `Product`) — valeurs par défaut sûres
            # (colis standard). Le poids, lui, est réel quand renseigné sur les
            # produits (`Product.weight`, voir `_compute_weight`).
            'length': 10, 'width': 10, 'height': 10, 'weight': weight,
            'freeshipping':      False,
            'is_stopdesk':       bool(order.stop_desk),
            'has_exchange':      False,
            'product_to_collect': None,
        }]
        if order.stop_desk and order.station_code:
            payload[0]['stopdesk_id'] = int(order.station_code)

        resp = requests.post(f"{BASE_URL}/parcels/", json=payload, headers=self._headers(), timeout=15)
        resp.raise_for_status()
        data = resp.json()
        result = data.get(order_ref, {})
        if not result.get('success'):
            raise RuntimeError(result.get('message', 'Erreur Yalidine lors de la création de la commande.'))

        from .base import ShipmentResult
        return ShipmentResult(tracking_number=result['tracking'], status='created', raw_response=data)

    def _parcel_detail(self, tracking_number):
        resp = requests.get(f"{BASE_URL}/parcels/{tracking_number}", headers=self._headers(), timeout=15)
        if resp.status_code == 404:
            raise TrackingNotFoundError(tracking_number)
        resp.raise_for_status()
        data = resp.json()
        # GET /v1/parcels/:tracking renvoie soit l'objet directement, soit une
        # liste paginée `data` selon les cas observés dans la doc — on gère les deux.
        if isinstance(data, dict) and 'data' in data:
            items = data.get('data') or []
            return items[0] if items else None
        return data

    def get_status(self, tracking_number):
        if not self.carrier_account.api_token:
            return 'created'
        try:
            parcel = self._parcel_detail(tracking_number)
            if parcel:
                return parcel.get('last_status', 'created')
        except requests.RequestException:
            pass
        return 'created'

    def get_status_info(self, tracking_number):
        if not self.carrier_account.api_token:
            return {'carrier_status': 'created', 'order_status': None}
        try:
            parcel = self._parcel_detail(tracking_number)
        except requests.RequestException:
            return {'carrier_status': 'created', 'order_status': None}
        if not parcel:
            return {'carrier_status': 'created', 'order_status': None}
        label = parcel.get('last_status', 'created')
        return {'carrier_status': label, 'order_status': YALIDINE_STATUS_MAP.get(label)}

    def get_rates(self, wilaya_id):
        if not self.carrier_account.api_token:
            return None
        from_wilaya_id = wilaya_code(self.carrier_account.departure_wilaya)
        if not from_wilaya_id:
            return None
        cache_key = f'yalidine_fees_{self.carrier_account.id}_{from_wilaya_id}_{wilaya_id}'
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
        try:
            resp = requests.get(
                f"{BASE_URL}/fees/",
                params={'from_wilaya_id': from_wilaya_id, 'to_wilaya_id': wilaya_id},
                headers=self._headers(), timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException:
            return None

        # Le tarif Yalidine est par COMMUNE, pas uniforme par wilaya (contrairement
        # à Noest) — on retombe sur la commune "chef-lieu" (même nom que la wilaya)
        # comme valeur représentative, cohérent avec l'auto-remplissage du champ
        # avant que le client/vendeur n'ait choisi sa commune précise. Approximatif,
        # non vérifié en conditions réelles.
        per_commune = data.get('per_commune', {})
        wilaya_name = data.get('to_wilaya_name', '')
        entry = next((c for c in per_commune.values() if c.get('commune_name') == wilaya_name), None)
        if not entry:
            entry = next(iter(per_commune.values()), None)
        if not entry or entry.get('express_home') is None:
            return None

        result = {'tarif': float(entry['express_home']), 'tarif_stopdesk': float(entry.get('express_desk') or entry['express_home'])}
        cache.set(cache_key, result, 60 * 60 * 6)  # 6h, même durée que Noest
        return result

    def get_desks(self, wilaya_id):
        if not self.carrier_account.api_token:
            return []
        cache_key = f'yalidine_desks_{self.carrier_account.id}_{wilaya_id}'
        desks = cache.get(cache_key)
        if desks is not None:
            return desks
        try:
            resp = requests.get(f"{BASE_URL}/centers/", params={'wilaya_id': wilaya_id}, headers=self._headers(), timeout=10)
            resp.raise_for_status()
            data = resp.json().get('data', [])
        except requests.RequestException:
            return []
        desks = [{'code': str(c['center_id']), 'name': c['name'], 'address': c['address']} for c in data]
        cache.set(cache_key, desks, 60 * 60 * 24)  # 24h — la liste des centres change rarement
        return desks

    def get_label(self, tracking_number):
        if not self.carrier_account.api_token:
            return MockCarrierClient(self.carrier_account).get_label(tracking_number)
        parcel = self._parcel_detail(tracking_number)
        label_url = parcel.get('label') if parcel else None
        if not label_url:
            raise TrackingNotFoundError(tracking_number)
        resp = requests.get(label_url, timeout=15)
        resp.raise_for_status()
        return resp.content
