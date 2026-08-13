"""Point d'entrée UNIQUE pour toute mutation de stock — centralisé le 2026-08
pour que `StockMovement.stock_before`/`stock_after` ne puissent jamais se
désynchroniser (avant ce chantier, 6 sites d'appel différents mutaient le
stock chacun à leur façon, sans tracer l'état avant/après)."""
from .models import StockMovement


def record_stock_movement(store, product, variant_option, quantity, reason, note='', batch_id=None):
    """Applique `quantity` (delta signé) au stock du produit ou de la variante,
    plafonné à 0 (comportement historique — jamais de stock négatif), et
    journalise le mouvement avec l'état avant/après. Retourne le StockMovement créé.
    `batch_id` regroupe plusieurs appels d'une même sauvegarde (voir
    StockMovementListView) — optionnel, None pour un mouvement isolé."""
    if variant_option is not None:
        stock_before = variant_option.stock
        stock_after = max(0, stock_before + quantity)
        variant_option.stock = stock_after
        variant_option.save(update_fields=['stock'])
    else:
        stock_before = product.stock
        stock_after = max(0, stock_before + quantity)
        product.stock = stock_after
        product.save(update_fields=['stock'])

    return StockMovement.objects.create(
        store=store, product=product, variant_option=variant_option,
        quantity=quantity, stock_before=stock_before, stock_after=stock_after,
        reason=reason, note=note, batch_id=batch_id,
    )


def log_stock_change_if_needed(store, product, variant_option, stock_before, stock_after, reason='manual_adjustment', note='', batch_id=None):
    """Journalise un mouvement de stock déjà appliqué ailleurs (ex: le champ
    `stock` d'un ProductSerializer/VariantOptionSerializer standard) — ne
    mute PAS le stock (déjà fait), se contente de comparer avant/après et de
    créer le mouvement si la valeur a réellement changé. Boucle le trou du
    registre laissé par la fiche produit (chantier 2026-08 : sans ça, éditer
    le stock depuis ProductFormPage restait invisible dans "Mouvement des
    stocks", et aurait faussé stock_before des mouvements suivants)."""
    if stock_before == stock_after:
        return None
    return StockMovement.objects.create(
        store=store, product=product, variant_option=variant_option,
        quantity=stock_after - stock_before, stock_before=stock_before, stock_after=stock_after,
        reason=reason, note=note, batch_id=batch_id,
    )
