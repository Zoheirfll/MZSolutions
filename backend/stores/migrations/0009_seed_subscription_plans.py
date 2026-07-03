from django.db import migrations


def seed_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('stores', 'SubscriptionPlan')
    if SubscriptionPlan.objects.exists():
        return
    SubscriptionPlan.objects.create(
        name='Starter', orders_limit=300, price_monthly=1500, price_yearly=15000, order=0,
        features=[
            'Jusqu’à 300 commandes / mois',
            'Dashboard de gestion des commandes',
            'Gestion des produits & catégories',
            'Boutique en ligne',
            'Marketing (pixels)',
        ],
    )
    SubscriptionPlan.objects.create(
        name='Pro', orders_limit=1000, price_monthly=4500, price_yearly=45000, order=1,
        features=[
            'Jusqu’à 1000 commandes / mois',
            'Tout Starter, plus :',
            'Statistiques complètes',
            'Stock & inventaire',
            'Dropshipping',
            'Finances & rentabilité',
        ],
    )
    SubscriptionPlan.objects.create(
        name='Business', orders_limit=None, price_monthly=9000, price_yearly=90000, order=2,
        features=[
            'Commandes illimitées',
            'Tout Pro, plus :',
            'Canaux de vente (Shopify, Google Sheets, Meta Commerce)',
            'Webhooks',
            'Permissions avancées par rôle',
            'Support prioritaire',
        ],
    )


def unseed_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('stores', 'SubscriptionPlan')
    SubscriptionPlan.objects.filter(name__in=['Starter', 'Pro', 'Business']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('stores', '0008_subscriptionplan_subscriptionquota_billing_cycle_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_plans, unseed_plans),
    ]
