#!/usr/bin/env bash
# backup-db.sh — Dump the Glow Boxes Supabase PostgreSQL database.
# Usage: ./backup-db.sh [output-dir]
# Reads credentials from .env in the same directory if it exists.

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
BACKUP_DIR="${1:-${BACKUP_DIR:-$SCRIPT_DIR/dumps}}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_FILE="$BACKUP_DIR/glowboxes_${TIMESTAMP}.sql.gz"

export PGPASSWORD

echo "[backup] Starting dump: $OUTPUT_FILE"

pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --format=plain \
  --no-owner \
  --no-acl \
  --schema=public \
  | gzip > "$OUTPUT_FILE"

SIZE=$(du -sh "$OUTPUT_FILE" | cut -f1)
echo "[backup] Done: $OUTPUT_FILE ($SIZE)"
