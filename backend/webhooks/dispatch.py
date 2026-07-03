import hashlib
import hmac
import json
import requests
from .models import WebhookEndpoint, WebhookLog, MAX_CONSECUTIVE_FAILURES


def fire_event(store, event, payload):
    """Envoie `payload` à tous les endpoints actifs de la boutique abonnés à
    `event` (US-8.4.1). Signe le corps avec HMAC-SHA256 (X-MZ-Signature) si
    l'endpoint a un secret. Best-effort par endpoint — un échec n'empêche pas
    les autres endpoints d'être notifiés, et ne doit jamais remonter d'
    exception à l'appelant (déclenché depuis le flux de commande)."""
    try:
        endpoints = WebhookEndpoint.objects.filter(store=store, is_active=True)
    except Exception:
        return

    for endpoint in endpoints:
        if endpoint.events and event not in endpoint.events:
            continue
        _send(endpoint, event, payload)


def _send(endpoint, event, payload):
    body = json.dumps(payload, default=str)
    headers = {'Content-Type': 'application/json', 'X-MZ-Event': event}
    if endpoint.secret:
        headers['X-MZ-Signature'] = hmac.new(endpoint.secret.encode(), body.encode(), hashlib.sha256).hexdigest()

    status_code = None
    try:
        resp = requests.post(endpoint.url, data=body, headers=headers, timeout=5)
        status_code = resp.status_code
        success = resp.ok
        message = '' if success else f"HTTP {resp.status_code}"
    except requests.RequestException as e:
        success = False
        message = str(e)

    from django.utils import timezone
    WebhookLog.objects.create(
        store=endpoint.store, endpoint=endpoint, direction='outbound', event=event,
        payload=payload, status_code=status_code,
        status='success' if success else 'error', message=message,
    )

    if success:
        endpoint.consecutive_failures = 0
        endpoint.last_triggered_at = timezone.now()
        endpoint.save(update_fields=['consecutive_failures', 'last_triggered_at'])
    else:
        endpoint.consecutive_failures += 1
        endpoint.last_triggered_at = timezone.now()
        update_fields = ['consecutive_failures', 'last_triggered_at']
        if endpoint.consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
            endpoint.is_active = False
            update_fields.append('is_active')
        endpoint.save(update_fields=update_fields)
