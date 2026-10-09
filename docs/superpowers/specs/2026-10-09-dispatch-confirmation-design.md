# Dispatch des commandes du service de confirmation — conception (2026-10-09)

Branche : `epic-dispatch-confirmation`. Périmètre : **boutiques ayant le service de confirmation actif uniquement** (`PlatformConfirmationAccount.is_active`). Les boutiques avec leurs propres confirmateurs gardent `no_answer_1/2/3` — aucune régression possible pour elles.

## Décisions produit (validées avec l'utilisateur)

- Le flux 1er/2e/3e appel est remplacé, pour le service, par des **résultats d'appel** : ne répond pas, injoignable, occupé, rappeler plus tard. Confirmée/annulée terminent le flux.
- Un appel raté renvoie la commande en **En attente d'assignation** (page dédiée, obligatoire). Délai croissant avant redispatch vers un **autre** confirmateur : 30, 40, 50, 60 min (grille réglable).
- Après `review_after` appels ratés (défaut 4) la commande apparaît dans **À traiter** chez l'admin (elle continue d'être redispatchée). Après `fail_after_review` appels de plus (défaut 4) elle devient **Échec** : état définitif, lecture seule, visible de l'admin uniquement, avec le journal complet.
- `Order.status` n'est **jamais modifié** par ce flux (reste `pending` côté vendeur, option A validée par défaut) : l'état du flux vit dans `PlatformOrderFlow`.
- Les **algorithmes classent les commandes** (quelle commande passe en premier quand il y a plus de commandes que de capacité), ils ne choisissent pas le confirmateur. Le confirmateur retenu est le moins chargé ayant de la capacité (`max_open`, défaut 5), en excluant ceux qui ont déjà essayé cette commande tant qu'il en reste d'autres.
- Choix de l'algorithme : par boutique, par journée (date précise ou jour de semaine) ou pour tout le site. Résolution : boutique+date > boutique+jour > boutique > site+date > site+jour > site > défaut (`fifo`).

## Les 10 algorithmes (score 0-100, égalité → la plus ancienne)

| Clé | Passe en premier |
|---|---|
| `fifo` | la plus ancienne |
| `newest` | la plus récente |
| `overdue` | attente échue, la plus en retard d'abord |
| `persistence` | 3 « ne répond pas » ou plus |
| `longest_idle` | le plus longtemps sans appel |
| `low_rate_stores` | boutiques au taux de confirmation (30 j) le plus bas |
| `high_rate_stores` | boutiques au meilleur taux |
| `high_value` | montant le plus élevé |
| `quick_wins` | score de risque le plus bas |
| `balanced` | composite pondéré (poids réglables) |

## Données (`platform_admin/dispatch_models.py`)

- `PlatformOrderFlow` (1-1 commande) : `state` waiting/assigned/failed/done, `attempts`, `available_at`, `confirmateur` courant, `admin_flagged_at`, `failed_at`, `done_at`.
- `PlatformOrderEvent` : journal (created, assigned, attempt, requeued, escalated, failed, done) avec confirmateur, résultat, note, détail JSON.
- `PlatformDispatchConfig` : portée (store/date/weekday nullables), `algorithm`, `wait_minutes`, `review_after`, `fail_after_review`, `max_open`, `weights`.
- `PlatformOrderAssignment` conservée (file du confirmateur) : supprimée quand la commande retourne en attente ou échoue.

## Exécution

- Moteur : `platform_admin/dispatch.py` (`start_flow`, `fill_slots`, `record_attempt`, `finish_flow`, `run_cycle`).
- Déclencheurs : création de commande (`route_order`), résultat d'appel, commande `python manage.py dispatch_waiting_orders` **à planifier chaque minute** (suivie par `TaskRun`).
- Verrou `select_for_update(skip_locked)` : jamais de double dispatch entre la requête web et la tâche.
