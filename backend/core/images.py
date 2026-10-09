"""Optimisation des images téléversées (réduction du poids des pages).

Appelée avant l'enregistrement d'un modèle (voir image_signals) : une image
plus grande que MAX_SIDE est redimensionnée, puis ré-encodée avec Pillow. Si le
résultat n'est pas plus léger, l'original est conservé tel quel — on ne dégrade
jamais un fichier pour rien."""
import logging
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

MAX_SIDE = 1600
JPEG_WEBP_QUALITY = 82


def _encode(image, fmt):
    buffer = BytesIO()
    if fmt in ('JPEG', 'WEBP'):
        if fmt == 'JPEG' and image.mode not in ('RGB', 'L'):
            image = image.convert('RGB')
        image.save(buffer, format=fmt, quality=JPEG_WEBP_QUALITY, optimize=(fmt == 'JPEG'))
    else:
        image.save(buffer, format='PNG', optimize=True)
    return buffer.getvalue()


def optimize_image_field(field_file, max_side=MAX_SIDE):
    """Optimise un fichier fraîchement téléversé (pas encore enregistré).
    Silencieux en cas de problème : l'image d'origine est alors gardée."""
    if not field_file or getattr(field_file, '_committed', True):
        return False
    try:
        original_size = field_file.size
        field_file.seek(0)
        image = Image.open(field_file)
        fmt = image.format
        if fmt not in ('JPEG', 'PNG', 'WEBP'):  # GIF : on garde l'animation
            field_file.seek(0)
            return False
        image = ImageOps.exif_transpose(image)
        resized = max(image.size) > max_side
        if resized:
            image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        data = _encode(image, fmt)
        if not resized and len(data) >= original_size:
            field_file.seek(0)
            return False
        field_file.save(field_file.name, ContentFile(data), save=False)
        return True
    except Exception:  # noqa: BLE001 — jamais bloquer un enregistrement pour une optimisation
        logger.warning('Optimisation d\'image ignorée', exc_info=True)
        try:
            field_file.seek(0)
        except Exception:  # noqa: BLE001
            pass
        return False
