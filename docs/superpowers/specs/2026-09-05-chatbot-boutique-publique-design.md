# Chatbot boutique publique — Design

Date : 2026-09-05
Statut : approuvé par l'utilisateur

## Contexte

2ème chantier IA (sur 4 planifiés, voir `docs/superpowers/specs/2026-09-04-assistant-ia-ollama-design.md` pour le découpage complet). Le 1er chantier (Assistant vendeur, dashboard) est en production, propulsé par `ai_assistant/ollama_client.py` avec deux fournisseurs interchangeables (`AI_PROVIDER=ollama|groq`). Ce chantier ajoute un chatbot sur la **boutique publique** (storefront, sans compte client) qui réutilise cette même infra — aucun nouveau client IA.

## Périmètre

Un widget de chat flottant, présent sur toutes les pages de la boutique publique, capable de répondre à :

1. **Questions produits** — prix, stock, description, variantes, promotions actives.
2. **Infos générales boutique** — livraison, moyens de paiement, contact.
3. **Statut d'une commande** — après vérification téléphone + numéro de commande.

Hors périmètre (décidé explicitement, à ne pas réintroduire silencieusement) : conversations multiples côté visiteur, reprise cross-device, notification vendeur sur les échanges du chatbot.

## Modèle de données

`ai_assistant.models.AIConversation` étendu (pas de nouvelle table) :

```python
class AIConversation(models.Model):
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='ai_conversations')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ai_conversations', null=True, blank=True)
    session_id = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    title = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        constraints = [
            models.CheckConstraint(
                check=(Q(user__isnull=False) & Q(session_id__isnull=True)) | (Q(user__isnull=True) & Q(session_id__isnull=False)),
                name='ai_conversation_user_xor_session',
            ),
        ]
```

Une conversation a **soit** un `user` (canal dashboard, Assistant vendeur — comportement inchangé) **soit** un `session_id` (canal boutique publique) — jamais les deux, jamais aucun des deux. `AIMessage` ne change pas.

Migration : `user` devient `null=True, blank=True` (actuellement obligatoire), ajout de `session_id` + `CheckConstraint`. Aucune donnée existante ne casse la contrainte (toutes les conversations actuelles ont un `user`, jamais de `session_id`).

## Endpoints publics

**Tous les endpoints publics store-scoped sont déjà centralisés dans `products/public_urls.py`** (routé sous `/api/public/store/<slug:slug>/` par `config/urls.py`, `slug` capturé en kwarg par chaque vue — voir `PublicProductListView.get(self, request, slug)` pour le pattern exact) — les vues du chatbot public suivent exactement cette même convention plutôt que d'introduire un nouveau fichier de routes séparé :

```python
# products/public_urls.py — ajouts
from ai_assistant.public_views import PublicChatView, PublicChatHistoryView
...
    path('chat/',                   PublicChatView.as_view()),
    path('chat/<str:session_id>/',  PublicChatHistoryView.as_view()),
```

- `POST /api/public/store/<slug>/chat/` — body `{session_id, message}`. Résout la boutique par `slug` (404 générique si introuvable/inactive, même comportement que les autres endpoints publics). Récupère ou crée `AIConversation(store=store, session_id=session_id)`. Répond `{reply}` (pas de `conversation_id` à renvoyer côté client, contrairement au dashboard — le `session_id` est déjà l'identifiant côté client).
- `GET /api/public/store/<slug>/chat/<session_id>/` — restaure l'historique (liste de `{role, content}`, filtré `role != 'tool'`) au chargement de la page. 200 avec liste vide si aucune conversation pour cette session (pas 404 — un visiteur qui n'a encore rien écrit n'est pas une erreur).

Les deux : `ScopedRateThrottle`, `throttle_scope = 'public_chat'`, nouvelle entrée `'public_chat': '10/min'` dans `REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']` (`config/settings.py`) — plus restrictif que les autres throttles publics existants (`promo: 20/min`) parce que c'est la seule surface IA non-authentifiée et qu'elle partage le même quota Groq gratuit que l'Assistant vendeur du dashboard.

`session_id` : chaîne opaque générée côté client (UUID), jamais interprétée côté serveur au-delà de sa valeur brute — pas de garantie cryptographique d'unicité globale requise (un visiteur ne peut voir que sa propre conversation, scopée `store + session_id`, et une collision accidentelle entre deux visiteurs sur la même boutique n'expose rien de plus sensible qu'une conversation chat déjà publique par nature).

## Tools du chatbot public

Dans `ai_assistant/tools.py`, section clairement séparée des tools dashboard (préfixe `public_` sur les noms de fonction pour ne jamais les confondre ni les enregistrer dans le mauvais `TOOL_REGISTRY`) :

- **`public_search_products(store, query)`** — `store.products.filter(is_active=True, name__icontains=query)`, applique `active_auto_promotion()` (même logique que `PublicProductListView`), retourne nom/prix/prix promo/stock disponible (`total_stock`) pour au plus 5 résultats. Aucune vérification de permission (`is_owner_or_admin`/`has_permission`) — contrairement aux tools dashboard, celui-ci n'a pas de notion d'utilisateur authentifié, seulement la boutique déjà résolue par le `slug` de l'URL.
- **`public_get_order_status(store, phone, order_id)`** — **les deux paramètres requis** (le modèle doit les avoir tous les deux avant d'appeler l'outil, précisé dans sa description). Vérifie `Order.objects.get(store=store, id=order_id, phone=phone)` — sur `DoesNotExist`, retourne un message générique ("Aucune commande trouvée avec ces informations.") **sans jamais distinguer** "téléphone faux" de "commande inexistante" (anti-énumération, même principe que `PublicComplaintCreateView`/`PublicOrderItemsView`). Si trouvée : statut, tracking, wilaya/commune, total.

Pas de tool pour les infos générales (livraison/paiement/contact) — injectées directement dans le prompt système du chatbot public (nom boutique, téléphone/email, réseaux sociaux, devise, moyens de paiement actifs déduits de `payment_method` disponibles) : statique par requête, aucun intérêt à payer un aller-retour outil pour ça.

Deux nouvelles clés dans `TOOL_REGISTRY`/`TOOL_DEFINITIONS`, mais dans un second dict séparé `PUBLIC_TOOL_REGISTRY`/`PUBLIC_TOOL_DEFINITIONS` — jamais mélangés avec les tools dashboard existants (`get_orders_summary` etc., qui eux restent strictement réservés au canal authentifié).

## Vue publique — construction du prompt

`ai_assistant/public_views.py` (nouveau, miroir de `views.py` mais pour le canal public) :

```python
PUBLIC_SYSTEM_PROMPT = """Tu es l'assistant de la boutique en ligne {store_name}. Réponds aux questions des visiteurs sur les produits, la livraison, le paiement, ou le statut de leur commande.

Infos boutique :
- Téléphone : {phone}
- Email : {email}
- Devise : {currency_symbol}
- Paiement : {payment_methods}

Pour le statut d'une commande, demande TOUJOURS le numéro de téléphone ET le numéro de commande avant d'appeler l'outil correspondant — jamais l'un sans l'autre. Reste concis, professionnel, en français."""
```

`PublicChatView.post()` : résout `store` par slug (404 générique sinon), construit l'historique (system prompt + messages persistés + nouveau message), appelle `ollama_client.chat(history, tools=PUBLIC_TOOL_DEFINITIONS)` avec la même boucle multi-tours que `ChatView` (dashboard) — factorisée dans une fonction partagée `_run_chat_loop(history, tool_definitions, tool_executor)` pour ne pas dupliquer la logique de tool-calling entre les deux vues (`ai_assistant/chat_loop.py`, nouveau module).

## Frontend

`components/StorefrontChatWidget.jsx` — bulle flottante bas-droite (icône, badge si nouvelle réponse en attente), montée dans `StorefrontLayout.jsx` (donc présente sur toutes les pages storefront : accueil, liste produits, fiche produit, checkout...). Réutilise `lib/markdown.js` (déjà construit pour l'Assistant vendeur) pour le rendu des réponses, et le même schéma visuel de bulles que `AIAssistantPage.jsx` (avatars, coins cassés) mais adapté au thème **clair** de la boutique publique (`theme.btn.outlineLight` etc., jamais les classes dark-only — piège déjà documenté dans `CLAUDE.md`).

`session_id` : généré une fois via `crypto.randomUUID()`, stocké dans `localStorage` sous une clé scopée par boutique (`mz_chat_session_<slug>`, même principe que `CartContext`). Au montage du widget : si un `session_id` existe pour cette boutique, `GET .../chat/<session_id>/` restaure l'historique ; sinon un nouveau `session_id` est généré au premier message envoyé.

`api/publicApi.js` (existant) étendu avec `sendPublicChatMessage({slug, sessionId, message})` et `getPublicChatHistory({slug, sessionId})`.

## Erreurs & dégradation

Même contrat que le canal dashboard : panne Ollama/Groq → `503 {"detail": "Assistant IA indisponible"}`, jamais un 500. Le widget affiche un message d'erreur discret et reste utilisable (le visiteur peut réessayer), sans jamais bloquer la navigation du reste du site.

## Tests

- Backend : `ai_assistant/tests.py` étendu — `public_search_products`/`public_get_order_status` (dont le cas anti-énumération : téléphone correct + mauvais `order_id` → même message générique que tout faux), `PublicChatView` (création/restauration de conversation par `session_id`, gating `throttle_scope='public_chat'`, boutique inexistante → 404, dégradation 503 sur panne simulée). Migration testée (contrainte `CheckConstraint` — tentative de créer une conversation avec `user` ET `session_id`, ou aucun des deux, doit lever une erreur DB).
- Frontend : `StorefrontChatWidget.test.jsx` — ouverture/fermeture du widget, envoi d'un message, restauration d'historique depuis un `session_id` existant en `localStorage`, affichage d'erreur sur panne IA simulée.
