"""Client SofizPay (CIB / EDAHABIA) : seul endroit qui parle à leur API.

Remplace Chargily (2026-10). Implémentation reprise de plateforme-prof
(`subscriptions/sofizpay.py`) : appels HTTP directs plutôt que le SDK officiel.
Pas de webhook chez SofizPay : on interroge l'endpoint de vérification
(`check_status`), déclenché au retour du client, à la demande, et par la commande
`check_pending_payments`.
"""
import requests
from django.conf import settings

TIMEOUT = 15  # secondes : ne jamais bloquer un worker sur une API externe

_URLS = {
    False: {
        'make': 'https://www.sofizpay.com/make-cib-transaction/',
        'check': 'https://www.sofizpay.com/cib-transaction-check/',
    },
    True: {
        'make': 'https://sofizpay.com/sandbox/make-cib-transaction/',
        'check': 'https://sofizpay.com/sandbox/cib-transaction-check/',
    },
}


class SofizPayError(Exception):
    pass


def _get(url, params):
    try:
        response = requests.get(
            url, params=params, timeout=TIMEOUT,
            headers={'Accept': 'application/json', 'User-Agent': 'mzsolutions'},
        )
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        raise SofizPayError("SofizPay est injoignable ou a refusé la demande.") from exc


def create_payment_link(*, amount, full_name, phone, email, memo, return_url):
    """Renvoie (cib_transaction_id, payment_url)."""
    if not settings.SOFIZPAY_ACCOUNT:
        raise SofizPayError("Paiement non configuré (SOFIZPAY_ACCOUNT manquant).")
    params = {
        'account': settings.SOFIZPAY_ACCOUNT, 'amount': int(amount), 'full_name': full_name,
        'phone': phone, 'email': email, 'memo': memo, 'return_url': return_url, 'redirect': 'no',
    }
    result = _get(_URLS[settings.SOFIZPAY_SANDBOX]['make'], params)
    try:
        if not result.get('success'):
            raise KeyError('success')
        return str(result['cib_transaction_id']), result['payment_url']
    except (KeyError, TypeError, AttributeError) as exc:
        raise SofizPayError("Réponse inattendue de SofizPay.") from exc


# `orderStatus` (passerelle bancaire) : 2 = autorisé/encaissé ;
# 3, 4, 6 = annulé / remboursé / refusé ; `null`/autre = pas (encore) payé.
_PAID = {2}
_FAILED = {3, 4, 6}


def check_status(cib_transaction_id, expected_amount):
    """Renvoie 'success' | 'pending' | 'failed'. Toute réponse douteuse = 'pending'
    (on ne confirme jamais sur une réponse ambiguë). Un « payé » n'est accepté que
    si le montant ET le compte destinataire sont les nôtres."""
    result = _get(_URLS[settings.SOFIZPAY_SANDBOX]['check'], {'order_number': cib_transaction_id})
    if not isinstance(result, dict):
        return 'pending'
    try:
        status = int(result.get('orderStatus'))
    except (TypeError, ValueError):
        return 'pending'
    if status in _FAILED:
        return 'failed'
    if status in _PAID:
        try:
            amount_ok = float(result.get('Amount')) == float(expected_amount)
        except (TypeError, ValueError):
            amount_ok = False
        account_ok = result.get('destination_account') == settings.SOFIZPAY_ACCOUNT
        return 'success' if amount_ok and account_ok else 'pending'
    return 'pending'
