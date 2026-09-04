"""Re-chiffre les CarrierAccount.api_token/webhook_secret déjà en base
(stockés en clair avant l'introduction d'EncryptedTextField) — sans cette
passe, ils resteraient lisibles jusqu'à leur prochaine sauvegarde manuelle."""
from django.db import migrations


def encrypt_existing(apps, schema_editor):
    # `apps.get_model` résout le vrai `EncryptedTextField` (référencé par son
    # chemin d'import dans l'état de migration) — lire un objet déchiffre
    # donc déjà la valeur (`from_db_value`, no-op si elle était en clair) ;
    # il suffit de la re-sauvegarder pour la faire chiffrer une seule fois
    # via `get_prep_value`. Ne JAMAIS appeler Fernet manuellement ici en plus
    # du save() — ça chiffrerait deux fois la même valeur.
    from django.db.models import Q
    CarrierAccount = apps.get_model('orders', 'CarrierAccount')
    for account in CarrierAccount.objects.filter(Q(api_token__gt='') | Q(webhook_secret__gt='')):
        account.save(update_fields=['api_token', 'webhook_secret'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0037_alter_carrieraccount_api_token_and_more'),
    ]

    operations = [
        migrations.RunPython(encrypt_existing, noop_reverse),
    ]
