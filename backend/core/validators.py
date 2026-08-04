import ipaddress
import socket
from urllib.parse import urlparse

from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator

ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif']
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 Mo


def is_public_http_url(url):
    """Sécurité — point 13 (SSRF) : un `WebhookEndpoint.url` fourni par le
    vendeur (URLField, ne valide que le format) était envoyé tel quel via
    requests.post() — un vendeur pouvait cibler le service de métadonnées
    cloud (169.254.169.254) ou le réseau interne du serveur. Résout le nom
    d'hôte et rejette toute IP privée/loopback/link-local/réservée. Appelé à
    la fois à la création (feedback immédiat) et juste avant l'envoi réel
    (protection contre le DNS rebinding entre les deux)."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname:
            return False
        infos = socket.getaddrinfo(parsed.hostname, None)
        for family, _, _, _, sockaddr in infos:
            ip = ipaddress.ip_address(sockaddr[0])
            if (ip.is_private or ip.is_loopback or ip.is_link_local
                    or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
                return False
        return True
    except (socket.gaierror, ValueError, UnicodeError):
        return False


def validate_public_url(url):
    if not is_public_http_url(url):
        raise ValidationError("URL invalide ou pointant vers une adresse réseau non autorisée.")


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
