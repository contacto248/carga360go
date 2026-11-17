#!/usr/bin/env bash
# Compila Carga360go en el servidor. Ejecutar desde cualquier directorio:
#   sudo -u carga360go /opt/carga360go/deploy/deploy.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js no está instalado. Sigue el README (Node 22)." >&2
  exit 1
fi

major="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$major" -lt 22 ]]; then
  echo "Se requiere Node.js 22 o superior (better-sqlite3 13). Actual: $(node -v)" >&2
  exit 1
fi

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Falta $ROOT/.env. Copia .env.example y completa DATABASE_PATH, APP_URL y COOKIE_SECURE." >&2
  exit 1
fi

npm ci
npm run build
echo "Build listo. Reinicia el servicio: sudo systemctl restart carga360go"
