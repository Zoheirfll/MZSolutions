from django.db import migrations
from django.utils.text import slugify


def backfill_slugs(apps, schema_editor):
    Product = apps.get_model('products', 'Product')
    for store_id in Product.objects.values_list('store_id', flat=True).distinct():
        used = set()
        for product in Product.objects.filter(store_id=store_id).order_by('id'):
            base = slugify(product.name) or 'produit'
            slug = base
            suffix = 2
            while slug in used:
                slug = f"{base}-{suffix}"
                suffix += 1
            used.add(slug)
            product.slug = slug
            product.save(update_fields=['slug'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0020_product_slug_product_unique_product_slug_per_store'),
    ]

    operations = [
        migrations.RunPython(backfill_slugs, noop_reverse),
    ]
