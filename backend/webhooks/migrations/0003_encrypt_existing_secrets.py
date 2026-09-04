"""Re-chiffre les WebhookEndpoint.secret déjà en base."""
from django.db import migrations


def encrypt_existing(apps, schema_editor):
    # Voir orders/migrations/0038 pour l'explication.
    WebhookEndpoint = apps.get_model('webhooks', 'WebhookEndpoint')
    for endpoint in WebhookEndpoint.objects.exclude(secret=''):
        endpoint.save(update_fields=['secret'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('webhooks', '0002_alter_webhookendpoint_secret'),
    ]

    operations = [
        migrations.RunPython(encrypt_existing, noop_reverse),
    ]
