# Intégration transporteurs (Yalidine + ZR Express) — Design

## Contexte

MZSolutions doit permettre à un vendeur de connecter ses comptes transporteurs (Yalidine, ZR Express) et de faire créer automatiquement l'expédition dès qu'une commande passe au statut "Confirmée". C'est l'Epic 6.1 du cahier des charges (US-6.1.1 — connexion des comptes transporteurs, US-6.1.2 — création automatique de l'expédition), aligné avec le Sprint 5 "Livraison" du planning `CLAUDE.md`.

Les accès API réels (identifiants Yalidine / ZR Express) ne sont pas encore obtenus (cf. section Risques de `CLAUDE.md`). Cette itération construit donc l'architecture complète avec des clients transporteurs mockés, prêts à être branchés sur les vraies API dès que les accès seront disponibles.

Périmètre choisi : US-6.1.1 + US-6.1.2 complètes, limitées à Yalidine et ZR Express (pas Waslet/Imir/Guepex pour l'instant), avec clients API mockés.

## Architecture

Un module `backend/orders/carriers/` définit une interface commune à tous les transporteurs :

```
backend/orders/carriers/
  __init__.py       — get_carrier_client(carrier_account) factory
  base.py            — BaseCarrierClient (create_shipment, get_status)
  yalidine.py        — YalidineClient(BaseCarrierClient) — mock pour l'instant
  zr_express.py       — ZRExpressClient(BaseCarrierClient) — mock pour l'instant
```

- `BaseCarrierClient.create_shipment(order) -> ShipmentResult(tracking_number, status, raw_response)`
- `BaseCarrierClient.get_status(tracking_number) -> str`
- Les implémentations mock génèrent un tracking number factice (`f"MOCK-{carrier}-{order.id}-{uuid4().hex[:6]}"`) et retournent le statut `"created"` — pas d'appel réseau réel.
- Chaque client réel (futur) lira `CarrierAccount.api_id` / `api_token` pour s'authentifier. Le switch mock/réel se fera via un attribut de config (`settings.CARRIER_MODE = "mock" | "live"`), pas par transporteur individuellement.

## Modèles de données

### `orders.CarrierAccount` (nouveau modèle)

```
store (FK → Store)
carrier (choices: "yalidine", "zr_express")
api_id (CharField)
api_token (CharField)
is_active (BooleanField, default True)
is_default (BooleanField, default False)
created_at
```
Contrainte : un seul `CarrierAccount` avec `is_default=True` par boutique (appliqué en code lors du save, pas en contrainte DB — pattern similaire au soft-delete de Category).
Contrainte unique : (`store`, `carrier`) — un compte par transporteur par boutique.

### `orders.Order` (champs ajoutés)

```
carrier (FK → CarrierAccount, nullable, on_delete=SET_NULL)
carrier_tracking_number (CharField, blank)
carrier_status (CharField, blank)
carrier_shipment_created_at (DateTimeField, nullable)
```

## Logique métier

Le point d'entrée est la vue existante de changement de statut (`POST /api/orders/{id}/status/`, `backend/orders/views.py`). Quand le nouveau statut est `confirmed` :

1. Résoudre le transporteur à utiliser : `carrier_id` optionnel dans le payload de la requête, sinon le `CarrierAccount` par défaut de la boutique (`is_default=True, is_active=True`).
2. Si aucun compte actif n'est trouvé : la commande passe quand même à "Confirmée", la réponse inclut `{"carrier_warning": "Aucun transporteur configuré — expédition non créée."}`. Pas d'erreur bloquante (404/400).
3. Si un compte est trouvé : appeler `get_carrier_client(account).create_shipment(order)`, stocker `carrier`, `carrier_tracking_number`, `carrier_status`, `carrier_shipment_created_at` sur l'Order. Toute exception du client transporteur est catchée et renvoyée comme `carrier_warning` sans bloquer le changement de statut.
4. Le changement de statut reste atomique (`@transaction.atomic`) pour la partie DB ; l'appel transporteur se fait après le commit du changement de statut pour ne pas bloquer la transaction sur un appel réseau (pattern déjà en place ailleurs dans `orders/views.py` pour Chargily).

Un changement de statut vers `confirmed` alors qu'une expédition existe déjà (`carrier_tracking_number` déjà rempli) ne recrée pas d'expédition — idempotent.

## Endpoints API

| Méthode | URL | Auth | Description |
|---|---|---|---|
| GET/POST | `/api/stores/me/carriers/` | Oui (owner/admin) | Liste des comptes transporteurs de la boutique / en créer un |
| PUT/DELETE | `/api/stores/me/carriers/<id>/` | Oui (owner/admin) | Modifier (dont `is_default`) / supprimer un compte |
| POST | `/api/orders/{id}/status/` | Oui | Existant, étendu : accepte `carrier_id` optionnel dans le body |

Isolation multi-tenant : toutes les vues carriers filtrent par `_get_store(request)`, suivant le pattern existant de `stores/views.py`.

Sérialisation : `api_token` n'est jamais renvoyé en clair dans les réponses GET (masqué, ex: `****abcd`) — writable uniquement en POST/PUT.

## Frontend

### Nouvelle page `frontend/src/pages/ParametresLivraisonPage.jsx`

- Reprend le style visuel RiseCart vu en capture : grille de cartes transporteur (logo Yalidine, logo ZR Express) avec bouton "Ajouter" ou badge "Connecté" + toggle "Par défaut" si déjà connecté.
- Clic "Ajouter" → modale avec champs API ID / API Token, bouton Enregistrer → `POST /api/stores/me/carriers/`.
- Utilise `theme.js` pour les styles, suit le pattern des autres pages Paramètres (ex: `StockPage.jsx`).
- Ajout d'une entrée sidebar dans `DashboardLayout.jsx` ("Paramètres livraison").

### `OrderDetailPage.jsx` (modification)

- Dans le panneau de changement de statut, quand le nouveau statut sélectionné est "Confirmée" et que plusieurs `CarrierAccount` actifs existent, afficher un sélecteur de transporteur (sinon le défaut est utilisé silencieusement).
- Après confirmation, si `carrier_tracking_number` est présent sur la commande, l'afficher avec le nom du transporteur. Si `carrier_warning` est retourné, l'afficher en warning non bloquant (toast ou bandeau).

## Hors périmètre (explicitement exclu de cette itération)

- Waslet, Imir, Guepex et autres transporteurs du screenshot RiseCart.
- Vrais appels réseau vers les API Yalidine/ZR Express (accès non obtenus).
- Calcul automatique des frais de livraison par wilaya (reste Sprint 5/6 futur, `shipping_cost` continue d'être saisi manuellement pour l'instant).
- Génération de bon de livraison / étiquette PDF.
- Webhooks de mise à jour de statut transporteur (`get_status` existe dans l'interface mais n'est pas encore appelé automatiquement).

## Vérification / test end-to-end

1. Migrations : `python manage.py makemigrations orders && python manage.py migrate`
2. Backend : créer un `CarrierAccount` via `POST /api/stores/me/carriers/`, le marquer par défaut, puis changer le statut d'une commande existante à `confirmed` via `POST /api/orders/{id}/status/` — vérifier que `carrier_tracking_number` (préfixé `MOCK-`) est bien peuplé.
3. Backend : sans aucun `CarrierAccount`, refaire le même test — vérifier que le statut passe bien à `confirmed` et que la réponse contient `carrier_warning` sans erreur 4xx/5xx.
4. Frontend : ouvrir `/parametres-livraison`, ajouter un compte Yalidine (clés factices), vérifier l'affichage "Connecté" + toggle par défaut.
5. Frontend : dans `OrderDetailPage`, confirmer une commande et vérifier l'affichage du tracking number mocké.
