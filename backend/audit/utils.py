import logging

logger = logging.getLogger(__name__)


def log_audit(request, action, target=None, description='', metadata=None, store=None):
    """Point d'entrée unique du journal d'audit — appelé depuis n'importe
    quelle vue authentifiée (owner/admin/confirmateur/dropshipper) à chaque
    action qui modifie un état de la boutique. Best-effort : une erreur ici
    ne doit jamais faire échouer l'action métier elle-même (même philosophie
    que webhooks.dispatch.fire_event), mais est journalisée pour ne pas
    passer inaperçue.

    `target` : instance de modèle concernée (Order, Conversation, TeamMember...),
    optionnelle — sert juste à remplir target_type/target_id/target_repr.
    """
    from .models import AuditLog
    try:
        user = request.user
        resolved_store = store
        if resolved_store is None:
            try:
                resolved_store = user.store
            except Exception:
                resolved_store = user.team_membership.store

        try:
            actor_role = user.team_membership.role
        except Exception:
            actor_role = 'owner'

        actor_name = (f"{user.first_name} {user.last_name}".strip() or user.email)

        target_type = target.__class__.__name__.lower() if target is not None else ''
        target_id   = getattr(target, 'pk', None) if target is not None else None
        target_repr = str(target)[:200] if target is not None else ''

        return AuditLog.objects.create(
            store=resolved_store,
            actor=user,
            actor_name=actor_name[:200],
            actor_role=actor_role or '',
            action=action,
            target_type=target_type,
            target_id=target_id,
            target_repr=target_repr,
            description=description,
            metadata=metadata or {},
        )
    except Exception:
        logger.exception("log_audit failed for action=%s", action)
        return None
