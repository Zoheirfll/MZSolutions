from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator

ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif']
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 Mo


def validate_image_extension(value):
    FileExtensionValidator(allowed_extensions=ALLOWED_IMAGE_EXTENSIONS)(value)


def validate_image_size(value):
    if value.size > MAX_IMAGE_SIZE_BYTES:
        raise ValidationError(f"Fichier trop volumineux (max {MAX_IMAGE_SIZE_BYTES // (1024*1024)} Mo).")


def validate_uploaded_file(f):
    """Utilisé hors ModelField (ex: MediaFileUploadView, upload libre) — lève
    ValidationError si le fichier n'est pas une image autorisée ou dépasse la
    taille max (Epic 8.6 : aucune validation n'existait avant, upload de
    fichier arbitraire possible)."""
    ext = f.name.rsplit('.', 1)[-1].lower() if '.' in f.name else ''
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValidationError(f"Extension non autorisée : .{ext}")
    if f.size > MAX_IMAGE_SIZE_BYTES:
        raise ValidationError(f"Fichier trop volumineux (max {MAX_IMAGE_SIZE_BYTES // (1024*1024)} Mo).")
