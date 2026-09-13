# Agent IA — moteur complet (conseiller + écriture élargie + aide contextuelle)

Date : 2026-09-13
Statut : approuvé par l'utilisateur (contrôle total délégué — décisions ci-dessous prises par Claude, à documenter et non à re-valider avant implémentation)

## Contexte

Suite au 8ème chantier IA (agent avec actions d'écriture, 4 outils : produit, produit en masse, création produit, statut commande), l'utilisateur veut un « moteur complet » — reformulé et cadré en 4 sous-chantiers via brainstorming :

- **D — Conseiller complet** : l'IA doit pouvoir juger/conseiller sur n'importe quelle donnée ("ce produit est-il bon ?", "mon nombre de commandes est-il normal ?", "puis-je faire confiance à ce chiffre ?"), pas seulement réciter un outil isolé.
- **A — Écriture élargie** : au-delà de produits/commandes, écrire sur équipe (inviter/désactiver/rôle), transporteurs & tarifs de livraison, clients (risque manuel/liste noire), paramètres boutique (seuils, réglages généraux) — **explicitement exclu** : la matrice de permissions par rôle (décision utilisateur explicite, reste hors chat, seul cas `ownerAdmin` non configurable du projet).
- **C — Reconfiguration de réglages complexes** : fusionné dans A (mêmes réglages : dispatch, tarifs, seuils — pas un mécanisme différent).
- **B — Aide contextuelle par page** : un "?" par page (texte fixe, comme `HelpTooltip`/`PageInfoButton` existants) généralisé aux pages qui n'en ont pas encore, **et** le chat qui peut expliquer une page à la demande en réutilisant exactement le même texte (jamais une description inventée par le modèle).

Ordre d'implémentation choisi (impact/risque croissant) : **D → A → B**.

## D — Conseiller complet

### Principe

Pas de nouveau modèle de données, pas de nouvel écran. Deux leviers :

1. **Prompt système renforcé** (`ChatView`) — instruction explicite de croiser plusieurs outils avant de répondre à une question de jugement ("est-ce que X est bon/normal ?"), jamais répondre avec un seul chiffre sans contexte de comparaison.
2. **3 nouveaux outils de comparaison** (`ai_assistant/tools.py`), tous en lecture seule, même permission que leur équivalent REST :
   - `compare_period(metric, period)` — compare une métrique (`orders`, `revenue`, `confirmation_rate`, `return_rate`) à la période précédente équivalente (réutilise `orders.utils.parse_period` + les vues stats déjà existantes), renvoie `{current, previous, change_pct}`. Permission `stats_view`.
   - `assess_product(name_or_id)` — synthèse d'un produit unique : marge (`cost_price`), stock/rupture estimée (`products.stock_forecast.days_until_stockout`), score de mise en avant s'il en a un (`products.recommendations`), fourchette de prix suggérée (`products.pricing.suggest_price`, déjà construit). Un seul appel qui agrège 3 modules déjà existants — permission `products_view OR purchase_prices_view` (le prix d'achat/marge reste masqué sans `purchase_prices_view`, mais le reste — stock, mise en avant — répond quand même).
   - `get_store_audit_summary()` — renvoie le dernier `stores.StoreAudit` calculé (scores catalogue/confirmation/stock/retours + synthèse), sans le recalculer (évite un appel IA en cascade dans un appel IA) — si aucun audit n'existe encore, renvoie un message invitant à lancer "Analyser ma boutique" depuis `/dashboard/audit-boutique`. Permission `store_audit_view`.

### Hors périmètre

Pas de nouveau moteur de "confiance"/fiabilité des données — l'IA explique sa réponse à partir de ce que les outils renvoient, elle ne juge jamais la fiabilité des données sous-jacentes (aucun mécanisme pour ça dans le projet).

## A — Écriture élargie

Réutilise **exactement** le mécanisme déjà en place (`AIPendingAction`, `write_tools.py`, `PendingActionConfirmView`/`RejectView`, carte de proposition dans le chat) — chaque nouvel outil suit le même contrat que les 4 existants : résout la cible, calcule avant/après, crée la proposition, jamais d'écriture directe. Vérification stricte `is_owner_or_admin(request)` partout (même règle que les 4 outils existants — écriture IA = owner/admin uniquement, non négociable).

### Nouveaux outils (`write_tools.py`)

- **`propose_toggle_team_member(name_or_email, is_active)`** — active/désactive un membre d'équipe existant (jamais une invitation directe par l'IA : créer un compte envoie un email réel à un tiers, action à trop fort impact pour la déléguer à une proposition IA sans revue humaine du destinataire — **décision** : l'invitation reste un geste humain volontaire sur `TeamPage.jsx`, seule l'activation/désactivation d'un membre déjà existant passe par le chat).
- **`propose_update_carrier_default(carrier_name)`** — change le transporteur par défaut de la boutique parmi les comptes déjà connectés et actifs (`CarrierAccount.is_default`). Ne crée jamais de nouveau compte transporteur (une clé API est une donnée trop sensible pour être saisie via un chat).
- **`propose_update_wilaya_rate(wilaya_name, home_price, desk_price)`** — met à jour (ou crée) le tarif d'une wilaya (`WilayaRate`), même modèle que `ParametresLivraisonPage.jsx` onglet Tarification.
- **`propose_toggle_client_risk(phone, manual_risk)`** — bascule `CustomerRisk.manual_risk` pour un numéro de téléphone.
- **`propose_blacklist_phone(phone, message)`** / **`propose_unblacklist_phone(phone)`** — ajoute/retire un numéro de `BlacklistedPhone`.
- **`propose_update_store_settings(low_stock_threshold, risk_threshold_orders, risk_period_days, insurance_fee)`** — met à jour un sous-ensemble de `StoreSettings` (les 4 champs numériques les plus demandés en langage naturel ; pas les toggles de comportement type `deduct_stock_on_order_create`, moins naturels à formuler en une phrase et à plus fort risque de malentendu — restent réservés à la page Paramètres).

### `_execute_pending_action` étendu

Ajout d'un `elif` par nouveau `tool_name`, même structure que l'existant. Aucune modification du contrat `AIPendingAction`/de l'endpoint confirm/reject.

## B — Aide contextuelle par page

### Registre central

`frontend/src/lib/pageHelp.js` — un objet `{ '/dashboard/produits': "texte...", '/dashboard/commandes': "texte...", ... }`, une entrée par route principale du dashboard (~70 pages). Généré en reprenant/adaptant les `subtitle` déjà passés à `DashboardLayout` (déjà rédigés pour la plupart des pages) plutôt que d'inventer un nouveau texte partout.

- **Frontend** : `DashboardLayout.jsx` route déjà chaque page avec un `subtitle` — le "?" (`PageInfoButton`, déjà existant) l'affiche déjà pour beaucoup de pages. Généralisé : toute page sans `subtitle` explicite en reçoit un via `pageHelp.js` (fallback automatique par route, dans `DashboardLayout`), pour ne plus avoir de pages sans aide.
- **Backend/chat** : nouvel outil `get_page_help(page_path)` (`ai_assistant/tools.py`, aucune permission spécifique au-delà de `ai_assistant_view` déjà requis pour utiliser le chat) — importe `pageHelp.js`... **impossible directement** (le backend Python ne peut pas importer un module JS). **Décision** : le registre canonique vit côté **backend** (`ai_assistant/page_help.py`, dict Python), le frontend le consomme via un endpoint léger `GET /api/ai/page-help/` (liste complète, mise en cache côté client) plutôt que de dupliquer le texte des deux côtés — une seule source de vérité, le frontend n'a plus besoin de son propre fichier `pageHelp.js`.

### Hors périmètre

Pas de génération dynamique du texte d'aide par IA (risque de description imprécise/datée, explicitement écarté par l'utilisateur en choisissant "texte fixe" + "le chat réutilise le même texte").

## Tests prévus

- **D** : chaque nouvel outil testé isolément (permission, données correctes sur cas connus, dégradation si aucun audit boutique n'existe encore) + vérification que le prompt système mentionne bien la consigne de synthèse (pas testable automatiquement au-delà de sa présence dans le message système — le comportement du modèle lui-même n'est pas testé, comme pour tous les prompts du projet).
- **A** : chaque nouvel outil d'écriture testé comme les 4 existants (calcul before/after, permission stricte owner/admin, exécution réelle via confirm, `AuditLog` créé) + garde-fou explicite qu'aucun outil ne crée de compte transporteur ni n'envoie d'invitation équipe.
- **B** : `GET /api/ai/page-help/` renvoie le dict complet, `get_page_help` outil chat renvoie le même texte qu'un GET direct sur l'endpoint (source unique), fallback correct sur `DashboardLayout.jsx` pour une page sans `subtitle` explicite.

Suite complète (`manage.py test` + `npm run test` + `npm run build`) revérifiée après chaque sous-chantier avant de passer au suivant.
