"""Flux OAuth Shopify (app publique/unlisted) — un vendeur MZSolutions
connecte sa propre boutique Shopify, sans jamais nous transmettre de token
manuellement. Voir channels/views.py pour les vues qui utilisent ces helpers."""
import base64
import hashlib
import hmac
import re

import requests
from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

_signer = TimestampSigner(salt='shopify-oauth-state')

SHOP_DOMAIN_RE = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$')


class ShopifyOAuthError(Exception):
    pass


def normalize_shop_domain(shop):
    shop = (shop or '').strip().lower()
    if not SHOP_DOMAIN_RE.match(shop):
        raise ShopifyOAuthError("Domaine de boutique invalide (attendu : monshop.myshopify.com).")
    return shop


def make_state(store_id):
    """Jeton signé encodant l'id de la boutique MZSolutions à l'origine de la
    demande de connexion — permet de retrouver le bon store au retour de
    Shopify, sans dépendre d'une session (Shopify redirige un navigateur brut)."""
    return _signer.sign(str(store_id))


def read_state(state, max_age=600):
    try:
        value = _signer.unsign(state or '', max_age=max_age)
        return int(value)
    except (BadSignature, SignatureExpired, ValueError):
        return None


def build_authorize_url(shop, state):
    redirect_uri = f"{settings.BACKEND_URL}/api/public/channels/shopify/callback/"
    return (
        f"https://{shop}/admin/oauth/authorize"
        f"?client_id={settings.SHOPIFY_CLIENT_ID}"
        f"&scope={settings.SHOPIFY_SCOPES}"
        f"&redirect_uri={redirect_uri}"
        f"&state={state}"
    )


def verify_callback_hmac(query_params):
    """Vérifie la signature HMAC que Shopify ajoute aux paramètres de requête
    du callback OAuth (différent de la signature des webhooks, qui porte sur
    le corps brut) — protège contre un callback forgé par un tiers."""
    params = query_params.dict() if hasattr(query_params, 'dict') else dict(query_params)
    received = params.pop('hmac', None)
    if not received:
        return False
    message = '&'.join(f"{k}={v}" for k, v in sorted(params.items()))
    digest = hmac.new(settings.SHOPIFY_CLIENT_SECRET.encode(), message.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, received)


def exchange_code_for_token(shop, code):
    resp = requests.post(
        f"https://{shop}/admin/oauth/access_token",
        json={
            'client_id':     settings.SHOPIFY_CLIENT_ID,
            'client_secret': settings.SHOPIFY_CLIENT_SECRET,
            'code':          code,
        },
        timeout=10,
    )
    if resp.status_code != 200:
        raise ShopifyOAuthError(f"Échec de l'échange du code OAuth ({resp.status_code}).")
    data = resp.json()
    return data['access_token'], data.get('scope', '')


def verify_webhook_hmac(raw_body, hmac_header):
    """Signature des webhooks Shopify — HMAC-SHA256 du corps brut, encodé en
    base64, calculée avec le client secret de l'app (pas un secret par
    boutique — même clé pour tous les marchands connectés à cette app)."""
    if not hmac_header:
        return False
    digest = hmac.new(settings.SHOPIFY_CLIENT_SECRET.encode(), raw_body, hashlib.sha256).digest()
    computed = base64.b64encode(digest).decode()
    return hmac.compare_digest(computed, hmac_header)


def register_webhooks(shop, access_token):
    """Abonne l'app aux événements de commande sur la boutique du marchand,
    juste après l'échange OAuth — Shopify pousse alors les commandes en
    temps réel vers notre endpoint public, plus besoin de polling."""
    callback = f"{settings.BACKEND_URL}/api/public/channels/shopify/webhooks/orders/"
    for topic in ('orders/create', 'orders/updated'):
        try:
            requests.post(
                f"https://{shop}/admin/api/{settings.SHOPIFY_API_VERSION}/webhooks.json",
                json={'webhook': {'topic': topic, 'address': callback, 'format': 'json'}},
                headers={'X-Shopify-Access-Token': access_token},
                timeout=10,
            )
        except requests.RequestException:
            pass  # best-effort — la connexion reste utile même si l'abonnement échoue
