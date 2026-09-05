# Détection de risque avancée — Design

Date : 2026-09-05
Statut : approuvé par l'utilisateur

## Contexte

3ème chantier IA (sur 4 planifiés, voir `docs/superpowers/specs/2026-09-04-assistant-ia-ollama-design.md`). Le système actuel (`orders.models.CustomerRisk`) est une règle simple : nombre de commandes `cancelled`/`returned` sur une fenêtre glissante (`StoreSettings.risk_threshold_orders`/`risk_period_days`) ≥ seuil, plus un flag manuel. Ce chantier ajoute un **score de risque par commande**, plus riche, calculé à la création.

## Décision de conception centrale : score déterministe, pas un score calculé par le LLM

Un LLM n'est pas fiable pour produire un score numérique cohérent d'un appel à l'autre sur les mêmes données (déjà observé dans ce projet : anti-hallucination resserrée sur les 2 chantiers précédents). Le score est donc **calculé par du code Python déterministe** (`orders/risk_scoring.py`), **aucun appel réseau, aucun coût IA**. L'IA n'intervient qu'en option, à la demande, pour **reformuler en phrase lisible** un score et des signaux déjà calculés — jamais pour les calculer elle-même.

## Périmètre

- Score 0-100 + liste de signaux déclenchés, calculé et stocké sur chaque nouvelle `Order` à la création (dashboard ET checkout public).
- **Jamais de blocage automatique** — signalement uniquement, comme `CustomerRisk` aujourd'hui. `CustomerRisk`/`BlacklistedPhone` restent **inchangés**, le nouveau score est additionnel, pas une fusion.
- Explication IA à la demande (pas à la création), mise en cache par commande.
- Affiché sur `OrdersPage.jsx` (badge), `OrderDetailPage.jsx` (détail + signaux + explication), `AtRiskCustomersPage.jsx` (score max par client).

Hors périmètre (explicite) : seuils configurables par boutique (bandes fixes pour cette v1), recalcul rétroactif des commandes existantes.

## Calcul du score (`orders/risk_scoring.py`)

```python
def compute_risk_score(store, phone, wilaya, commune, total) -> tuple[int, list[str]]:
    """Calcul déterministe, aucun appel réseau. `total` = montant de la
    commande en cours d'évaluation (avant création). Retourne (score 0-100,
    signaux déclenchés)."""
```

4 signaux, chacun avec un poids fixe (somme plafonnée à 100) :

1. **`cancel_return_rate`** (poids 40) — réutilise la logique existante : proportion de commandes `cancelled`/`returned` de ce téléphone sur `StoreSettings.risk_period_days` ≥ `StoreSettings.risk_threshold_orders`. Signal binaire (déclenché ou non), même seuil que le système actuel — pas de duplication de règle, juste une réutilisation dans un contexte différent.
2. **`unusual_frequency`** (poids 20) — ≥3 commandes du même téléphone dans les 24h précédentes (fenêtre fixe, pas de nouveau réglage boutique).
3. **`unusual_amount`** (poids 20) — montant de la commande en cours ≥ 3× la moyenne des commandes précédentes de ce téléphone dans cette boutique (si ≥1 commande précédente) ; sinon comparé à la moyenne de la boutique entière sur les 90 derniers jours.
4. **`location_mismatch`** (poids 20) — wilaya de la commande en cours différente de la wilaya de **toutes** les commandes précédentes de ce téléphone (si le téléphone a un historique).

Chaque signal déclenché ajoute son poids au score total. Client sans aucun historique (première commande) : seul `unusual_amount` peut se déclencher (comparé à la moyenne boutique), les 3 autres ne se déclenchent jamais faute d'historique — score bas par défaut pour un nouveau client, cohérent avec l'absence de données.

## Modèle

`orders.models.Order` — 3 nouveaux champs :

```python
risk_score = models.PositiveSmallIntegerField(null=True, blank=True)  # 0-100, null = pas encore calculé (commandes antérieures au déploiement)
risk_signals = models.JSONField(default=list, blank=True)  # liste de codes signal, ex. ["unusual_amount", "location_mismatch"]
risk_explanation = models.TextField(blank=True)  # généré à la demande, mis en cache — jamais régénéré automatiquement
```

⚠️ Point vérifié dans le code existant : `total` n'est connu qu'**après** `order.recalculate()` (appelé une fois les `OrderItem` créés, dans `OrderListCreateView.post` et `PublicOrderView.post`) — jamais avant, `Order.objects.create(...)` ne reçoit pas encore `total`. Le score est donc calculé **après** `order.recalculate()`, puis sauvegardé séparément :

```python
order.recalculate()
# ... (code existant inchangé) ...
score, signals = compute_risk_score(store, order.phone, order.wilaya, order.commune, order.total)
order.risk_score, order.risk_signals = score, signals
order.save(update_fields=['risk_score', 'risk_signals'])
```

Insertion juste après la ligne `order.recalculate()` existante dans les deux vues (avant les effets de bord qui suivent — historique de statut, dispatch confirmateur, etc. — l'ordre entre le score et ces effets n'a pas d'importance, aucun ne dépend de l'autre).

## Explication IA à la demande

`POST /api/orders/<id>/risk-explanation/` (owner/admin ou `has_permission(request, 'clients_risk_view')`, même formule que le reste des endpoints commandes sensibles) :

- Si `order.risk_explanation` déjà renseigné → le retourne directement (pas de nouvel appel IA, cache permanent — le score/les signaux de cette commande ne changent jamais après coup).
- Sinon → construit un prompt factuel à partir de `risk_score`/`risk_signals` uniquement (jamais l'historique brut du client, pour rester court et éviter toute tentation d'invention), appelle `ai_assistant/ollama_client.py::generate()`, stocke le résultat dans `order.risk_explanation`, le retourne.
- Panne IA → `503 {"detail": "Assistant IA indisponible"}`, comme les autres capacités IA du projet — `risk_score`/`risk_signals` restent toujours visibles indépendamment (ils ne dépendent d'aucun appel IA).

Prompt (même garde-fou anti-invention que les 2 chantiers précédents) :
```
Un client de la boutique {store_name} a un score de risque de {score}/100. Signaux déclenchés : {signals_fr}.
Explique en 2-3 phrases, en français, pourquoi ce score est ce qu'il est — base-toi UNIQUEMENT sur les signaux fournis, n'invente aucune autre information.
```

## Frontend

- `components/RiskScoreBadge.jsx` — bandes fixes : 0-33 vert ("Faible"), 34-66 orange ("Moyen"), 67-100 rouge ("Élevé"). Utilisé dans `OrdersPage.jsx` (nouvelle colonne, comme `TrackingBadge`) et `OrderDetailPage.jsx`.
- `OrderDetailPage.jsx` — encart score + libellés FR des signaux déclenchés (`cancel_return_rate` → "Taux d'annulation/retour élevé", etc.) + bouton "Générer une explication" (appelle l'endpoint, affiche le texte mis en cache si déjà présent).
- `AtRiskCustomersPage.jsx` — `ClientListView` (déjà agrégée par téléphone) étendue avec `max_risk_score` (le plus élevé parmi les commandes de ce client), affiché en colonne à côté de `is_risky`/`manual_risk` existants.

## Tests

- Backend : `orders/risk_scoring.py` — un test par signal (déclenché/non déclenché isolément), score cumulé sur plusieurs signaux, client sans historique (score bas, un seul signal possible). Vues : score stocké à la création (dashboard et checkout public), endpoint explication (cache respecté — un seul appel `generate()` sur 2 requêtes successives, dégradation 503 sur panne simulée), gating de permission.
- Frontend : `RiskScoreBadge.jsx` (3 bandes de couleur), `OrderDetailPage.jsx` (affichage signaux + bouton explication + cache), `AtRiskCustomersPage.jsx` (colonne score max).
