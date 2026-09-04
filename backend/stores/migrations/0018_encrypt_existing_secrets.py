"""Re-chiffre les PixelConfig.access_token/ga_api_secret/ga_service_account_json
déjà en base."""
from django.db import migrations


def encrypt_existing(apps, schema_editor):
    # Voir orders/migrations/0038 pour l'explication.
    from django.db.models import Q
    PixelConfig = apps.get_model('stores', 'PixelConfig')
    fields = ('access_token', 'ga_api_secret', 'ga_service_account_json')
    query = Q()
    for field in fields:
        query |= Q(**{f'{field}__gt': ''})
    for pixel in PixelConfig.objects.filter(query):
        pixel.save(update_fields=list(fields))


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('stores', '0017_alter_pixelconfig_access_token_and_more'),
    ]

    operations = [
        migrations.RunPython(encrypt_existing, noop_reverse),
    ]
