# Audit de sécurité — MZSolutions

> Journal d'audit continu, mis à jour à chaque passe. Chaque correctif de code est présenté en diff et validé par l'utilisateur avant application (aucun commit/push automatique — voir CLAUDE.md).

---

## 2026-07-21 — ✅ 1. XSS (Cross-Site Scripting)

**Statut : aucune faille trouvée.**

Périmètre déjà largement mitigé par l'Epic 8.6 (audit de sécurité précédent). Points vérifiés :

| Vecteur | Constat |
|---|---|
| `dangerouslySetInnerHTML` (frontend) | Un seul usage — `StorefrontPagePage.jsx` (contenu de page boutique, éditeur riche TipTap) — passé par `lib/sanitize.js::sanitizeHtml()` (DOMPurify v3.4.11, whitelist stricte de balises/attributs, pas de `script`/`iframe`/`on*`) |
| Scripts pixels marketing (`lib/pixels.js`) | `pixel_id` validé par regex stricte (`^[A-Za-z0-9_-]+$`) avant interpolation dans les scripts inline injectés (Facebook/TikTok/GA/GTM) — empêche l'évasion de chaîne littérale |
| Emails (OTP, reset password, notifications) | Texte brut uniquement (`send_mail(message=...)`), jamais `html_message=` avec des champs utilisateur interpolés — pas de vecteur HTML |
| Flux catalogue public (`PublicCatalogFeedView`, `products/views.py`) | Tous les champs (nom produit, description, marque, image) passés par `django.utils.html.escape()` avant interpolation dans le XML |
| Templates Django | Aucun `mark_safe`, `{% autoescape off %}`, ou `format_html()` non échappé trouvé dans tout `backend/` |
| Rendu React général | Pas de JSX brut ailleurs — React échappe automatiquement le texte interpolé |
| Liens `href`/`window.open` | Construits à partir de données internes (slugs, URLs media backend) — pas de concaténation de chaîne utilisateur arbitraire dans un contexte exécutable |

**Aucune action requise.**

---

## 2026-07-21 — ✅ 2. Rate limiting (corrigé)

**Statut : failles trouvées et corrigées.**

8 endpoints publics/sensibles sans `throttle_scope` (donc sans limite réelle malgré `ScopedRateThrottle` déjà configuré depuis l'Epic 8.6) :

| Vue | Risque |
|---|---|
| `PublicOrderView` (`orders/views.py`) | Spam de commandes (quota trial, DB), martelage du check `BlacklistedPhone` |
| `PublicOrderItemsView` (`orders/views.py`, GET par téléphone) | Oracle d'énumération : réponse différente (200/404) selon qu'un téléphone a une commande — brute-force de numéros algériens sans limite |
| `PublicExchangeCreateView` (`orders/views.py`) | Même vérification téléphone + création en masse de demandes d'échange |
| `PublicComplaintCreateView` (`orders/views.py`) | Spam de réclamations + upload de pièce jointe (5 Mo) sans limite = risque disque |
| `PublicReviewView` (`products/views.py`) | Spam d'avis clients |
| `GoogleRegisterView` (`accounts/views.py`) | Incohérence : `RegisterView` a `throttle_scope='register'`, pas l'inscription Google |
| `AcceptInvitationView` (`team/views.py`) | Brute-force du token d'invitation |
| `PublicAbandonedCartView` / `PublicMarkCartRecoveredView` (`orders/views.py`) | Accès par identifiant de panier |

**Modifications appliquées :**
- `backend/config/settings.py::DEFAULT_THROTTLE_RATES` — ajout de 6 scopes : `order` 10/min, `exchange` 10/min, `complaint` 10/min, `review` 10/min, `invitation` 20/min, `abandoned_cart` 20/min
- `throttle_scope` ajouté sur les 8 vues ci-dessus (réutilisation du scope `register` existant pour `GoogleRegisterView`)

Non couvert (jugé faible risque, lecture seule de données déjà publiques) : `PublicStoreView`, `PublicProductListView`/`PublicProductDetailView`, `PublicCategoryListView`, `PublicCatalogFeedView`, `PublicStorePageListView`/`PublicStorePageView`.

## 2026-07-21 — ⚠️ 3. Secrets en dur (hardcoded API keys)

**Statut : 2 problèmes trouvés — 1 corrigé, 1 non corrigé (action destructive, nécessite votre décision).**

| Constat | Détail | Statut |
|---|---|---|
| `frontend/.env.production` suivi par Git | Contient l'URL ngrok de prod — pas une vraie clé secrète, mais casse la logique du `.gitignore` (les autres `.env` sont ignorés) | ✅ Corrigé — `git rm --cached` + ajout à `.gitignore` |
| Ancien `SECRET_KEY` Django codé en dur dans l'historique Git | `django-insecure-^^98=rxj@5_u&s7(g)u%7gfocjo+=vodbr5@er-$tncy$vj#o8` — ajouté puis retiré dans un commit ultérieur (probablement le correctif Epic 8.6). Le code actuel est propre, mais la clé reste récupérable via `git log -p` par quiconque a accès au dépôt | ⚠️ **Non corrigé** — réécrire l'historique Git est une action destructive (change tous les hash de commits, force-push nécessaire si déjà partagé) : à faire seulement sur votre décision explicite |

**Propre (rien à corriger) :**
- Tous les secrets backend passent par `config()` (django-decouple), aucun repli codé en dur sur les valeurs sensibles (`SECRET_KEY`, `CHARGILY_*`, `SHOPIFY_*`, `EMAIL_HOST_PASSWORD`)
- `backend/.env`/`frontend/.env` bien ignorés, jamais commités
- Génération de tokens (`WebhookEndpoint.secret`, `IncomingWebhookKey.key`, `TeamMember.invite_token`) via le module `secrets` (cryptographiquement sûr)
- Aucune vraie clé API/clé privée trouvée dans le code ou l'historique
- `VITE_GOOGLE_CLIENT_ID` exposé côté frontend — normal, un client ID OAuth n'est pas un secret

**Modifications appliquées :**
- `.gitignore` — ajout de `frontend/.env.production`
- `git rm --cached frontend/.env.production` (fichier gardé localement, plus suivi)

## 2026-07-21 — ✅ 4. Authentification manquante (missing authentication)

**Statut : aucune faille trouvée.**

Vérifié sur ~120 vues (`backend/*/views.py`) :

| Vecteur | Constat |
|---|---|
| Défaut DRF | `DEFAULT_PERMISSION_CLASSES = (IsAuthenticated,)` — deny-by-default, aucune vue ne redéfinit `permission_classes = []` |
| Toutes les vues `AllowAny` (29 au total) | Chacune passée en revue — soit endpoints d'auth publics légitimes (register/login/verify/reset), soit endpoints publics boutique (catalogue), soit webhooks avec vérification de signature HMAC (`ChargilyWebhookView`, `ShopifyOrderWebhookView`, `ShopifyComplianceWebhookView`), soit callback OAuth Shopify protégé par HMAC + `state` signé (`ShopifyCallbackView`) |
| `PasswordResetConfirmView` (`accounts/views.py`) | Récupère l'utilisateur par `uid` décodé, mais l'action réelle est protégée par `token_generator.check_token()` (token Django cryptographiquement lié à l'état du compte) — pas un accès libre |
| IDOR (`.objects.get(pk=...)` sans scope boutique) | Un seul cas suspect à première vue (`channels/views.py:200`), mais `store_id` provient du `state` signé (`TimestampSigner`, vérifié avant), pas d'une entrée brute — pas une IDOR |
| Vues `IsAuthenticated` sans check owner/admin explicite (`OrderStatusView`, `ComplaintStatusView`, `ExchangeStatusView`, etc.) | Comportement voulu et cohérent avec l'architecture documentée dans CLAUDE.md : les actions opérationnelles quotidiennes (changer un statut commande/réclamation/échange) sont ouvertes à tout membre authentifié de la boutique (confirmateur inclus), seules les vues de configuration/finances/permissions restent owner/admin-only — pas une régression |
| `CallAttemptListView` | Restriction déjà en place (owner/admin, ou confirmateur assigné, ou dropshipper propriétaire de la commande — correctif Epic 8.6 confirmé toujours actif) |
| Vues sensibles owner/admin (`PixelConfigListCreateView/DetailView`, `ChannelConnectionListCreateView`, `WebhookEndpointListCreateView`, `finance/views.py`, `dropshipping/views.py`) | Toutes vérifiées avec `is_owner_or_admin(request) or has_permission(request, '<scope>_view')` cohérent avec la matrice de permissions (Epic 7.5/8.4) |

**Aucune action requise.**

## 2026-07-21 — ✅ 5. Authentification faible (mots de passe) — corrigé

**Statut : 2 failles trouvées et corrigées.**

| Constat | Détail |
|---|---|
| `AUTH_PASSWORD_VALIDATORS` (settings.py) jamais invoqué | `RegisterSerializer.password` n'avait qu'un `min_length=8` ; `PasswordResetConfirmView` faisait `len(new_password) < 8` en dur — les validators configurés (similarité avec le profil, mot de passe courant, tout numérique) n'étaient jamais réellement appliqués. Un mot de passe comme `12345678` ou `password1` passait |
| Code OTP (`_generate_code`, `accounts/views.py`) généré via `random.choices` | Module non cryptographique — risque théorique faible vu le rate limiting déjà en place (10/min, expire 15 min), mais mauvaise pratique pour un code de sécurité |

**Modifications appliquées :**
- `accounts/serializers.py::RegisterSerializer` — ajout de `validate_password()` appelant `django.contrib.auth.password_validation.validate_password()`
- `accounts/views.py::PasswordResetConfirmView` — remplacement du check `len() < 8` par le même `validate_password(new_password, user=user)` (avec contexte utilisateur pour `UserAttributeSimilarityValidator`)
- `accounts/views.py::_generate_code()` — `random.choices` → `secrets.choice` (module cryptographique)
- `accounts/views.py::GoogleRegisterView` — `throttle_scope = 'register'` ajouté au passage (cohérence avec `RegisterView`, repéré pendant ce point)

Suite de tests `accounts` (27 tests) verte après correctif.

## 2026-07-21 — ✅ 6. Autorisation faible (weak authorization / IDOR)

**Statut : aucune faille trouvée.**

Passé en revue tous les lookups par identifiant (`.objects.get(pk=...)`) dans `orders`, `products`, `stores`, `team`, `channels`, `webhooks`, `finance`, `dropshipping` (~35 vues) : **100% des lookups passent par le related manager scopé boutique** (`store.orders.get(pk=pk)`, `store.complaints.get(pk=pk)`, `store.team_members.get(pk=pk)`, etc.) plutôt que par `Model.objects.get(pk=pk)` brut — aucun accès cross-tenant possible en changeant un ID dans l'URL/payload.

Cas particuliers vérifiés :
- `DropshipperDetailView` : un dropshipper ne peut consulter que son propre `pk` (`str(membership.pk) != str(pk)` → 403) ; owner/admin peuvent consulter n'importe quel dropshipper de leur boutique
- `OrderAssignmentView`/`ComplaintAssignmentView` : le `confirmateur` assigné est vérifié via `store.team_members.get(pk=..., role='confirmateur')` — impossible d'assigner un membre d'une autre boutique
- `PublicExchangeCreateView` : la variante de remplacement est filtrée via `variant__product=order_item.product` — confinée au bon produit/boutique même si l'ID de variante d'un autre produit est fourni
- `PasswordResetConfirmView` (`accounts/views.py`) : récupère l'utilisateur par `pk` décodé mais l'action reste protégée par le token Django lié à l'état du compte (pas un accès libre)

**Aucune action requise.**

## 2026-07-21 — ✅ 7. Sécurisation des fichiers média — corrigé

| Vecteur | Constat |
|---|---|
| Bypass des validators (extension/taille) | Toutes les créations avec upload passent soit par un serializer DRF (déclenche les validators de champ), soit appellent explicitement `validate_uploaded_file()` avant `.objects.create()` (`MediaFileUploadView`, `ProductImageView`, + les 3 vues `ComplaintMessage` corrigées au point 1) — vérifié par grep exhaustif sur tous les `.objects.create(...image=/file=/attachment=...)` du projet |
| Path traversal | Stockage par défaut Django (`FileSystemStorage`), pas de storage custom — noms de fichiers sanitizés par `get_valid_name()` |
| Exposition en production | Médias servis uniquement si `settings.DEBUG` (`config/urls.py`) — délégué à un serveur web externe en prod (cohérent avec le TBD infra déjà noté dans CLAUDE.md) |
| **Noms de fichiers prévisibles** (`ComplaintMessage.attachment`, dossier plat `complaints/`, nom original conservé) | Pour les images produit/catégorie/avis, sans risque (déjà publiques sur la boutique). Pour les pièces jointes de réclamation, plus sensible : URL prévisible, pas de scoping par boutique au niveau média — un tiers connaissant/devinant le nom exact du fichier peut y accéder sans authentification |

**Corrigé** : `ComplaintMessage.attachment` utilise désormais `upload_to=complaint_attachment_path` (`orders/models.py`) — génère un nom de fichier aléatoire (`uuid4().hex`) au lieu de conserver le nom original, dans le dossier `complaints/`. Migration `0021_alter_complaintmessage_attachment` appliquée.

## 2026-07-21 — ✅ 8. Input validation — corrigé (faille critique)

**Statut : faille critique trouvée et corrigée.**

`PublicOrderView.post()` (checkout invité, **sans authentification**) et `OrderListCreateView.post()` créaient `OrderItem.objects.create(quantity=item.get('quantity', 1))` sans aucune validation de type/positivité. Le modèle a `quantity = PositiveIntegerField`, mais aucune contrainte `CHECK` en base (vérifié : `OrderItem._meta.constraints == []`), et `.objects.create()` contourne `full_clean()` — même piège de fond que le point 1 (upload) et le bug prix déjà corrigé à l'Epic 8.6.

**Exploit confirmé par lecture de code** (checkout public, sans compte) :
- `quantity: -1000` sur une ligne panier → `order.recalculate()` (`subtotal = sum(price*quantity)`) devient négatif, permettant de ramener `total` près de 0 en combinant avec une ligne légitime
- Le même `-1000` traverse `_deduct_stock_for_order()` (`stock = max(stock - quantity, 0)`) → `stock - (-1000) = stock + 1000` → **inflation arbitraire du stock produit**
- Une `quantity` non numérique aurait probablement provoqué un 500 non géré à l'insertion Postgres

**Modifications appliquées** (`orders/views.py`) :
- Ajout de `_validate_item_quantity(item)` : convertit en `int`, rejette si `< 1` ou `> MAX_ORDER_ITEM_QUANTITY` (10 000), retourne `None` sinon
- `PublicOrderView.post()` et `OrderListCreateView.post()` : validation de chaque ligne avant résolution du prix (400 si invalide) + `quantity=_validate_item_quantity(item)` à la création de `OrderItem` (au lieu de `item.get('quantity', 1)` brut)

Suite de tests `orders` (74 tests) verte après correctif.

## 2026-07-21 — ✅ 8bis. Pagination non bornée — corrigé

**Statut : corrigé.**

`page`/`per_page` parsés via `int(request.query_params.get(...))` sans `try/except` (crash 500 sur valeur non numérique) et sans plafond haut (sauf 1 endroit sur 10) dans `products/views.py` (5 endroits) et `orders/views.py` (5 endroits).

**Modifications appliquées :**
- Nouveau `backend/core/pagination.py::parse_pagination(request, default_per_page, max_per_page=100)` — parsing sûr (`try/except` interne, retombe sur la valeur par défaut si non numérique), `page` planché à 1, `per_page` borné entre 1 et 100
- Les 10 endroits (5 dans `products/views.py`, 5 dans `orders/views.py`, dont l'ancien `AbandonedCartListView` qui avait déjà un plafond ad hoc) remplacés par cet appel unique

Tests `orders`/`products` en cours de vérification.

## 2026-07-21 — ✅ 10. Dépendances vulnérables — corrigé

**Statut : failles trouvées et corrigées (backend), acceptées en l'état (frontend).**

**Backend** (`pip-audit`) :

| Paquet | Version | CVE | Corrigé vers |
|---|---|---|---|
| Django | 5.2.15 | PYSEC-2026-2090/2091/2092 | 5.2.16 |
| Pillow | 12.2.0 | ~10 CVE (dont CVE-2026-54058, 59197-59200, 59204) | 12.3.0 |
| pyasn1 | 0.6.3 | CVE-2026-59885/59886 | 0.6.4 |

**Frontend** (`npm audit`) :

| Paquet | Vulnérabilité | Fix npm disponible ? |
|---|---|---|
| xlsx 0.18.5 | Prototype Pollution + ReDoS (sévérité haute) | Non (`fixAvailable: false`, SheetJS ne republie plus le correctif sur le registre npm) |

Usage vérifié (`OrdersPage.jsx`) : `xlsx` utilisé **uniquement en écriture** (export Excel des commandes), jamais pour parser un fichier externe — les deux CVE s'exploitent en lisant un fichier malveillant, non applicable ici. Risque réel jugé faible, **laissé en l'état** (décision utilisateur).

**Modifications appliquées :**
- `backend/requirements.txt` — `Django` 5.2.15→5.2.16, `pillow` 12.2.0→12.3.0, `pyasn1` 0.6.3→0.6.4
- Paquets mis à jour dans le venv local (`pip install -U ...`)
- `pip-audit` (outil d'audit, pas une dépendance du projet) désinstallé après usage

`python manage.py check` propre après montée de version ; suite de tests complète en cours de vérification.

## 2026-07-21 — ✅ 11. CSRF / CORS — corrigé

**Statut : faille trouvée et corrigée.**

`CORS_ALLOWED_ORIGINS`/`CORS_ALLOWED_ORIGIN_REGEXES`/`CORS_ALLOW_CREDENTIALS=True` (`config/settings.py`) n'étaient **pas conditionnés par `DEBUG`** — actifs aussi en production. `CORS_ALLOWED_ORIGIN_REGEXES` autorisait tout `*.ngrok-free.dev`/`*.ngrok.io` — domaines de tunnel gratuits accessibles à n'importe qui, pas seulement à nous. Combiné à `CORS_ALLOW_CREDENTIALS=True`, un attaquant pouvait créer son propre tunnel ngrok gratuit dont l'origine passait la vérification CORS avec les credentials autorisés. Impact réel limité à **Django Admin** (`/admin/`, seul point du projet basé sur cookie de session + CSRF — le reste de l'API utilise un JWT Bearer non auto-envoyé cross-origin).

**Modifications appliquées** (`config/settings.py`) :
- Bloc CORS conditionné par `if DEBUG:` — origines `localhost`/regex ngrok uniquement en dev
- En production (`else`) : `CORS_ALLOWED_ORIGINS` lu depuis `.env` (`CORS_ALLOWED_ORIGINS`, vide par défaut), `CORS_ALLOWED_ORIGIN_REGEXES = []`

`python manage.py check` propre après correctif. Vérifié aussi au passage (propre, rien à corriger) : `X_FRAME_OPTIONS`/`SECURE_CONTENT_TYPE_NOSNIFF` (défauts Django, non surchargés), `SESSION_COOKIE_SECURE`/`CSRF_COOKIE_SECURE` déjà actifs hors `DEBUG` (Epic 8.6).

## 2026-07-21 — ✅ 12. Exposition de données sensibles (logs/erreurs) & gestion de session

**Statut : aucune faille trouvée.**

| Vecteur | Constat |
|---|---|
| Fuite de stack trace / exception brute au client | Grep exhaustif sur tous les `str(e)`/f-strings d'exception renvoyés en `Response` : soit exceptions applicatives contrôlées (`ShopifyOAuthError`, message sanitisé), soit erreurs authentifiées destinées au propriétaire (Chargily, transporteur) — jamais de `traceback.format_exc()` ni d'exception système brute |
| Logs contenant des données sensibles | Aucun `print`/`logger` n'inclut `request.data` en entier ni de mot de passe |
| `DEBUG` | Défaut `False` (déjà corrigé à l'Epic 8.6) — pas de page d'erreur Django avec traceback en production |
| Gestion de session JWT | Access token 1h / refresh 7j, `ROTATE_REFRESH_TOKENS` + `BLACKLIST_AFTER_ROTATION` actifs ; `LogoutView` blackliste explicitement le refresh token courant |
| `UserSerializer` (`/api/auth/me/`) | N'expose jamais le hash de mot de passe ni de champ sensible |
| `PaymentWebhookLog`/`WebhookLog` (payloads bruts) | Aucun endpoint API ne les expose aux locataires — uniquement via Django Admin (accès superuser serveur) |

**Note informationnelle (pas une faille)** : `ADMINS`/`MANAGERS` non configurés — les erreurs 500 en prod ne déclenchent aucune alerte email automatique. Gap opérationnel, pas un problème de sécurité, déjà couvert par le TBD "Infra de déploiement" du CLAUDE.md.

**Aucune action requise.**

## 2026-07-21 — ✅ 13. SSRF & logique métier (abus de fonctionnalités) — corrigé

**Statut : 2 failles trouvées et corrigées.**

**Faille 1 — SSRF via webhooks sortants (authentifié, owner/admin)** : `webhooks/dispatch.py::_send()` envoyait `requests.post(endpoint.url, ...)` avec `endpoint.url` (`URLField`, ne valide que le format) entièrement fourni par le vendeur — un vendeur pouvait cibler `http://169.254.169.254/...` (métadonnées cloud AWS/GCP/Azure) ou le réseau interne du serveur ; chaque commande créée déclenchait la requête automatiquement, et le résultat était visible dans `WebhookLog` (consultable par ce même vendeur).

**Faille 2 — `shipping_cost` non validé (checkout public, sans compte)** : `PublicOrderView`/`OrderListCreateView` prenaient `shipping_cost = request.data.get('shipping_cost', 0)` brut. `Order.recalculate()` applique `total = max(subtotal - discount_amount, 0) + shipping_cost` — le floor à 0 précède l'ajout de `shipping_cost`, donc un `shipping_cost` négatif rendait `total` négatif ou nul. Risque de fraude direct dans un marché où le COD (paiement à la livraison) domine.

**Modifications appliquées :**
- `core/validators.py` — nouveau `is_public_http_url(url)` (résout le nom d'hôte, rejette IP privée/loopback/link-local/réservée/multicast) + `validate_public_url()`
- `webhooks/serializers.py::WebhookEndpointSerializer.validate_url()` — rejette une URL non publique à la création/modification
- `webhooks/dispatch.py::_send()` — revérifie `is_public_http_url()` juste avant l'envoi réel (protection contre le DNS rebinding entre la création et l'envoi — limite le risque sans l'éliminer totalement, une résolution DNS re-faite par `requests` lui-même reste possible en théorie dans la fenêtre de course)
- `orders/views.py` — nouveau `_validate_shipping_cost(request)` (doit être un nombre `>= 0`), appliqué dans `PublicOrderView.post()` et `OrderListCreateView.post()` avant création de la commande (400 sinon)

Un test existant (`test_fire_event_success_logs_and_resets_failures`) utilisait un domaine placeholder `x.test` (RFC 2606, ne résout jamais) — cassé par la nouvelle vérification DNS réelle. Corrigé en mockant `is_public_http_url` sur les tests de logique de dispatch (pas la vérification elle-même), + nouveau test dédié `test_ssrf_target_never_sent_and_logged_as_error` (vérifie qu'un endpoint `http://localhost:8000/...` est bloqué et journalisé en erreur sans jamais appeler `requests.post`).

Suite de tests `orders`/`webhooks` (86 tests) verte après correctif.

## 2026-07-21 — ✅ 14. Rate-limiting par utilisateur — corrigé

**Statut : faille trouvée et corrigée.**

`config/settings.py` ne déclarait que `ScopedRateThrottle` — commentaire explicite de l'Epic 8.6 : *"pas de throttle global agressif"*, ce qui signifiait en pratique **aucune limite de débit pour un utilisateur authentifié** sur les endpoints sans `throttle_scope` (création de commande authentifiée, invitations d'équipe, listes de données...). Un compte compromis ou un membre d'équipe malveillant pouvait marteler l'API sans limite.

**Modifications appliquées :**
- Nouveau `core/throttling.py::AuthenticatedUserRateThrottle` (hérite de `UserRateThrottle`, retourne `None` pour toute requête anonyme au lieu de retomber sur l'IP)
- `DEFAULT_THROTTLE_CLASSES` : ajout de `AuthenticatedUserRateThrottle` en complément de `ScopedRateThrottle` ; `DEFAULT_THROTTLE_RATES['user'] = '2000/hour'`

⚠️ **Incident de perf pendant la vérification** : un premier essai avec le `UserRateThrottle` standard de DRF (retombant sur l'IP pour les anonymes) a fait ralentir fortement la suite de tests complète — toutes les requêtes anonymes des tests partagent la même IP `127.0.0.1`, donc une seule liste de timestamps partagée par **tout** le trafic anonyme du projet, avec un coût par requête qui grossit sans cesse (même risque en production pour des clients anonymes derrière un même NAT/proxy). Corrigé en excluant explicitement les requêtes anonymes de ce throttle générique (elles restent couvertes par les scopes dédiés existants : `order`, `complaint`, `review`, etc.). Suite complète re-vérifiée après correctif : **234 tests, tous verts, ~357s** — conforme à la baseline documentée.

## 2026-07-21 — ✅ 18. Timing attack sur le login

**Statut : aucune faille trouvée.**

`LoginSerializer.validate()` utilise `django.contrib.auth.authenticate()` sans backend personnalisé (`AUTHENTICATION_BACKENDS` non surchargé → `ModelBackend` par défaut). Ce backend applique nativement, depuis Django 1.9, un hash de mot de passe factice (`UserModel().set_password(password)`) quand l'email n'existe pas, pour égaliser le temps de réponse entre "compte inexistant" et "mauvais mot de passe" — défense déjà en place, pas de backend custom qui la contournerait.

**Aucune action requise.**

## 2026-07-21 — ✅ 21. En-têtes de sécurité complets — corrigé

**Statut : faille (gap) trouvée et corrigée.**

`X-Content-Type-Options`/`X-Frame-Options`/`Referrer-Policy` déjà présents (défauts `SecurityMiddleware`/`XFrameOptionsMiddleware`, Epic 8.6). **Manquants** : `Content-Security-Policy` et `Permissions-Policy` — aucun équivalent natif Django, nécessitent un ajout explicite.

**Modifications appliquées :**
- Nouveau `core/middleware.py::SecurityHeadersMiddleware`, ajouté à `MIDDLEWARE`
- `Permissions-Policy` : désactive géolocalisation/caméra/micro/USB/paiement/interest-cohort
- `Content-Security-Policy` calibrée pour ne pas casser les pixels marketing (`lib/pixels.js` : Facebook/TikTok/Google, injectés en script inline) ni Google Fonts (`index.html`) — `script-src`/`connect-src` limités à `'self'` + domaines pixels connus + `'unsafe-inline'` (nécessaire, pas de nonce en place), `style-src`/`font-src` pour Google Fonts, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`

Vérifié via le client de test Django (les 4 en-têtes présents sur une réponse échantillon) + `manage.py check` propre. ⚠️ **Non vérifié visuellement dans un navigateur réel** — à tester manuellement sur la boutique publique (pixels marketing + polices) avant mise en production, la CSP pouvant bloquer silencieusement des ressources si un domaine a été oublié.

## À venir
En attente du point n°15 à auditer (fourni par l'utilisateur).
