#!/usr/bin/env bash
# Respaldo nocturno de la base SQLite. Lo invoca cron como el usuario carga360go.
set -euo pipefail
ROOT=/opt/carga360go
cd "$ROOT"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
exec "$ROOT/node_modules/.bin/tsx" "$ROOT/scripts/backup-db.ts"
