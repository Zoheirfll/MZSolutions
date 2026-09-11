# Suivi IA des confirmateurs — Design

Date : 2026-09-11
Statut : approuvé par l'utilisateur

## Contexte

Nouveau chantier IA demandé par l'utilisateur : donner au propriétaire/admin un suivi de performance **et** de détection d'anomalie pour son équipe de confirmateurs, avec une synthèse IA en langage naturel. Même philosophie que tous les chantiers précédents : **aucun calcul par un LLM** — tous les signaux (score de performance, drapeaux d'anomalie) sont 100% déterministes, l'IA ne fait que rédiger une synthèse à partir de ces chiffres déjà calculés.

## Signaux déterministes (`backend/team/monitoring.py`)

Fenêtre glissante de 30 jours. Pour chaque `TeamMember` actif de rôle `confirmateur` :

- **`confirmation_rate`** — `commandes confirmées / commandes traitées` sur ses commandes assignées (`OrderAssignment.confirmateur`), même définition que `ConfirmationRateView` (`traitées` = statuts `no_answer_1/2/3/confirmed/shipped/delivered/returned/cancelled`, `confirmées` = `confirmed/shipped/delivered`).
- **`late_ratio`** — part de ses commandes assignées encore `pending` depuis plus de 24h, parmi ses `pending` en cours.
- **`call_failure_rate`** — part de ses `CallAttempt` (`agent=membre`) avec `failure_reason` renseigné, sur la période.
- **`orders_assigned`** — nombre de commandes assignées traitées sur la période (dénominateur `processed` ci-dessus).
- **`cancellation_return_rate`** — parmi ses commandes **traitées** (même dénominateur `processed` que `confirmation_rate` ci-dessus), la part dont le statut **actuel** est `cancelled` ou `returned`.

**Score de performance** (0-100) : `score = clamp(confirmation_rate - late_ratio * 30 - call_failure_rate * 20)`. `None` si le confirmateur n'a aucune commande traitée sur la période (pas de division par zéro déguisée).

**Drapeaux d'anomalie** (liste de chaînes, pas un score — chacun déclenché indépendamment) :
- `inactive_online` — `TeamMember.is_currently_online = True` mais **aucune** entrée `audit.AuditLog` avec cet acteur sur les 7 derniers jours.
- `high_cancellation` — `cancellation_return_rate` ≥ 1.5 × la moyenne de l'équipe (calculée sur les confirmateurs actifs ayant au moins 5 commandes traitées, pour éviter le bruit sur un petit échantillon) — ne se déclenche que si le confirmateur lui-même a au moins 5 commandes traitées.
- `low_throughput` — `orders_assigned` < 50% de la moyenne de l'équipe — ne se déclenche que si l'équipe compte au moins 2 confirmateurs actifs (sinon aucune moyenne comparative valable).
- `high_late_ratio` — `late_ratio` > 0.5 (plus de la moitié de ses commandes en attente sont en retard).

`compute_team_overview(store) -> list[dict]` — un dict par confirmateur actif : `{member_id, name, score, orders_assigned, flags: [...]}`, calcule d'abord les moyennes d'équipe (nécessaires aux drapeaux `high_cancellation`/`low_throughput`) puis le détail de chacun.

`compute_confirmateur_detail(store, member) -> dict` — tous les chiffres bruts + score + drapeaux pour un confirmateur précis (réutilise la même moyenne d'équipe que `compute_team_overview`, recalculée à l'appel — pas de cache intermédiaire, cohérent avec la décision "jamais de cache" de ce chantier).

## Backend — endpoints

Nouvelle permission `confirmateur_monitoring_view` (masquée par défaut confirmateur/dropshipper — donnée sensible sur l'équipe, comme `team_view`).

- `GET /api/team/monitoring/` — `compute_team_overview()`, résultat pour tous les confirmateurs actifs.
- `GET /api/team/monitoring/<member_id>/` — `compute_confirmateur_detail()` pour un confirmateur précis (404 si le membre n'existe pas, n'appartient pas à la boutique, ou n'est pas confirmateur).
- `POST /api/team/monitoring/<member_id>/explain/` — synthèse IA individuelle, prompt limité aux chiffres du détail (score, taux, drapeaux déclenchés), jamais l'historique brut d'appels/commandes. **Aucun cache** — recalculée à chaque appel (les moyennes d'équipe évoluent en continu). `503` si le fournisseur IA est indisponible.
- `POST /api/team/monitoring/team-explain/` — synthèse IA sur l'ensemble de l'équipe (qui se démarque en bien/en mal), prompt limité aux résultats de `compute_team_overview()`. Même dégradation `503`, aucun cache.

## Rôle de l'IA

Deux prompts distincts, tous deux stricts anti-invention (« base-toi UNIQUEMENT sur les chiffres fournis ») et concis :
- **Individuel** : reçoit le score, les 5 chiffres bruts, et la liste des drapeaux déclenchés (en clair, pas la clé technique) → synthèse en 2-3 phrases (constat + explication des drapeaux s'il y en a).
- **Équipe** : reçoit la liste `{nom, score, drapeaux}` de tous les confirmateurs → synthèse qui nomme qui se démarque en bien et qui nécessite de l'attention, sans jamais inventer une cause non fournie dans les chiffres.

## Frontend

Nouvelle page `pages/team/ConfirmateurMonitoringPage.jsx`, route `/dashboard/suivi-confirmateurs`, sous le menu **IA** de la sidebar, permission `confirmateur_monitoring_view`.

- Bouton "Analyser l'équipe" en haut de page → synthèse IA globale affichée au-dessus du tableau.
- Tableau vue d'ensemble : une ligne par confirmateur (nom, score badgé 3 bandes comme l'audit boutique, nombre de drapeaux sous forme de badge d'alerte si > 0).
- Clic sur une ligne → déplie une fiche détaillée (même pattern `DimensionSection` dépliable que l'audit boutique) : les 5 chiffres bruts, la liste des drapeaux avec leur libellé explicite, bouton "Analyser" individuel qui affiche la synthèse IA de ce confirmateur.

## Hors périmètre

- Pas d'alertes proactives (notification/badge navigateur) — à la demande uniquement, décision déjà actée.
- Pas d'historique dans le temps du score (pas de graphique d'évolution) — uniquement l'instantané des 30 derniers jours, recalculé à chaque ouverture de page.
- Pas de comparaison inter-boutique — les moyennes d'équipe ne portent que sur la boutique courante.
- Portée limitée au rôle `confirmateur` — les dropshippers/admins ne sont pas inclus dans ce suivi (rôles différents, métriques non comparables).

## Tests

- Backend : `team/monitoring.py` — chaque signal vérifié sur données connues (confirmation_rate, late_ratio, call_failure_rate, cancellation_return_rate), chaque drapeau déclenché/non déclenché selon les seuils (y compris les gardes anti-bruit : minimum 5 commandes pour `high_cancellation`, minimum 2 confirmateurs pour `low_throughput`), score `None` sans commande traitée. Endpoints — gating de permission, 404 sur un membre non-confirmateur ou d'une autre boutique, dégradation IA `503` sur les 2 endpoints d'explication.
- Frontend : tableau vue d'ensemble avec scores/drapeaux, dépliage de la fiche détaillée, bouton d'explication individuelle et bouton d'explication équipe, gestion de l'échec IA.
