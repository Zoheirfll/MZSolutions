"""Branche l'optimisation d'image sur les modèles dont les images sont servies
au public (catalogue, avis, logo). Un seul endroit : aucun modèle à modifier."""
from django.apps import apps
from django.db.models.signals import pre_save

from .images import optimize_image_field

IMAGE_FIELDS = {
    'products.ProductImage': ('image',),
    'products.Category': ('image',),
    'products.VariantOption': ('image',),
    'products.ProductReview': ('image',),
    'stores.Store': ('logo',),
}


def _make_handler(fields):
    def handler(sender, instance, **kwargs):
        for name in fields:
            optimize_image_field(getattr(instance, name))
    return handler


def register():
    for label, fields in IMAGE_FIELDS.items():
        pre_save.connect(_make_handler(fields), sender=apps.get_model(label),
                         weak=False, dispatch_uid=f'optimize-images-{label}')
