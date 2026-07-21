# Page Expéditions (suivi + étiquette transporteur) — Design

## Contexte

La sidebar contient depuis l'Epic 6.1 un lien "Expéditions" désactivé (`DashboardLayout.jsx:400`, `disabled(ICONS.shipping, 'Expéditions')`), gaté par la permission `shipping_settings_view`. C'est un placeholder jamais implémenté. Cette itération le remplace par une vraie page : suivi centralisé des commandes en cours/déjà expédiées, et téléchargement de l'étiquette officielle du transporteur pour chaque commande expédiée.

Ce n'est pas une US du cahier des charges numérotée — c'est un chantier de suivi du Sprint 5 "Livraison" (voir TBD `CLAUDE.md` : "Génération bon de livraison / étiquette").

Contrainte connue : aucun compte transporteur réel n'est configuré à ce stade (`orders/carriers/` utilise `MockCarrierClient` — voir `CLAUDE.md`, section Transporteurs). Cette page doit donc fonctionner de bout en bout avec les comptes mockés existants, et être prête à basculer sur les vrais comptes Ecotrack dès qu'un vendeur en connecte un.

## Découverte clé — endpoint étiquette Ecotrack

L'implémentation actuelle de `EcotrackClient` (`backend/orders/carriers/ecotrack.py`) crée déjà des expéditions via `POST {api_domain}api/v1/create/order`, mais n'a pas de méthode pour récupérer l'étiquette. Recherche effectuée dans la lib de référence PHP open-source **PiteurStudio/CourierDZ** (`src/ProviderIntegrations/EcotrackProviderIntegration.php`, méthode `orderLabel()`), qui documente la même API Ecotrack partagée :

- **`GET {api_domain}api/v1/get/order/label?tracking={tracking_number}`**
- Header : `Authorization: Bearer {token}` (même auth que `create/order`)
- Réponse succès (200) : octets **PDF bruts** directement dans le corps de la réponse HTTP — pas de JSON, pas d'URL, pas de base64 côté API (la lib PHP ré-encode elle-même en base64 pour son propre usage interne, ce n'est pas le format natif de la réponse)
- Réponse 422 : tracking introuvable côté Ecotrack
- Confirmé partagé par tous les fournisseurs Ecotrack de la lib (Anderson, DHD, Worldexpress, Pachers, TLS, etc. — aucun n'override `orderLabel()`), donc applicable aux 17 transporteurs Ecotrack confirmés listés dans `CLAUDE.md`.

Cette découverte suit le même principe que celle déjà documentée dans `CLAUDE.md` pour `create/order` : une seule intégration `EcotrackClient` sert plusieurs transporteurs.

## Périmètre

Inclus :
- Page liste des commandes en statut `confirmed`, `shipped`, `delivered`, `returned` (cycle de vie logistique complet, pas juste l'expédition active), avec filtre statut/transporteur/recherche et pagination.
- Téléchargement de l'étiquette PDF officielle du transporteur pour une commande donnée (bouton par ligne).
- Étiquette mockée (PDF minimal généré, marqué "MOCK") quand le compte transporteur de la commande n'a pas de token réel — cohérent avec `MockCarrierClient.create_shipment()` déjà en place.
- Activation du lien sidebar existant (retrait du `disabled(...)`).

Hors périmètre (explicite) :
- Bon de livraison "maison" généré par MZSolutions (abandonné au profit de l'étiquette officielle réelle, une fois l'endpoint confirmé).
- Envoi de l'étiquette par email.
- Génération/téléchargement en masse (un PDF à la fois).
- `get_status()` / suivi de statut en temps réel via Ecotrack (déjà noté dans `CLAUDE.md` comme non exposé simplement par l'API) — cette page affiche `carrier_status` tel qu'il est déjà stocké sur `Order`, ne l'actualise pas.

## Backend

### `orders/carriers/base.py`
Ajout à `BaseCarrierClient` :
```python
def get_label(self, tracking_number) -> bytes:
    raise NotImplementedError
```
`MockCarrierClient.get_label(tracking_number)` — génère un PDF minimal via `reportlab` (une page, texte "ÉTIQUETTE MOCK", tracking number, nom transporteur) pour permettre de tester le flux complet sans compte réel.

### `orders/carriers/ecotrack.py`
```python
class TrackingNotFoundError(Exception):
    pass

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
```
Les transporteurs non-Ecotrack (Yalidine, ZR Express — API propre, pas encore branchée réellement) : `get_label()` hérité de `BaseCarrierClient` lève `NotImplementedError`, jamais appelé en pratique tant que `api_token` est vide (retombe sur mock au niveau de la vue, voir ci-dessous — même logique que `create_shipment`).

### Nouvelle vue `OrderLabelView` (`orders/views.py`)
`GET /api/orders/<id>/label/`, owner/admin (`is_owner_or_admin`), store-scopé.
- 404 si la commande n'appartient pas à la boutique.
- 400 (`{"detail": "Aucune expédition créée pour cette commande."}`) si `order.carrier_tracking_number` est vide.
- Si `order.carrier` est vide (cas résiduel malgré un tracking rempli — ne devrait pas arriver) : 400 explicite plutôt que crash.
- Résout le client via `get_carrier_client(order.carrier)` (factory existante), appelle `.get_label(order.carrier_tracking_number)`.
- `TrackingNotFoundError` → 404 avec détail clair.
- Toute autre exception réseau (`requests.RequestException`) → 502 avec détail générique ("Impossible de récupérer l'étiquette auprès du transporteur.").
- Succès → `HttpResponse(pdf_bytes, content_type='application/pdf')`, header `Content-Disposition: attachment; filename="etiquette-{order.id}.pdf"`.

### Nouvelle vue `ShipmentListView` (`orders/views.py`)
`GET /api/orders/shipments/?status=&carrier=&search=&page=&per_page=`, owner/admin, store-scopé.
- Base queryset : `Order.objects.filter(store=store, status__in=['confirmed', 'shipped', 'delivered', 'returned'])`.
- `status` (optionnel) : filtre supplémentaire parmi ces 4 valeurs (ignore silencieusement toute autre valeur).
- `carrier` (optionnel) : filtre sur `order.carrier_id`.
- `search` (optionnel) : `first_name`/`last_name`/`phone`/`carrier_tracking_number` (icontains, comme `OrderListCreateView` existant).
- Sérialise avec `OrderSerializer` existant (déjà expose `carrier`, `carrier_tracking_number`, `carrier_status`).
- Pagination `{count, page, per_page, results}` — même contrat que `OrderListCreateView`.

### `requirements.txt`
Ajout de `reportlab` (uniquement pour le PDF mocké — la vraie étiquette Ecotrack est relayée telle quelle, jamais générée par MZSolutions).

## Frontend

### `pages/orders/ShipmentsPage.jsx` (nouvelle page, route `/dashboard/expeditions`)
Même structure que `OrdersPage.jsx` :
- Filtres : `Select` statut (Confirmée/Expédiée/Livrée/Retournée), `Select` transporteur (liste des `CarrierAccount` de la boutique), champ recherche.
- Tableau : commande (#id + lien vers détail), client, wilaya, transporteur, tracking (copiable, comme `api_token_masked` ailleurs), `StatusBadge`, bouton "Étiquette" (icône télécharger).
- Bouton "Étiquette" : `GET /api/orders/<id>/label/` via `api.axios` avec `responseType: 'blob'`, déclenche le téléchargement navigateur (`URL.createObjectURL` + lien `<a download>`). Erreur (400/404/502) → toast avec le message `detail` du backend.
- Pagination standard.

### `DashboardLayout.jsx`
Ligne 400 : remplace `disabled(ICONS.shipping, 'Expéditions')` par `mainLink('/dashboard/expeditions', ICONS.shipping, 'Expéditions')`, toujours gaté par `can('shipping_settings_view')`.

### `App.jsx`
Ajoute la route `/dashboard/expeditions` → `ShipmentsPage`, dans le même bloc que les autres routes `orders/*`.

## Tests (aligné sur la convention Epic 8.7 du projet)

Backend (`orders/tests.py`) :
- `ShipmentListView` : filtre statut correct (une commande `pending` n'apparaît jamais), filtre transporteur, recherche, isolation multi-tenant.
- `OrderLabelView` : 400 si pas de tracking, 200 + `content_type='application/pdf'` avec compte mocké (token vide), 404 si commande d'une autre boutique, mock de `requests.get` pour simuler un vrai compte Ecotrack (200 avec bytes PDF factices, 422 → 404, erreur réseau → 502).

Frontend (`tests/pages/orders/ShipmentsPage.test.jsx`) : rendu liste, filtre statut/transporteur/recherche, clic "Étiquette" déclenche l'appel API avec `responseType: 'blob'`, message d'erreur affiché si l'API renvoie 400.

## Risques / notes de suivi

- L'endpoint `get/order/label` n'a jamais été appelé en conditions réelles (aucun compte Ecotrack actif) — comme le reste de l'intégration Ecotrack listée dans `CLAUDE.md`, à vérifier dès l'obtention d'un vrai token. Le format de réponse (PDF brut, pas de wrapper JSON) vient d'une lib PHP tierce vérifiée en production, donc probablement correct mais pas garanti à 100%.
- Yalidine/ZR Express n'ont pas d'étiquette implémentée dans cette itération (API différente, pas encore de client réel branché) — un vendeur avec un de ces deux transporteurs configuré tombera sur le mock (token vide en pratique aujourd'hui) ou sur `NotImplementedError` si jamais un token y était renseigné manuellement avant que le client réel soit codé. Acceptable pour cette itération, à corriger quand ces transporteurs seront branchés.
