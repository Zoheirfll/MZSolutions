"""Les 10 algorithmes de priorité du dispatch : chacun note une commande de 0 à 100
(plus la note est haute, plus la commande passe tôt). Fonctions pures, sans accès base —
les signaux sont calculés une fois par `dispatch.signals_for`. Une égalité de note est
départagée par l'ancienneté de la commande (voir `dispatch.fill_slots`)."""
from dataclasses import dataclass

DAY_MINUTES = 24 * 60
AMOUNT_CAP = 20000.0          # DA — au-delà, une commande a la note maximale « gros montant »
OVERDUE_CAP_MINUTES = 60.0    # 1 h de retard d'attente = note maximale
NEUTRAL = 50.0                # taux/risque inconnu

DEFAULT_WEIGHTS = {
    'age': 0.25, 'attempts': 0.20, 'low_rate': 0.20,
    'amount': 0.15, 'quick_win': 0.10, 'overdue': 0.10,
}


@dataclass(frozen=True)
class Signals:
    age_min: float            # minutes depuis la création de la commande
    attempts: int             # appels ratés déjà enregistrés
    since_last_min: float     # minutes depuis le dernier appel (ou depuis la création)
    overdue_min: float        # minutes de retard sur l'échéance d'attente (0 si jamais appelée)
    store_rate: float         # taux de confirmation de la boutique sur 30 j (0-100)
    amount: float             # total de la commande
    risk: float               # score de risque 0-100 (50 si inconnu)


def _clamp(value, low=0.0, high=100.0):
    return max(low, min(high, value))


def _age_score(s):
    return _clamp(s.age_min / DAY_MINUTES * 100)


def _fifo(s, weights):
    return _age_score(s)


def _newest(s, weights):
    return 100.0 - _age_score(s)


def _overdue(s, weights):
    if s.attempts > 0:
        return 50.0 + _clamp(s.overdue_min / OVERDUE_CAP_MINUTES * 50, 0, 50)
    return 20.0


def _persistence(s, weights):
    if s.attempts >= 3:
        return 60.0 + _clamp((s.attempts - 3) / 3 * 40, 0, 40)
    return s.attempts * 15.0


def _longest_idle(s, weights):
    return _clamp(s.since_last_min / DAY_MINUTES * 100)


def _low_rate_stores(s, weights):
    return _clamp(100.0 - s.store_rate)


def _high_rate_stores(s, weights):
    return _clamp(s.store_rate)


def _high_value(s, weights):
    return _clamp(s.amount / AMOUNT_CAP * 100)


def _quick_wins(s, weights):
    return _clamp(100.0 - s.risk)


def _balanced(s, weights):
    w = {**DEFAULT_WEIGHTS, **{k: float(v) for k, v in (weights or {}).items() if k in DEFAULT_WEIGHTS}}
    total = sum(w.values()) or 1.0
    parts = {
        'age': _age_score(s),
        'attempts': _persistence(s, None),
        'low_rate': _low_rate_stores(s, None),
        'amount': _high_value(s, None),
        'quick_win': _quick_wins(s, None),
        'overdue': _overdue(s, None),
    }
    return _clamp(sum(parts[k] * w[k] for k in parts) / total)


ALGORITHMS = {
    'fifo': ('Premier arrivé', 'La commande la plus ancienne passe en premier.', _fifo),
    'newest': ('Nouvelles d\'abord', 'La commande la plus récente passe en premier (client encore chaud).', _newest),
    'overdue': ('Attente échue', 'Les commandes en attente dont le délai est écoulé, les plus en retard d\'abord.', _overdue),
    'persistence': ('Acharnement', 'Les commandes avec 3 « ne répond pas » ou plus passent en premier.', _persistence),
    'longest_idle': ('Plus longtemps sans appel', 'Le plus grand temps écoulé depuis le dernier appel.', _longest_idle),
    'low_rate_stores': ('Boutiques en difficulté', 'Les boutiques au taux de confirmation le plus bas (30 j).', _low_rate_stores),
    'high_rate_stores': ('Boutiques performantes', 'Les boutiques au meilleur taux de confirmation (30 j).', _high_rate_stores),
    'high_value': ('Gros montants', 'Le montant de commande le plus élevé.', _high_value),
    'quick_wins': ('Gains rapides', 'Le score de risque le plus bas (confirmation la plus probable).', _quick_wins),
    'balanced': ('Équilibré', 'Score composite pondéré : ancienneté, tentatives, taux, montant, risque, retard.', _balanced),
}


def score(algorithm, signals, weights=None):
    """Note 0-100 ; une clé inconnue retombe sur `fifo` plutôt que de bloquer le dispatch."""
    fn = ALGORITHMS.get(algorithm, ALGORITHMS['fifo'])[2]
    return round(_clamp(fn(signals, weights)), 2)


def catalog():
    return [{'key': k, 'label': v[0], 'description': v[1]} for k, v in ALGORITHMS.items()]
