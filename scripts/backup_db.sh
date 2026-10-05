#!/bin/sh
# Sauvegarde quotidienne de la base PostgreSQL (docker compose). Rétention : 14 jours.
# Planifiée par cron sur le serveur (voir CLAUDE.md, section Admin plateforme — phase 9).
# Le dossier backups/ est monté en lecture seule dans le conteneur web : l'admin y VOIT les
# sauvegardes (page « Tâches et sauvegardes ») mais ne peut ni en créer ni en supprimer.
set -e
cd "$(dirname "$0")/.."
mkdir -p backups
FILE="backups/backup_$(date +%Y%m%d_%H%M%S).sql"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$FILE.tmp"
# une sauvegarde vide ou tronquée n'est jamais conservée
[ -s "$FILE.tmp" ] && mv "$FILE.tmp" "$FILE" || { rm -f "$FILE.tmp"; echo "Sauvegarde vide : abandon" >&2; exit 1; }
find backups -name 'backup_*.sql' -mtime +14 -delete
echo "OK $FILE"
