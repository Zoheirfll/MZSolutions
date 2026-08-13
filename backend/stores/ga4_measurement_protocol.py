"""Google Analytics 4 — Measurement Protocol, envoi server-side de
l'évènement "purchase". Nécessite `PixelConfig.pixel_id` (ID de mesure,
G-XXXXXXXXXX) et `PixelConfig.ga_api_secret` (généré depuis GA4 Admin → Flux
de données → Measurement Protocol API secrets) — PAS le JSON de compte de
service (`ga_service_account_json`), qui sert l'API Analytics Admin/Data
(lecture de rapports), un usage différent non branché ici. Best-effort, ne
doit jamais faire échouer la commande."""
import hashlib

import requests

MP_URL = 'https://www.google-analytics.com/mp/collect'


def _client_id(store, order):
    # GA4 exige un client_id mais ne rattache à aucune session navigateur
    # réelle ici (envoi serveur pur) — dérivé de façon stable du téléphone
    # pour que les achats d'un même client se regroupent dans les rapports.
    raw = f"{store.id}:{order.phone}".encode()
    return hashlib.sha256(raw).hexdigest()[:20]


def send_purchase_event(store, order):
    try:
        pixels = store.pixels.filter(pixel_type='google_analytics', is_active=True).exclude(ga_api_secret='')
    except Exception:
        return
    if not pixels:
        return

    for pixel in pixels:
        if not pixel.pixel_id:
            continue
        payload = {
            'client_id': _client_id(store, order),
            'events': [{
                'name': 'purchase',
                'params': {
                    'currency': 'DZD',
                    'value': float(order.total),
                    'transaction_id': str(order.id),
                },
            }],
        }
        try:
            requests.post(
                MP_URL,
                params={'measurement_id': pixel.pixel_id, 'api_secret': pixel.ga_api_secret},
                json=payload, timeout=5,
            )
        except requests.RequestException:
            pass
