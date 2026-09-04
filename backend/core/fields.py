"""Chiffrement au repos des secrets stockés en base (TBD Epic 8.6 — tokens
transporteurs, secrets webhook, identifiants canaux de vente/pixels étaient
en clair en base, protégés uniquement par l'accès DB). `EncryptedTextField`
chiffre/déchiffre de façon transparente pour l'application — le reste du
code (serializers, vues) continue de lire/écrire une chaîne en clair sans
changement, seule la colonne en base est illisible sans la clé."""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from decouple import config
from django.conf import settings
from django.db import models


def _fernet_key():
    explicit = config('FIELD_ENCRYPTION_KEY', default='')
    if explicit:
        return explicit.encode()
    # Repli dérivé de SECRET_KEY si FIELD_ENCRYPTION_KEY n'est pas défini —
    # évite de casser un déploiement existant tant que la variable n'a pas
    # été ajoutée à l'environnement. Définir FIELD_ENCRYPTION_KEY explicitement
    # en production reste recommandé (rotation indépendante de SECRET_KEY).
    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(digest)


class EncryptedTextField(models.TextField):
    """Stocke la valeur chiffrée (Fernet/AES) en base, la déchiffre à la
    lecture. Une valeur déjà en clair en base (avant activation du chiffrement,
    ou après une restauration d'un ancien dump) est renvoyée telle quelle —
    jamais d'erreur, re-chiffrée automatiquement au prochain `.save()`."""

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if not value:
            return value
        return Fernet(_fernet_key()).encrypt(value.encode()).decode()

    def from_db_value(self, value, expression, connection):
        if not value:
            return value
        try:
            return Fernet(_fernet_key()).decrypt(value.encode()).decode()
        except InvalidToken:
            return value
