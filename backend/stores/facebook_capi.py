"""Facebook Conversions API — envoi d'évènements server-side, en plus du
script client déjà injecté par `lib/pixels.js`. Plus fiable que le seul
tracking navigateur (bloqueurs de pub, Safari ITP, etc.) — nécessite un
`PixelConfig.access_token` (Jeton d'accès Conversions API, généré depuis
Meta Events Manager). Best-effort, ne doit jamais faire échouer la commande."""
import hashlib
import time

import requests

GRAPH_API_VERSION = 'v18.0'


def _hash(value):
    return hashlib.sha256(value.strip().lower().encode()).hexdigest() if value else None


def send_purchase_event(store, order):
    try:
        pixels = store.pixels.filter(pixel_type='facebook', is_active=True).exclude(access_token='')
    except Exception:
        return
    if not pixels:
        return

    user_data = {}
    phone_hash = _hash(order.phone)
    if phone_hash:
        user_data['ph'] = [phone_hash]

    payload_base = {
        'event_name': 'Purchase',
        'event_time': int(time.time()),
        'action_source': 'website',
        'user_data': user_data,
        'custom_data': {
            'currency': 'DZD',
            'value': str(order.total),
            'order_id': str(order.id),
        },
    }

    for pixel in pixels:
        try:
            requests.post(
                f'https://graph.facebook.com/{GRAPH_API_VERSION}/{pixel.pixel_id}/events',
                params={'access_token': pixel.access_token},
                json={'data': [payload_base]},
                timeout=5,
            )
        except requests.RequestException:
            pass
