"""TikTok Events API — envoi d'évènements server-side ("CompletePayment",
équivalent Purchase), en plus du script client déjà injecté par
`lib/pixels.js`. Même principe que `facebook_capi.py`. Nécessite
`PixelConfig.access_token` (jeton généré depuis TikTok Ads Manager → Évènements
→ Configurer → API). Best-effort, ne doit jamais faire échouer la commande."""
import hashlib
import time

import requests

EVENTS_API_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/'


def _hash(value):
    return hashlib.sha256(value.strip().lower().encode()).hexdigest() if value else None


def send_purchase_event(store, order):
    try:
        pixels = store.pixels.filter(pixel_type='tiktok', is_active=True).exclude(access_token='')
    except Exception:
        return
    if not pixels:
        return

    phone_hash = _hash(order.phone)

    for pixel in pixels:
        payload = {
            'event_source': 'web',
            'event_source_id': pixel.pixel_id,
            'data': [{
                'event': 'CompletePayment',
                'event_time': int(time.time()),
                'user': {'phone_number': phone_hash} if phone_hash else {},
                'properties': {
                    'currency': 'DZD',
                    'value': str(order.total),
                    'content_id': str(order.id),
                },
            }],
        }
        try:
            requests.post(
                EVENTS_API_URL,
                headers={'Access-Token': pixel.access_token, 'Content-Type': 'application/json'},
                json=payload, timeout=5,
            )
        except requests.RequestException:
            pass
