#!/usr/bin/env bash
# restore-db.sh — Restore a Glow Boxes database backup.
# Usage: ./restore-db.sh <backup-file.sql.gz>
# WARNING: This will DROP and recreate the public schema. Use with caution.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$SCRIPT_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
fi

PGHOST="${PGHOST:?PGHOST not set}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-postgres}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:?PGPASSWORD not set}"

BACKUP_FILE="${1:-}"
if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup-file.sql.gz>" >&2
  exit 1
fi
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Error: file not found: $BACKUP_FILE" >&2
  exit 1
fi

export PGPASSWORD

echo "[restore] WARNING: This will overwrite the public schema in $PGDATABASE."
read -rp "Type 'yes' to continue: " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "[restore] Aborted."
  exit 0
fi

echo "[restore] Restoring from: $BACKUP_FILE"

gunzip -c "$BACKUP_FILE" | psql \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE"

echo "[restore] Done."
