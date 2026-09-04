"""Re-chiffre les ChannelConnection.api_secret/access_token déjà en base."""
from django.db import migrations


def encrypt_existing(apps, schema_editor):
    # Voir orders/migrations/0038 pour l'explication : `apps.get_model`
    # résout le vrai `EncryptedTextField`, un simple re-save suffit (lecture
    # = déchiffre si besoin, écriture = chiffre une seule fois).
    from django.db.models import Q
    ChannelConnection = apps.get_model('channels', 'ChannelConnection')
    for conn in ChannelConnection.objects.filter(Q(api_secret__gt='') | Q(access_token__gt='')):
        conn.save(update_fields=['api_secret', 'access_token'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('channels', '0004_alter_channelconnection_access_token_and_more'),
    ]

    operations = [
        migrations.RunPython(encrypt_existing, noop_reverse),
    ]
