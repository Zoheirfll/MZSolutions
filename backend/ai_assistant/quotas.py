"""Quotas IA par fonctionnalité. Chaque appel au modèle appartient à UNE fonctionnalité, qui a son
propre plafond quotidien et hebdomadaire par palier (valables pour la boutique entière)."""

AI_FEATURES = {
    'chat': 'Assistant IA (chat)',
    'product_gen': 'Génération de fiche produit',
    'reply': 'Suggestion de réponse (boîte de réception)',
    'summary': 'Résumé IA du tableau de bord',
    'scan': 'Scan de produit (vision)',
    'storefront_chat': 'Chatbot de la boutique',
    'risk': 'Explication du risque d’une commande',
    'reco': 'Explications des recommandations produit',
    'audit': 'Audit global de la boutique',
    'team': 'Suivi IA des confirmateurs',
}
MAX_QUOTA = 1_000_000


def clean_quotas(raw):
    """({clé: {'daily': n, 'weekly': n}}, erreur). Les clés inconnues sont refusées ; 0 = illimité."""
    if not isinstance(raw, dict):
        return None, 'Quotas IA invalides.'
    out = {}
    for key, v in raw.items():
        if key not in AI_FEATURES or not isinstance(v, dict):
            return None, f'Fonctionnalité IA inconnue : {key}.'
        try:
            daily, weekly = int(v.get('daily') or 0), int(v.get('weekly') or 0)
        except (TypeError, ValueError):
            return None, f'Quota IA invalide pour {AI_FEATURES[key]}.'
        if not (0 <= daily <= MAX_QUOTA and 0 <= weekly <= MAX_QUOTA):
            return None, f'Quota IA invalide pour {AI_FEATURES[key]} (0 à {MAX_QUOTA}).'
        if daily or weekly:
            out[key] = {'daily': daily, 'weekly': weekly}
    return out, None


def quota_rows(quotas, only_limited=False):
    """Liste {key, label, daily, weekly} pour toutes les fonctionnalités (ou seulement limitées)."""
    quotas = quotas if isinstance(quotas, dict) else {}
    rows = []
    for key, label in AI_FEATURES.items():
        q = quotas.get(key) or {}
        daily, weekly = int(q.get('daily') or 0), int(q.get('weekly') or 0)
        if only_limited and not (daily or weekly):
            continue
        rows.append({'key': key, 'label': label, 'daily': daily, 'weekly': weekly})
    return rows
