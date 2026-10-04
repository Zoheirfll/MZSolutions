from django.db import migrations, models


def to_sofizpay(apps, schema_editor):
    apps.get_model('orders', 'Order').objects.filter(payment_method='chargily').update(payment_method='sofizpay')


def to_chargily(apps, schema_editor):
    apps.get_model('orders', 'Order').objects.filter(payment_method='sofizpay').update(payment_method='chargily')


class Migration(migrations.Migration):
    dependencies = [('orders', '0040_alter_carrieraccount_carrier')]

    operations = [
        migrations.RenameField('order', 'chargily_checkout_id', 'sofizpay_transaction_id'),
        migrations.RenameField('order', 'chargily_payment_link', 'sofizpay_payment_link'),
        migrations.AlterField('order', 'payment_method', models.CharField(
            max_length=20, default='cod',
            choices=[('cod', 'Paiement à la livraison'), ('sofizpay', 'Paiement en ligne (SofizPay)')])),
        migrations.RunPython(to_sofizpay, to_chargily),
    ]
