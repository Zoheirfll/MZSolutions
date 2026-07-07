# Permissions par personne — design

Date : 2026-07-07
Epic : suite de l'Epic 7.5 (Permissions avancées par rôle)

## Contexte

Le système actuel (`team/models.py`, Epic 7.5) gère les permissions **uniquement par rôle** : `RolePermission` stocke des overrides `(store, role, permission)`, avec repli sur `DEFAULT_PERMISSIONS[role]`. Tous les membres d'un même rôle partagent donc exactement les mêmes permissions.

Besoin exprimé : pouvoir personnaliser les permissions **par personne** (un confirmateur précis peut avoir des droits différents d'un autre confirmateur), et pouvoir choisir ces permissions **dès la création du compte** (invitation), pas seulement après coup.

## Décisions de conception

1. **Le rôle reste la valeur par défaut ; la personnalisation individuelle est un override en plus.** On ne supprime pas `RolePermission` / la matrice par rôle (`PermissionsPage.jsx`) — c'est toujours le réglage rapide "tous les confirmateurs d'un coup". On ajoute une couche de résolution supplémentaire au-dessus.
2. **Cascade de résolution** (du plus spécifique au plus général) :
   `override membre (TeamMemberPermission)` > `override rôle (RolePermission)` > `défaut du rôle (DEFAULT_PERMISSIONS)`.
3. **Portée inchangée** : comme l'Epic 7.5, ce système ne gate que la lecture/visibilité (sidebar + les quelques enforcements serveur existants — `purchase_prices_view`, `dropshipping_view`, `finances_view`). Les actions d'écriture restent `is_owner_or_admin`, non affectées par ce chantier.
4. **Formulaire d'invitation pré-rempli** : à la création d'un compte équipe, le vendeur voit la liste de permissions du rôle choisi, pré-cochée selon les valeurs effectives actuelles de ce rôle (défaut + overrides de rôle déjà configurés), et peut cocher/décocher avant d'envoyer l'invitation.
5. **Modification après coup depuis `TeamPage.jsx`** : une action « Permissions » par ligne de membre ouvre une modal listant le catalogue avec toggles individuels, sauvegarde immédiate par toggle (même pattern que `PermissionsPage.jsx`).

## Modèle de données

Nouveau modèle dans `backend/team/models.py`, miroir de `RolePermission` mais scopé par membre :

```python
class TeamMemberPermission(models.Model):
    """Override d'une permission du catalogue pour un membre précis — a
    priorité sur RolePermission (override de rôle) qui a lui-même priorité
    sur DEFAULT_PERMISSIONS (défaut du rôle). Seuls les overrides explicites
    sont stockés, même philosophie que RolePermission."""
    member     = models.ForeignKey(TeamMember, on_delete=models.CASCADE, related_name='permission_overrides')
    permission = models.CharField(max_length=50)
    enabled    = models.BooleanField(default=True)

    class Meta:
        unique_together = [('member', 'permission')]

    def __str__(self):
        return f"{self.member_id} — {self.permission} = {self.enabled}"
```

Migration Django standard (`makemigrations team`).

### Fonction de résolution

`get_effective_permissions(store, role, member=None)` (`team/models.py`) — signature étendue avec un paramètre optionnel `member` :

```python
def get_effective_permissions(store, role, member=None):
    defaults      = DEFAULT_PERMISSIONS.get(role, {})
    role_overrides = {
        p.permission: p.enabled
        for p in RolePermission.objects.filter(store=store, role=role)
    }
    member_overrides = {}
    if member is not None:
        member_overrides = {
            p.permission: p.enabled
            for p in TeamMemberPermission.objects.filter(member=member)
        }
    return {
        key: member_overrides.get(key, role_overrides.get(key, defaults.get(key, False)))
        for key, _ in PERMISSION_CATALOG
    }
```

Rétrocompatible : tout appelant existant qui n'a pas encore de `member` (ex. contextes où seul le rôle est connu) continue de fonctionner identiquement (`member=None` → comportement Epic 7.5 inchangé).

## Backend — API

### `core/permissions.py`

`has_permission(request, key)` / `get_effective_permissions_for_request(request)` doivent désormais résoudre via le membre (`request.user.team_membership`) plutôt que seulement `request.user.team_membership.role`, pour bénéficier de la cascade. L'owner (pas de `team_membership`) est inchangé — accès total.

### `POST /api/team/invite/`

Accepte un champ optionnel `permissions: {clé: bool}` dans le payload. Si fourni :
1. Le membre est créé normalement (comportement inchangé).
2. Pour chaque `(clé, valeur)` du payload dont la valeur **diffère** de la valeur effective actuelle du rôle (`get_effective_permissions(store, role)`, sans membre — donc rôle seul), créer un `TeamMemberPermission(member=nouveau_membre, permission=clé, enabled=valeur)`. Ne pas stocker les entrées identiques au défaut du rôle (cohérent avec le principe "overrides only" déjà appliqué à `RolePermission`).

Si `permissions` est absent (rétrocompatibilité, ex. appels API existants/tests), aucun override n'est créé — le membre hérite intégralement des permissions de son rôle, comportement strictement identique à avant ce chantier.

### `GET/POST /api/team/members/<id>/permissions/`

Nouvelle vue `TeamMemberPermissionView`, réservée owner/admin (comme `/api/team/permissions/` existant).

- **GET** — retourne, pour chaque entrée du catalogue : `{key, label, enabled, is_custom}` où `enabled` = valeur effective (cascade complète) et `is_custom` = `True` si un `TeamMemberPermission` existe pour ce membre sur cette clé (pour afficher le badge « Personnalisé » côté frontend).
- **POST** — `{permission, enabled}` : upsert (`update_or_create`) un `TeamMemberPermission(member, permission, enabled)`. Pas de suppression explicite prévue dans ce chantier (revenir au défaut du rôle = re-cocher/décocher manuellement pour matcher — TBD si un bouton "réinitialiser" s'avère nécessaire plus tard, hors scope ici).

### Serializers

`TeamMemberSerializer` (`team/serializers.py`) : pas de changement obligatoire — les permissions individuelles se consultent via l'endpoint dédié, pas embarquées dans la liste des membres (évite une requête N+1 sur `GET /api/team/members/`).

## Frontend

### `TeamPage.jsx` — formulaire d'invitation (`Modal`)

Sous les champs existants (nom, email, téléphone, rôle/wilaya/commune selon le rôle), ajout d'une section « Permissions » :
- Au changement de `form.role`, fetch `GET /api/team/permissions/` (endpoint existant Epic 7.5, déjà utilisé par `PermissionsPage.jsx`) filtré sur ce rôle pour obtenir les valeurs effectives actuelles → pré-coche les checkboxes.
- Liste de checkboxes (catalogue `PERMISSION_CATALOG`, réutiliser les libellés déjà utilisés dans `PermissionsPage.jsx`), état local `form.permissions`.
- À la soumission, `form.permissions` est envoyé tel quel dans le payload `POST /api/team/invite/`.

### `TeamPage.jsx` — action « Permissions » par membre

Dans `MembersTable`, ajouter un bouton « Permissions » à côté de « Désactiver » dans la colonne Actions. Ouvre une nouvelle modal `MemberPermissionsModal` :
- `GET /api/team/members/<id>/permissions/` au montage.
- Liste de toggles (même composant visuel que `PermissionsPage.jsx` — réutiliser/extraire le style de ligne toggle existant si pertinent), badge « Personnalisé » (texte discret, ex. `theme.badge` violet clair) à côté des permissions où `is_custom === true`.
- Chaque toggle déclenche immédiatement `POST /api/team/members/<id>/permissions/` (sauvegarde instantanée, pas de bouton "Enregistrer" global — même UX que `PermissionsPage.jsx`).

### `PermissionsPage.jsx`

Inchangée. Reste le réglage rapide par rôle.

## Tests

Backend (`team/tests.py`, suivant le pattern `core/test_utils.py` existant) :
- Cascade de résolution : défaut rôle < override rôle < override membre, dans cet ordre de priorité.
- Invitation avec `permissions` personnalisées → `TeamMemberPermission` créés uniquement pour les clés qui diffèrent du défaut du rôle.
- Invitation sans `permissions` → aucun override créé, comportement identique à avant.
- `GET .../permissions/` retourne bien `is_custom` correct.
- `POST .../permissions/` upsert correctement (créer puis modifier la même clé).
- Un override individuel ne doit pas fuiter sur un autre membre du même rôle (isolation par membre, pas par rôle).
- Un override de rôle changé après coup ne doit pas écraser un override individuel déjà posé (priorité membre > rôle vérifiée après modification du rôle).

Frontend (`frontend/src/tests/pages/TeamPage.test.jsx`, à étendre) :
- Le formulaire d'invitation pré-coche les permissions selon le rôle sélectionné.
- La modal « Permissions » d'un membre affiche l'état effectif + badge personnalisé, et un toggle déclenche bien l'appel API.

## Hors scope

- Pas de bouton "réinitialiser au défaut du rôle" pour un override individuel (TBD, à ajouter si le besoin se confirme à l'usage).
- Pas de vue en masse "voir toutes les personnalisations individuelles de la boutique" — chaque membre se consulte via sa propre modal.
- Aucun changement sur la portée des permissions (toujours lecture/visibilité uniquement, jamais les actions d'écriture).
