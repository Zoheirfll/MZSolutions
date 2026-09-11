import requests
from django.core.cache import cache

from .base import BaseCarrierClient, MockCarrierClient, ShipmentResult
from .ecotrack import TrackingNotFoundError

BASE_URL = 'https://api.zrexpress.app/api/v1'

# ⚠️ Implémenté à partir de la documentation officielle seule
# (docs.zrexpress.app, consultée 2026-09), aucun compte réel pour tester —
# même situation que Yalidine avant son premier essai en conditions réelles.
# La doc ne fournit aucune énumération complète des `state.name` possibles
# (un seul exemple observé : "OutForDelivery", "pret_a_expedier") — pas de
# mapping vers nos statuts (`order_status` reste toujours None, comportement
# par défaut sûr de `BaseCarrierClient.get_status_info`) tant qu'un vrai
# compte ne permet pas de lister les libellés réels renvoyés.


class ZRExpressClient(BaseCarrierClient):
    """Client réel ZR Express (nouvelle plateforme, docs.zrexpress.app) — API
    propre distincte d'Ecotrack. Auth par deux headers `X-Tenant`/`X-Api-Key`
    — `CarrierAccount.api_id` porte le tenant ID, `.api_token` porte la clé
    API, même convention que les autres transporteurs. Contrairement à
    Noest/Yalidine (wilaya/commune en texte libre), cette API attend des
    identifiants de territoire (UUID) — résolus via `_resolve_territory()`
    et un identifiant client (UUID) créé à la volée pour chaque expédition."""
    carrier_code = 'zr_express'

    def _headers(self):
        return {
            'X-Tenant': self.carrier_account.api_id,
            'X-Api-Key': self.carrier_account.api_token,
            'Content-Type': 'application/json',
        }

    def _search_territory(self, keyword):
        """`POST /territories/search` — recherche par mot-clé (nom de wilaya
        ou de commune), résultats mis en cache 24h par boutique (la liste des
        territoires ne change quasiment jamais, même durée que le cache
        communes Noest)."""
        keyword = (keyword or '').strip()
        if not keyword:
            return []
        cache_key = f'zrexpress_territory_{self.carrier_account.id}_{keyword.lower()}'
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
        try:
            resp = requests.post(
                f"{BASE_URL}/territories/search",
                json={'keyword': keyword, 'pageNumber': 1, 'pageSize': 20},
                headers=self._headers(), timeout=10,
            )
            resp.raise_for_status()
            items = resp.json().get('items', [])
        except requests.RequestException:
            return []
        cache.set(cache_key, items, 60 * 60 * 24)
        return items

    def _resolve_territory(self, wilaya_name, commune_name):
        """Résout un couple (nom de wilaya, nom de commune) vers
        (cityTerritoryId, districtTerritoryId) — le premier niveau "wilaya"
        trouvé pour `wilaya_name`, et le premier niveau "commune" dont le
        `parentId` correspond à cette wilaya pour `commune_name`. Retombe sur
        (city_id, city_id) si la commune n'est pas trouvée (mieux qu'un échec
        total — laisse la création de colis échouer côté ZR Express avec un
        message explicite plutôt qu'ici silencieusement)."""
        wilaya_matches = [t for t in self._search_territory(wilaya_name) if t.get('level') == 'wilaya']
        if not wilaya_matches:
            return None, None
        city = wilaya_matches[0]
        city_id = city['id']

        commune_matches = [
            t for t in self._search_territory(commune_name)
            if t.get('level') == 'commune' and t.get('parentId') == city_id
        ]
        district_id = commune_matches[0]['id'] if commune_matches else city_id
        return city_id, district_id

    def _create_customer(self, order, city_id, district_id):
        payload = {
            'name': f"{order.first_name} {order.last_name}".strip() or order.first_name,
            'phone': {'number1': order.phone},
            'addresses': [{
                'street': order.address or order.commune or order.wilaya,
                'city': order.wilaya,
                'district': order.commune or order.wilaya,
                'country': 'DZ',
                'cityTerritoryId': city_id,
                'districtTerritoryId': district_id,
                'isPrimary': True,
            }],
        }
        resp = requests.post(f"{BASE_URL}/customers/individual", json=payload, headers=self._headers(), timeout=15)
        resp.raise_for_status()
        return resp.json()['id']

    def create_shipment(self, order):
        if not self.carrier_account.api_token or not self.carrier_account.api_id:
            return MockCarrierClient(self.carrier_account).create_shipment(order)

        city_id, district_id = self._resolve_territory(order.wilaya, order.commune)
        if not city_id:
            raise RuntimeError(f"Wilaya « {order.wilaya} » introuvable chez ZR Express.")

        customer_id = self._create_customer(order, city_id, district_id)

        payload = {
            'customer': {'customerId': customer_id},
            'deliveryAddress': {'cityTerritoryId': city_id, 'districtTerritoryId': district_id},
            'orderedProducts': [{
                'productName': (', '.join(i.product_name for i in order.items.all()) or 'Commande')[:200],
                'unitPrice': float(order.total),
                'quantity': 1,
                'stockType': 'none',
            }],
            'deliveryType': 'pickup-point' if order.stop_desk else 'home',
            'description': f"Commande MZORDER{order.id}"[:250],
            'amount': min(float(order.total), 150000),
            'externalId': f"MZORDER{order.id}",
        }
        if order.stop_desk and order.station_code:
            payload['hubId'] = order.station_code

        resp = requests.post(f"{BASE_URL}/parcels", json=payload, headers=self._headers(), timeout=15)
        resp.raise_for_status()
        data = resp.json()
        parcel_id = data['id']

        # La création ne renvoie que l'UUID interne du colis, pas de numéro
        # de suivi lisible (voir doc createparcelendpoint) — un second appel
        # révèle le vrai `trackingNumber` une fois le colis enregistré.
        tracking_number = parcel_id
        try:
            detail = requests.get(f"{BASE_URL}/parcels/{parcel_id}", headers=self._headers(), timeout=10)
            if detail.status_code == 200:
                tracking_number = detail.json().get('trackingNumber') or parcel_id
        except requests.RequestException:
            pass

        return ShipmentResult(tracking_number=tracking_number, status='created', raw_response=data)

    def _parcel_detail(self, tracking_number):
        resp = requests.get(f"{BASE_URL}/parcels/{tracking_number}", headers=self._headers(), timeout=15)
        if resp.status_code == 404:
            raise TrackingNotFoundError(tracking_number)
        resp.raise_for_status()
        return resp.json()

    def get_status(self, tracking_number):
        if not self.carrier_account.api_token:
            return 'created'
        try:
            parcel = self._parcel_detail(tracking_number)
            return parcel.get('state', {}).get('name', 'created')
        except requests.RequestException:
            return 'created'

    def get_rates(self, wilaya_id):
        if not self.carrier_account.api_token:
            return None
        cache_key = f'zrexpress_rates_{self.carrier_account.id}'
        rates = cache.get(cache_key)
        if rates is None:
            try:
                resp = requests.get(f"{BASE_URL}/delivery-pricing/rates", headers=self._headers(), timeout=10)
                resp.raise_for_status()
                rates = resp.json().get('rates', [])
            except requests.RequestException:
                return None
            cache.set(cache_key, rates, 60 * 60 * 6)  # 6h, même durée que Noest/Yalidine

        entry = next((r for r in rates if r.get('toTerritoryCode') == wilaya_id), None)
        if not entry:
            return None
        prices = {p['deliveryType']: p['price'] for p in entry.get('deliveryPrices', [])}
        home = prices.get('home')
        if home is None:
            return None
        return {'tarif': float(home), 'tarif_stopdesk': float(prices.get('pickup-point', home))}

    def get_label(self, tracking_number):
        if not self.carrier_account.api_token:
            return MockCarrierClient(self.carrier_account).get_label(tracking_number)
        # Réponse JSON avec une URL Azure Blob Storage (fichier HTML, pas un
        # PDF), pas le binaire directement — voir generateindividuallabelsendpoint.
        resp = requests.post(
            f"{BASE_URL}/parcels/labels/individual",
            json={'trackingNumbers': [tracking_number]},
            headers=self._headers(), timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        if tracking_number in (data.get('failedTrackingNumbers') or []):
            raise TrackingNotFoundError(tracking_number)
        files = data.get('parcelLabelFiles') or []
        file_url = next((f['fileUrl'] for f in files if f.get('trackingNumber') == tracking_number), None)
        if not file_url:
            raise TrackingNotFoundError(tracking_number)
        file_resp = requests.get(file_url, timeout=15)
        file_resp.raise_for_status()
        return file_resp.content
