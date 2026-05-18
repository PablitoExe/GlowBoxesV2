#!/usr/bin/env bash
# rotate.sh — Delete old backups, keeping the N most recent.
# Usage: ./rotate.sh [backup-dir] [keep-count]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$SCRIPT_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
fi

BACKUP_DIR="${1:-${BACKUP_DIR:-$SCRIPT_DIR/dumps}}"
KEEP="${2:-${BACKUP_KEEP:-14}}"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "[rotate] Directory not found: $BACKUP_DIR" >&2
  exit 1
fi

TOTAL=$(find "$BACKUP_DIR" -maxdepth 1 -name "*.sql.gz" | wc -l)
DELETE_COUNT=$(( TOTAL - KEEP ))

if [[ "$DELETE_COUNT" -le 0 ]]; then
  echo "[rotate] $TOTAL backup(s) found. Nothing to delete (keeping $KEEP)."
  exit 0
fi

echo "[rotate] $TOTAL backup(s) found. Deleting $DELETE_COUNT oldest (keeping $KEEP)."

find "$BACKUP_DIR" -maxdepth 1 -name "*.sql.gz" \
  | sort \
  | head -n "$DELETE_COUNT" \
  | xargs -r rm -v

echo "[rotate] Done."
