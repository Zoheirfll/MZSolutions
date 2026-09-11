# Agent IA avec actions d'écriture (scan produit + agent conversationnel façon Claude Code)

Date : 2026-09-11
Statut : approuvé par l'utilisateur

## Contexte

Après 7 chantiers IA livrés (tous en lecture seule ou calcul déterministe), l'utilisateur souhaite une capacité nouvelle et plus ambitieuse : une IA qui peut **agir**, pas seulement conseiller — dans l'esprit de Claude Code lui-même (l'IA propose une modification concrète, montre exactement ce qu'elle va changer, et n'exécute qu'après confirmation explicite de l'utilisateur).

Deux capacités liées par un même mécanisme central :

1. **Scan → brouillon produit** — photo d'un article ou d'un document fournisseur multi-articles → l'IA extrait les champs et prépare un ou plusieurs brouillons, jamais une création directe.
2. **Agent conversationnel avec actions d'écriture** — dans le chat existant (`ai_assistant/`), l'IA peut proposer de modifier des produits/stock/prix (unitaire ou en masse) ou le statut d'une commande précise, toujours avec un aperçu avant/après et un clic de confirmation avant toute écriture réelle.

Décision structurante assumée : c'est le premier accès en écriture donné à l'IA sur des données produit/stock/prix/commande du projet. Conçu avec le même niveau d'exigence que les correctifs de sécurité de l'Epic 8.6 (aucune confiance dans une donnée qui transite par le client, traçabilité complète, réversibilité).

## Principe directeur : l'agent comme conseiller complet

L'agent ne doit pas se limiter à exécuter l'action demandée isolément — il doit pouvoir croiser les signaux déjà calculés par les chantiers IA précédents (audit boutique, prévisions, suivi confirmateurs, rentabilité, risque client) pour donner des recommandations qui relient plusieurs modules entre eux, plutôt que des réponses cloisonnées. Ce principe ne nécessite aucun développement spécifique dans ce chantier — il découle directement de l'élargissement du registre d'outils de lecture déjà planifié (spec `2026-09-11-optimisation-ia-design.md`, 14 outils de lecture au total une fois les deux chantiers livrés) et du prompt système du chat, qui doit encourager explicitement à synthétiser plutôt qu'à répondre outil par outil.

## Mécanisme central : proposition persistée côté serveur

Approche retenue (sur 3 étudiées, voir discussion) : quand l'IA veut écrire, l'outil ne modifie rien — il résout la cible, calcule le résultat avant/après, et l'enregistre dans une table dédiée. L'aperçu affiché au vendeur et l'exécution finale se basent tous les deux sur cet enregistrement serveur, jamais sur des données renvoyées par le navigateur. La cible (liste d'IDs concernés) est **figée au moment de la proposition** et ne sera jamais recalculée à la confirmation, même si l'état de la boutique a changé entre-temps.

Rejetée : aperçu reconstruit à partir des arguments bruts du modèle (le client pourrait falsifier l'action, et la cible serait recalculée au clic — possiblement différente de ce qui a été validé à l'écran). Rejetée : plan en texte suivi d'un second tour où l'IA agit "pour de vrai" (risque de dérive entre ce que le modèle a dit et ce qu'il fait réellement).

## Modèles de données (`ai_assistant/`)

### `AIPendingAction`

```
conversation (FK → AIConversation)
tool_name (ex: 'bulk_update_products', 'update_order_status')
summary (texte lisible, ex: "Désactiver 12 produits de la catégorie Été")
payload (JSONField — détail avant/après par cible : [{id, name, before: {...}, after: {...}}, ...])
target_ids (JSONField, liste figée des IDs concernés — jamais recalculée)
status : pending | confirmed | rejected | expired
created_at, expires_at (created_at + 15 min), resolved_at (nullable)
```

Immuable une fois créé (même philosophie que `StockMovement`/`OrderStatusHistory`) — `payload` et `target_ids` ne changent jamais après coup, seul `status` (et `resolved_at`) évolue.

### `AIProductDraft`

```
store (FK)
source : photo | invoice | chat_text
source_image (ImageField, nullable — absent si source='chat_text')
extracted_data (JSONField — nom, description, prix suggéré, catégorie suggérée, prix d'achat si facture)
status : pending_review | created | discarded
created_product (FK → Product, nullable — rempli une fois validé)
created_at
```

Un scan de facture multi-articles crée plusieurs `AIProductDraft` (un par ligne détectée). Une création de produit via texte seul dans le chat (`propose_create_product`) passe aussi par ce modèle (`source='chat_text'`) pour ne pas dupliquer le flux de validation.

## Outils d'écriture

Nouveau registre séparé `ai_assistant/write_tools.py` (`WRITE_TOOL_REGISTRY`), distinct de `TOOL_REGISTRY` (lecture) — sépare clairement dans le code ce qui peut écrire de ce qui ne fait que lire. Chaque outil résout la cible et calcule le before/after, puis crée un `AIPendingAction` — il n'écrit jamais lui-même, seul l'endpoint de confirmation exécute.

- **`propose_update_product(name_or_id, changes)`** — un seul produit, champs prix/stock/statut/catégorie.
- **`propose_bulk_update_products(filter, changes)`** — résout `filter` (catégorie, statut, plage de prix) en liste d'IDs au moment de la proposition, **plafonnée à 50 produits par action**. Au-delà, l'outil refuse et indique à l'IA d'affiner le filtre plutôt que de proposer une action géante en un clic.
- **`propose_create_product(details)`** — brouillon texte seul (sans photo), crée un `AIProductDraft(source='chat_text')`.
- **`propose_update_order_status(order_number, new_status, note)`** — commande unique désignée par son numéro exact (jamais par recherche floue ou nom de client). À la confirmation, réutilise `_transition_order_status()` existant (`orders/views.py`) — mêmes effets de bord qu'un changement manuel (historique, webhook, commission dropshipper), aucune logique parallèle. **Portée volontairement limitée** : pas d'action en masse sur commandes, pas de réassignation de confirmateur dans ce chantier — reporté à un chantier séparé une fois le mécanisme éprouvé en usage réel, vu les effets en cascade plus lourds qu'un changement de produit.

### Endpoints de résolution

- `POST /api/ai/pending-actions/<id>/confirm/` — revérifie `is_owner_or_admin(request) OR has_permission(request, 'ai_agent_write')`, relit l'action en base (jamais les données du payload de la requête), vérifie `status == 'pending'` et non expirée, exécute dans une transaction atomique, journalise dans `audit.AuditLog` (`actor_role='ai_agent'`), passe `status='confirmed'` + `resolved_at`.
- `POST /api/ai/pending-actions/<id>/reject/` — passe `status='rejected'` + `resolved_at`, aucune écriture sur les données métier.
- Une action déjà résolue (`confirmed`/`rejected`/`expired`) renvoie 409 sur une nouvelle tentative de confirm/reject — garde d'idempotence, même principe que `Order.restocked_at`.

## Pipeline de scan (vision)

**Un seul appel, détection automatique du type de document** — le prompt demande au modèle de répondre soit `{"type": "product", "data": {...}}` soit `{"type": "invoice", "items": [{...}, ...]}`, sans que le vendeur ait à préciser lequel il upload.

- `ai_assistant/vision_client.py` (nouveau module, même principe multi-fournisseur que `ollama_client.py`) — `GROQ_VISION_MODEL` (un modèle Llama 4 de Groq, multimodal, contrairement au modèle texte actuel `GROQ_MODEL`) comme fournisseur principal. Ollama vision (`llava`/`llama3.2-vision`) reste hors de portée tant que le serveur de prod n'a pas été dimensionné au-delà de l'incident RAM du 2026-09-05 (voir TBD existant).
- `POST /api/ai/scan/` — owner/admin + `ai_agent_write`, upload d'image validé par `core/validators.py` (whitelist format, taille max, déjà existant), `throttle_scope='ai_scan'` (nouveau, ex. 20/heure — un appel vision est plus coûteux qu'un appel texte).
- Réponse du modèle non parsable en JSON valide → erreur explicite ("Photo pas assez nette, réessayez") — jamais un brouillon partiellement rempli présenté comme fiable.
- Résultat : un ou plusieurs `AIProductDraft(status='pending_review')`, jamais un `Product` créé directement.

### Résultat côté frontend

- **Photo d'un seul produit** → redirige vers `ProductFormPage.jsx` en mode création, champs pré-remplis depuis `extracted_data` — la sauvegarde reste le bouton normal du formulaire, donc les mêmes validations serveur s'appliquent qu'une création manuelle.
- **Document multi-articles** → nouvelle page `pages/products/ProductDraftsPage.jsx` : liste des brouillons avec case à cocher par ligne, aperçu des champs détectés, bouton "Créer les produits sélectionnés" (crée chaque brouillon coché via le serializer produit standard, marque `status='created'` + `created_product`).

## Comportement dans le chat

Un outil d'écriture ne renvoie pas de résultat classique au modèle — il renvoie `{"status": "en_attente_de_confirmation", "action_id": N}`, et le tour de conversation s'arrête immédiatement (prompt système : jamais enchaîner plusieurs propositions dans une même réponse, jamais supposer une confirmation à venir). Le frontend affiche une carte dédiée dans le fil (pas un message texte brut) : résumé + tableau avant/après + boutons "Confirmer"/"Rejeter". `AIMessage` gagne un champ `pending_action` (FK nullable → `AIPendingAction`) pour piloter ce rendu.

**Durcissement** : les outils de `WRITE_TOOL_REGISTRY` sont exclus de la liste transmise au modèle si l'utilisateur courant n'a pas `ai_agent_write` — pas seulement revérifiés à l'exécution, absents du schéma envoyé au modèle pour cette requête.

## Permission

**`ai_agent_write`** — nouvelle clé dans `PERMISSION_CATALOG` (catégorie "Administration", à côté de `ai_assistant_view`), **owner/admin strict, non configurable** dans la matrice de rôles (même traitement que `/dashboard/equipe/permissions` — donner à l'IA un accès en écriture est en soi une élévation de privilège). `ai_assistant_view` (lecture) reste inchangée, indépendante et pourra continuer d'être étendue séparément.

## Garde-fous

- Plafond dur de 50 cibles par action en masse (`propose_bulk_update_products`).
- Expiration 15 minutes sur toute proposition non résolue (`AIPendingAction.expires_at`), vérifiée à la confirmation.
- Cible figée à la proposition, jamais recalculée à la confirmation (protège contre un état de boutique qui change entre l'aperçu et le clic).
- Aucune action destructive irréversible proposable par l'IA (pas de suppression définitive — uniquement statut/prix/stock/soft-delete équivalents).
- Chaque proposition et chaque résolution (confirmée/rejetée/expirée) journalisée dans `audit.AuditLog` avec `actor_role='ai_agent'` (nouvelle valeur, aux côtés de `owner`/`admin`/`confirmateur`/`dropshipper` — distingue une action IA d'une action humaine dans le même journal).
- Dégradation propre sur panne du modèle (texte ou vision) → 503 explicite, jamais un résultat partiel présenté comme fiable — même philosophie que `webhooks.dispatch.fire_event`/les 7 chantiers IA précédents.

## Hors périmètre (ce chantier)

- Actions en masse sur les commandes, réassignation de confirmateur via l'IA — reportées à un chantier séparé une fois ce mécanisme éprouvé en usage réel sur les produits.
- Suppression définitive de données via l'IA — jamais dans ce chantier ni les suivants sans décision produit explicite dédiée.
- Ollama vision (dépend de l'upgrade serveur déjà identifié en TBD).
- Undo après confirmation — une action confirmée est exécutée comme une action manuelle équivalente (ex. un changement de stock produit un `StockMovement` classique, réversible par les mécanismes déjà existants — ajustement manuel, pas un "annuler" dédié à l'IA).

## Tests prévus

- Backend : chaque outil d'écriture isolément (calcul before/after correct, plafond de 50 respecté et message de refus explicite au-delà, cible figée non recalculée à la confirmation même si l'état a changé entre-temps, expiration réellement bloquante avec 409 sur tentative après coup, double confirmation/rejet refusée). `ai_agent_write` : outil absent du schéma transmis au modèle pour un non-admin, ET confirmation refusée si l'endpoint est appelé directement sans la permission. Scan : image invalide (validators existants), réponse JSON malformée du modèle → erreur explicite sans brouillon créé. Création de produit depuis un brouillon (scan ou texte) revérifiée comme équivalente à une création manuelle (mêmes contraintes serializer).
- Frontend : rendu de la carte de proposition dans le chat (aperçu avant/après, boutons confirmer/rejeter), `ProductDraftsPage.jsx` (sélection, création en lot, brouillon rejeté), upload de scan avec erreur serveur gérée sans crash, pré-remplissage de `ProductFormPage.jsx` depuis un brouillon photo.
