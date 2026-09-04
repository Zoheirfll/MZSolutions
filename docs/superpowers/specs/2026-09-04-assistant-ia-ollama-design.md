# Assistant IA (Ollama local) — Design

Date : 2026-09-04
Statut : approuvé par l'utilisateur

## Contexte

MZSolutions veut une intégration IA complète. Le périmètre "tout" (chatbot client public, assistant vendeur, détection de fraude avancée, analyse prédictive) a été décomposé en 4 chantiers indépendants. Ce document couvre le **premier chantier : l'Assistant vendeur (dashboard)**. Les 3 autres (chatbot client boutique publique, détection de risque/fraude avancée par IA, analyse prédictive ventes/stock/retours) feront chacun l'objet d'un spec séparé, plus tard.

Fournisseur IA : **Ollama, local, gratuit** — pas d'API tierce payante (OpenAI/Anthropic écartés pour ce projet). Modèle par défaut : `llama3.1:8b` (équilibre qualité FR / support du tool calling / RAM raisonnable), configurable via variable d'environnement, jamais figé en dur.

Travail effectué directement sur la branche courante (`epic-securite-avancee-et-corrections`) — pas de nouvelle branche epic, un autre terminal travaille en parallèle sur une autre branche/worktree.

## Périmètre — 4 capacités

1. **Génération de fiche produit** (description + SEO)
2. **Suggestion de réponse** dans la Boîte de réception (Inbox)
3. **Résumé IA** du tableau de bord (onglets Livraisons/Revenus/KPI)
4. **Chat libre** — assistant conversationnel interrogeant les données de la boutique via tool calling

## Architecture

### Nouvelle app Django `ai_assistant/`

Isolation identique à `dropshipping/`/`finance/`/`webhooks/` — app dédiée, pas de dépendance circulaire avec `orders`/`products`/`stores`.

```
ai_assistant/
  models.py       — AIConversation, AIMessage
  ollama_client.py — client HTTP unique vers Ollama (chat, generate, tool calling)
  tools.py         — définitions des tools (function calling) + exécution gated par permission
  views.py         — les 4 endpoints
  serializers.py
  urls.py
```

### Client Ollama (`ollama_client.py`)

- `OLLAMA_BASE_URL` (env, défaut `http://localhost:11434` en dev / `http://ollama:11434` en Docker prod)
- `OLLAMA_MODEL` (env, défaut `llama3.1:8b`)
- Fonctions : `chat(messages, tools=None) -> response`, `generate(prompt) -> text` — timeout court (30s), toute erreur réseau/timeout remonte une exception typée `OllamaUnavailableError` que chaque vue traduit en `503 {"detail": "Assistant IA indisponible"}`. Jamais de crash, jamais d'effet de bord bloqué par une panne IA (même philosophie best-effort que `webhooks.dispatch.fire_event`).

### Permission

- `ai_assistant_view` ajoutée à `team.models.PERMISSION_CATALOG`, nouvelle catégorie "Assistant IA" dans `PERMISSION_CATEGORIES`. Masquée par défaut pour confirmateur/dropshipper dans `DEFAULT_PERMISSIONS` (décision produit 2026-08 : toute nouvelle page doit être configurable dans la matrice, pas `ownerAdmin` sauf élévation de privilège — ce n'est pas le cas ici).
- Chaque endpoint applique `is_owner_or_admin(request) OR has_permission(request, 'ai_assistant_view')`, comme toute nouvelle vue du projet.
- Route frontend `<PD perm="ai_assistant_view">` sur `/dashboard/assistant-ia` dans `App.jsx`, lien sidebar gaté par `can('ai_assistant_view')` dans `DashboardLayout.jsx`.

### Modèles de données

```python
class AIConversation(models.Model):
    store = models.ForeignKey(Store, ...)
    user = models.ForeignKey(User, ...)
    title = models.CharField(...)  # auto-généré depuis le 1er message, tronqué
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class AIMessage(models.Model):
    conversation = models.ForeignKey(AIConversation, related_name='messages', ...)
    role = models.CharField(choices=[('user', ...), ('assistant', ...), ('tool', ...)])
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
```

Seul le chat libre (capacité 4) persiste un historique. Les capacités 1/2/3 sont sans état — une requête, une réponse, rien en base (pas de valeur à conserver la génération d'une fiche produit une fois insérée dans le formulaire).

## Les 4 capacités en détail

### 1. Génération de fiche produit

`POST /api/ai/generate-product/` — `{name, keywords (optionnel)}` → `{description, meta_title, meta_description, meta_keywords}`. Appel `ollama_client.generate()` simple, sans tools, prompt structuré demandant un JSON en sortie (format Ollama `format: "json"`).

Frontend : bouton "Générer avec l'IA" dans `ProductFormPage.jsx` (onglet Détails), à côté du champ description — remplit les champs du formulaire (éditables ensuite), **jamais auto-sauvegardé**, le vendeur garde le contrôle final.

### 2. Suggestion de réponse Inbox

`POST /api/ai/conversations/<conversation_id>/suggest-reply/` où `conversation_id` = l'id d'une `inbox.Conversation` (pas `AIConversation` — nommage à bien distinguer dans le code, préfixer clairement `inbox_conversation` côté vue). Construit le prompt à partir du fil de messages existant + contexte commande (statut, tracking, wilaya) déjà disponible dans `ConversationDetailView`. Retourne `{suggestion: str}`.

Frontend : bouton "Suggérer une réponse" dans `InboxPage.jsx` (fil de discussion), pré-remplit la zone de réponse — le confirmateur édite avant d'envoyer via l'endpoint `POST .../messages/` existant, **jamais envoyé automatiquement**.

### 3. Résumé IA du Dashboard

`GET /api/ai/dashboard-summary/?tab=deliveries|revenue|kpi&period=...&date_from=&date_to=` (mêmes paramètres période que `orders/utils.py::parse_period()`). Réutilise en interne les vues stats existantes (`DashboardDeliveriesView`/`DashboardRevenueView`/`DashboardKpiView` — appel direct de leur logique de calcul, pas de duplication), transforme les chiffres obtenus en 3-4 phrases de résumé en français via `ollama_client.generate()`.

Frontend : bouton "Résumé IA" par onglet (`DeliveriesTab.jsx`/`RevenueTab.jsx`/`KpiTab.jsx`), affiche le résumé dans un encart au-dessus des cartes — génération à la demande (pas automatique à chaque chargement, pour ne pas solliciter Ollama inutilement).

### 4. Chat libre avec tool calling

`POST /api/ai/chat/` — `{conversation_id (optionnel, crée si absent), message}`. `GET/POST /api/ai/conversations/` (liste/création), `GET /api/ai/conversations/<id>/` (historique).

**Tools exposés** (`ai_assistant/tools.py`), chacun une fonction Python qui réplique le filtrage/permission de son endpoint équivalent :

| Tool | Données | Permission requise |
|---|---|---|
| `get_orders_summary` | compteurs par statut, période | `orders_view` |
| `get_low_stock` | produits sous le seuil d'alerte | `stock_view` |
| `get_top_products` / `get_wilaya_stats` / `get_source_stats` | Epic 8.1 stats | `stats_view` |
| `get_at_risk_clients` | clients à risque | `clients_view` |
| `get_profitability_summary` | rentabilité période | `finances_view` |

**Garde-fou central** : avant d'exécuter un tool, `tools.py` vérifie `is_owner_or_admin(request) OR has_permission(request, <clé>)` — exactement la même formule que les endpoints REST correspondants. Si refusé, le tool renvoie un message d'erreur textuel ("Vous n'avez pas la permission de consulter ces données") que le modèle intègre naturellement dans sa réponse, plutôt qu'une exception qui casserait le tour de chat. Ainsi un confirmateur avec `ai_assistant_view` mais sans `finances_view` peut demander "quel est mon profit ce mois-ci" et recevoir un refus poli, jamais la donnée.

Toute réponse du modèle est ajoutée à `AIMessage` (`role='assistant'`), les résultats de tools en `role='tool'` (traçabilité, permet de rejouer/déboguer une conversation).

Frontend : `pages/ai/AIAssistantPage.jsx` (`/dashboard/assistant-ia`) — liste des conversations à gauche, fil de chat à droite (pattern proche de `InboxPage.jsx`, 2 colonnes au lieu de 3). Pas de streaming SSE dans cette première version (complexité supplémentaire non demandée) — requête/réponse classique avec indicateur de chargement, comme le reste du dashboard.

## Déploiement

`docker-compose.yml` (racine) — nouveau service :

```yaml
ollama:
  image: ollama/ollama
  volumes:
    - ollama_data:/root/.ollama
  restart: unless-stopped
```

`backend` gagne `depends_on: [ollama]` et `OLLAMA_BASE_URL=http://ollama:11434` dans son environnement. Le modèle n'est **pas** téléchargé au build (trop lourd, ~4.7 Go) — une commande manuelle après le premier démarrage prod : `docker compose exec ollama ollama pull llama3.1:8b`, documentée dans le README/CLAUDE.md. En dev local, `OLLAMA_BASE_URL=http://localhost:11434` (Ollama installé nativement, hors Docker).

## Erreurs & dégradation

- Ollama injoignable/timeout → `503` explicite sur les 4 endpoints, jamais de 500. Frontend affiche un message clair ("Assistant IA indisponible pour le moment") sans bloquer le reste de la page (les boutons IA sont des ajouts, jamais sur le chemin critique d'une action existante).
- Sortie du modèle non-JSON valide (capacité 1) → retry une fois avec un prompt renforcé, puis erreur explicite si échec persistant (pas de valeurs vides silencieuses insérées dans le formulaire produit).

## Tests

- Backend : `unittest.mock.patch('ai_assistant.ollama_client.requests.post', ...)` (même pattern que les tests Chargily) — teste : génération produit (JSON valide/invalide), suggestion de réponse, résumé dashboard, chat avec tool calling (un tool autorisé exécuté, un tool refusé sans permission), gating `ai_assistant_view` sur les 4 endpoints, dégradation propre sur timeout Ollama simulé.
- Frontend : mock `api.post('/ai/...')` dans les tests des 4 pages/composants concernés (`ProductFormPage`, `InboxPage`, les 3 onglets Dashboard, nouvelle `AIAssistantPage`).

## Hors périmètre (chantiers séparés, specs futurs)

- Chatbot client sur la boutique publique
- Détection de risque/fraude avancée par IA (au-delà de `CustomerRisk`)
- Analyse prédictive (ventes, stock, retours)
