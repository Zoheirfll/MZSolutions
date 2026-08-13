"""Migration de données : orders.Complaint/ComplaintMessage/ComplaintAssignment
-> inbox.Conversation/Message (US "boîte de réception, tout doit y arriver",
2026-08-12). Complaint.description est déjà dupliquée dans le premier
ComplaintMessage (créé automatiquement à l'ouverture, voir
PublicComplaintCreateView) — rien n'est perdu en ne reprenant pas ce champ
séparément. Réversible (delete simple), mais volontairement pas de perte de
données si on repasse en arrière avant l'étape de suppression des anciens
modèles (voir plan)."""
from django.db import migrations


def migrate_complaints_forward(apps, schema_editor):
    Complaint = apps.get_model('orders', 'Complaint')
    Conversation = apps.get_model('inbox', 'Conversation')
    Message = apps.get_model('inbox', 'Message')

    for complaint in Complaint.objects.select_related('order').prefetch_related('messages'):
        try:
            assignment = complaint.assignment
        except Exception:
            assignment = None

        conv = Conversation.objects.create(
            store=complaint.store,
            channel='complaint',
            order=complaint.order,
            subject=complaint.subject,
            status=complaint.status,
            customer_name=f"{complaint.order.first_name} {complaint.order.last_name}".strip(),
            customer_phone=complaint.order.phone,
            assigned_to=assignment.confirmateur if assignment else None,
            assigned_at=assignment.assigned_at if assignment else None,
            assigned_by=assignment.assigned_by if assignment else None,
            created_at=complaint.created_at,
            updated_at=complaint.updated_at,
        )

        last_message_at = None
        for msg in complaint.messages.all():
            Message.objects.create(
                conversation=conv,
                direction='inbound' if msg.author_id is None else 'outbound',
                body=msg.message,
                status_change=msg.status,
                attachment=msg.attachment,
                author=msg.author,
                created_at=msg.created_at,
            )
            last_message_at = msg.created_at
            if msg.author_id is None:
                conv.last_customer_message_at = msg.created_at

        conv.last_message_at = last_message_at or complaint.created_at
        conv.save(update_fields=['last_message_at', 'last_customer_message_at'])


def migrate_complaints_backward(apps, schema_editor):
    Conversation = apps.get_model('inbox', 'Conversation')
    Conversation.objects.filter(channel='complaint').delete()


class Migration(migrations.Migration):
    dependencies = [
        ('inbox', '0001_initial'),
        ('orders', '0030_exchangerequest_conversation'),
    ]

    operations = [
        migrations.RunPython(migrate_complaints_forward, migrate_complaints_backward),
    ]
