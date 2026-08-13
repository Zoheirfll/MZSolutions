from django.utils import timezone


def assign_conversation_round_robin(conversation):
    """Même logique round-robin que orders.utils.assign_order_round_robin,
    curseur propre à l'inbox (Conversation.assigned_at, plus de table
    ComplaintAssignment séparée depuis la fusion 2026-08) — un confirmateur
    très sollicité sur les commandes ne doit pas être systématiquement écarté
    de la boîte de réception."""
    from team.models import TeamMember
    from .models import Conversation

    confirmateurs = list(
        TeamMember.objects.filter(
            store=conversation.store, role='confirmateur', is_active=True, user__isnull=False,
        ).order_by('id')
    )
    if not confirmateurs:
        return None

    last = (
        Conversation.objects
        .filter(store=conversation.store, assigned_to__isnull=False)
        .exclude(pk=conversation.pk)
        .order_by('-assigned_at')
        .first()
    )

    confirmateur_ids = [c.id for c in confirmateurs]
    if last and last.assigned_to_id in confirmateur_ids:
        last_idx = confirmateur_ids.index(last.assigned_to_id)
        next_idx = (last_idx + 1) % len(confirmateurs)
    else:
        next_idx = 0

    conversation.assigned_to = confirmateurs[next_idx]
    conversation.assigned_at = timezone.now()
    conversation.assigned_by = None
    conversation.save(update_fields=['assigned_to', 'assigned_at', 'assigned_by'])
    return conversation
