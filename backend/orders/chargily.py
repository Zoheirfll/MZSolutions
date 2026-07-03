import hmac
import hashlib

import requests
from django.conf import settings


class ChargilyError(Exception):
    pass


def create_checkout(order):
    """Crée un checkout Chargily Pay pour la commande et renvoie (checkout_id, payment_link)."""
    slug = order.store.slug
    payload = {
        'amount':          int(order.total),
        'currency':        'dzd',
        'success_url':     f"{settings.FRONTEND_URL}/store/{slug}/checkout?payment=success",
        'failure_url':     f"{settings.FRONTEND_URL}/store/{slug}/checkout?payment=failed",
        'webhook_endpoint': f"{settings.BACKEND_URL}/api/public/webhooks/chargily/",
        'metadata': {'order_id': order.id},
    }
    headers = {'Authorization': f"Bearer {settings.CHARGILY_SECRET_KEY}"}

    try:
        resp = requests.post(f"{settings.CHARGILY_API_BASE}/checkouts", json=payload, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        raise ChargilyError(str(e)) from e

    checkout_id = data.get('id')
    payment_link = data.get('checkout_url')
    if not checkout_id or not payment_link:
        raise ChargilyError('Réponse Chargily invalide (id/checkout_url manquant).')

    return checkout_id, payment_link


def create_subscription_checkout(store, amount, plan_id, billing_cycle):
    """Crée un checkout Chargily Pay pour un abonnement (Epic 8.5 US-8.5.1) —
    même API que create_checkout(order), généralisée : pas de commande, juste
    une boutique + un montant. Le webhook (ChargilyWebhookView) distingue les
    deux cas via metadata.subscription."""
    payload = {
        'amount':          int(amount),
        'currency':        'dzd',
        'success_url':     f"{settings.FRONTEND_URL}/dashboard/abonnement?payment=success",
        'failure_url':     f"{settings.FRONTEND_URL}/dashboard/abonnement?payment=failed",
        'webhook_endpoint': f"{settings.BACKEND_URL}/api/public/webhooks/chargily/",
        'metadata': {'subscription': True, 'store_id': store.id, 'plan_id': plan_id, 'billing_cycle': billing_cycle},
    }
    headers = {'Authorization': f"Bearer {settings.CHARGILY_SECRET_KEY}"}

    try:
        resp = requests.post(f"{settings.CHARGILY_API_BASE}/checkouts", json=payload, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        raise ChargilyError(str(e)) from e

    checkout_id = data.get('id')
    payment_link = data.get('checkout_url')
    if not checkout_id or not payment_link:
        raise ChargilyError('Réponse Chargily invalide (id/checkout_url manquant).')

    return checkout_id, payment_link


def verify_webhook_signature(raw_body: bytes, signature_header: str) -> bool:
    if not settings.CHARGILY_SECRET_KEY or not signature_header:
        return False
    expected = hmac.new(
        settings.CHARGILY_SECRET_KEY.encode(),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)
