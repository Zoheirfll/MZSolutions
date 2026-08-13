# Plan — Boîte de réception unifiée + centre de notifications

> Analyse faite sur 2 captures RiseCart (`/admin/connect/messenger` + panneau Notifications).
> Décisions produit validées par l'utilisateur le 2026-08-12.
> Objectif énoncé : **« Boîte de réception, tout doit parvenir là-bas »** — une seule boîte, pas un canal isolé par page comme chez le concurrent.

---

## Décisions figées (ne pas re-poser la question)

| Sujet | Décision |
|---|---|
| Ordre de marche | **Boîte de réception d'abord, canaux internes** (réclamations + échanges). Marche immédiatement, sans dépendre de Meta. Les canaux externes se brancheront comme adaptateurs |
| Réclamations existantes | **Unifiées** — migration de données vers le modèle de conversation commun |
| Compte Meta | **Aucun pour l'instant** → intégration Messenger/WhatsApp **différée**, procédure documentée (comme Shopify) |
| Panneau de notifications | **Dans le périmètre** de ce chantier |

---

## Ce qui existe déjà (réutiliser, ne pas reconstruire)

`orders.Complaint` + `ComplaintMessage` + `ComplaintAssignment` **sont déjà un fil de discussion d'inbox complet** :
- fil horodaté immuable, pièces jointes (nom de fichier randomisé pour la sécurité)
- assignation à un agent (`assign_complaint_round_robin`, `orders/utils.py`)
- workflow de statut `open → in_progress → resolved`
- client identifié sans compte (téléphone + commande, anti-énumération dans `PublicComplaintCreateView`)
- badge sidebar temps réel (`openComplaintsCount`)

Autres briques réutilisables :
- `channels/shopify_oauth.py` (109 lignes) — squelette exact d'un OAuth Meta : état signé, URL d'autorisation, échange de code, vérification HMAC de webhook, enregistrement de webhooks
- Sondage 30 s déjà en place dans `DashboardLayout.jsx` (nouvelles commandes) — à étendre plutôt qu'à dupliquer
- `StoreSettings` — déjà l'endroit des seuils configurables (`low_stock_threshold`, `risk_threshold_orders`, `risk_period_days`)

---

## Modèles — nouvelle app `inbox/`

```
Conversation
  store (FK) · channel : complaint | exchange | messenger | whatsapp | instagram
  subject · status : open | in_progress | resolved
  order (FK → Order, nullable)          ← le contexte commande, notre avantage
  customer_name · customer_phone · external_user_id · external_id
  assigned_to (FK → team.TeamMember, nullable) · assigned_at · assigned_by
  last_message_at · last_customer_message_at   ← sert la fenêtre 24 h Meta plus tard
  unread_count · created_at · updated_at

Message
  conversation (FK) · direction : inbound | outbound
  body · attachment (même upload_to randomisé que ComplaintMessage)
  author (FK User, null = client)
  status_change (CharField, blank)      ← préserve ComplaintMessage.status
  external_id · created_at
```

`Conversation` **absorbe** `Complaint` (sujet, statut, commande, assignation) et `Message` absorbe `ComplaintMessage`. Les trois anciens modèles disparaissent — voir la migration.

`ExchangeRequest` est traité différemment : il garde ses champs métier (variante de remplacement, workflow d'approbation, mouvements de stock) et **gagne un `conversation` OneToOne**. Son `reason` devient le premier `Message`, le `vendor_note` d'approbation un `Message` sortant.

---

## ⚠️ La migration — le point risqué du chantier

`Complaint.description` est **déjà dupliqué** dans le premier `ComplaintMessage` (créé automatiquement à l'ouverture) — la migration ne perd donc rien en supprimant `description`.

Séquence obligatoire, **tests relancés à chaque étape** :

1. Créer `inbox.Conversation` + `inbox.Message` (migration de schéma seule, rien n'est touché)
2. **Migration de données** : pour chaque `Complaint` → une `Conversation` (`channel='complaint'`, `subject`, `status`, `order`, client repris de `order.phone`/nom, assignation reprise de `ComplaintAssignment`) ; pour chaque `ComplaintMessage` → un `Message` (`direction='inbound'` si `author` est null, sinon `outbound` ; `status` → `status_change`)
3. Rebrancher les vues et le frontend sur les nouveaux modèles
4. **Seulement une fois 1-3 vérifiés** : supprimer `Complaint`, `ComplaintMessage`, `ComplaintAssignment` + leurs vues/pages/tests

> Ne jamais laisser les anciens modèles recevoir encore des écritures « au cas où » : deux sources de vérité divergent toujours. Soit on a migré, soit on n'a pas migré.

Points de vigilance :
- `PublicComplaintCreateView` porte une logique **anti-énumération** (404 générique, pas de distinction commande inexistante / mauvais téléphone). La réécrire à l'identique sur `Conversation` — c'est une protection délibérée, pas un détail.
- Le nom de fichier randomisé des pièces jointes (`complaint_attachment_path`) est une mesure de sécurité (URL non devinable) — la conserver sur `Message.attachment`.
- Le badge sidebar compte désormais les conversations ouvertes non lues, plus les réclamations.

---

## Endpoints

```
GET    /api/inbox/conversations/          ?channel=&status=&assigned=&search=&unread=1
GET    /api/inbox/conversations/<id>/     détail + messages + contexte commande
POST   /api/inbox/conversations/<id>/messages/     répondre
POST   /api/inbox/conversations/<id>/status/       changer le statut
PUT    /api/inbox/conversations/<id>/assignment/   assigner un agent
POST   /api/inbox/conversations/<id>/read/         marquer lu/non-lu
GET    /api/inbox/unread-count/                     pour le badge sidebar (sondage)
POST   /api/public/complaints/            inchangé côté client, crée une Conversation
```

**Permission `inbox_view`** à ajouter au `PERMISSION_CATALOG` (`team/models.py`) **dès le départ**, et gater via `can('inbox_view')` / `has_permission(request, 'inbox_view')`. ⚠️ `CLAUDE.md` documente ce piège **deux fois** (Epics 8.1 et 8.4) : une section ajoutée à la sidebar avec un check de rôle codé en dur au lieu de la matrice. Ne pas le refaire une troisième fois.

---

## Frontend

`pages/inbox/InboxPage.jsx` — disposition classique en 3 colonnes :
- **liste des conversations** (filtres canal/statut/assigné, recherche, pastille non-lu, aperçu du dernier message)
- **fil de discussion** (messages entrants/sortants distingués, pièces jointes, changements de statut en ligne)
- **panneau contexte commande** (statut, tracking, articles, historique) — *c'est notre différenciateur, RiseCart ne l'a pas*

Plus :
- **Réponses rapides à variables réelles** : `{{prenom}}`, `{{tracking}}`, `{{statut}}`, `{{total}}` remplies depuis la commande liée — pas du texte figé
- Sidebar : « Boîte de réception » avec badge non-lu, remplace l'entrée « Réclamations »
- « Échanges » reste une entrée séparée (workflow stock spécifique) mais chaque échange est aussi visible dans l'inbox

---

## Centre de notifications (2ᵉ capture)

Deux natures distinctes, à ne pas mélanger :

**Alertes calculées** (aucun stockage — recalculées à la lecture, même philosophie que `CustomerRisk.is_risky`) : taux de retour au-dessus du seuil, taux d'expédition en dessous, stock bas, quota d'essai bientôt épuisé, endpoints webhook en pause après échecs, commandes bloquées sur `no_answer_3`.

**Notifications d'événement** (stockées, avec état lu) — modèle `Notification` : `store`, `category`, `title`, `body`, `link`, `is_read`, `created_at`. Générées à la volée (nouvelle commande, nouveau message client) et par une commande management périodique pour les seuils — **même motif que `sync_carrier_tracking`, à planifier dans le Planificateur de tâches Windows**.

Seuils configurables dans `StoreSettings` (là où vivent déjà les autres seuils).

UI : cloche dans la topbar + panneau latéral à onglets catégorisés avec compteurs, comme la capture.

---

## Messenger / WhatsApp — différé, mais à documenter

Aucune App Facebook n'existe (`settings.py` ne contient que les identifiants Shopify). **Rien à coder dans ce chantier**, mais consigner dans `CLAUDE.md` la procédure et les contraintes réelles, pour que la décision soit prise en connaissance de cause :

- **Messenger** : App Facebook + permission `pages_messaging` → **App Review Meta + vérification d'entreprise obligatoires**. En mode développement, seuls les testeurs déclarés peuvent écrire — aucun vrai marchand ne peut connecter sa page. **Règle des 24 h** : pas de réponse au-delà de 24 h après le dernier message client sans message payant/taggé (d'où `last_customer_message_at` prévu dès maintenant dans le modèle).
- **WhatsApp Business** : compte WABA + vérification d'entreprise + **modèles de messages pré-approuvés** + **facturation à la conversation** (argent réel).
- Même forme de blocage que la distribution publique Shopify : le code peut être complet et correct, la mise en service dépend d'une validation administrative.

Quand le moment viendra, l'architecture par adaptateurs (comme `orders/carriers/` et `channels/clients/`) permet de brancher Messenger sans toucher à l'inbox.

---

## Ordre d'exécution

1. `inbox/` : modèles `Conversation` + `Message` + migration de schéma + **`migrate` sur la base de dev**
2. Migration de données des réclamations (+ vérification manuelle du résultat sur la vraie base)
3. Permission `inbox_view` dans le catalogue + endpoints inbox
4. `InboxPage.jsx` (3 colonnes) + sidebar + badge non-lu (étendre le sondage 30 s existant)
5. Rattacher les échanges (`ExchangeRequest.conversation`)
6. Supprimer `Complaint` / `ComplaintMessage` / `ComplaintAssignment` + anciennes vues/pages/tests
7. Modèle `Notification` + alertes calculées + commande management périodique + cloche/panneau
8. Tests + `CLAUDE.md` (modèles, endpoints, permission, procédure Meta, planification de la commande)

---

## Pièges connus

- **Toujours `manage.py migrate` après `makemigrations`** — `check`/`test` utilisent une base recréée et ne détectent pas une base de dev désynchronisée (bug du 2026-08-12 : liste de commandes vide sur un 500 silencieux)
- **`inbox_view` dans la matrice de permissions dès le départ** — piège déjà tombé deux fois dans ce projet
- **Pas de `npm run build`** — le bundler plante en mémoire sur cette machine. Vérifier par relecture + `npx --no-install esbuild <fichier> --jsx=automatic --bundle=false`
- Pas de websockets dans le projet : l'inbox fonctionne au **sondage** (étendre celui de `DashboardLayout.jsx`, ne pas en créer un second). Temps réel = TBD
- Conserver la logique anti-énumération de `PublicComplaintCreateView` et le nom de fichier randomisé des pièces jointes — ce sont des mesures de sécurité délibérées
