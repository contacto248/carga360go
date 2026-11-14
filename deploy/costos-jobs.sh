#!/usr/bin/env bash
# Job del motor de costos: refresca el diésel (CNE – Bencina en Línea) y revisa los PDF oficiales de peajes (MOP).
# Uso: costos-jobs.sh   (lo invoca cron como el usuario carga360go; requiere COSTOS_CRON_SECRET en .env)
set -euo pipefail
env_file="${C360_ENV_FILE:-/opt/carga360go/.env}"
base_url="${C360_JOBS_URL:-http://127.0.0.1:3017}"
host_header="${C360_JOBS_HOST:-www.carga360go.cl}"
secret="$(grep -E '^COSTOS_CRON_SECRET=' "$env_file" | cut -d= -f2- || true)"
if [[ -z "$secret" ]]; then
  echo "000 $(date -Is) costos: falta COSTOS_CRON_SECRET en $env_file (job omitido)"
  exit 0
fi
code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 300 -X POST -H "Authorization: Bearer ${secret}" -H "Host: ${host_header}" "${base_url}/api/costos/cron")"
echo "${code} $(date -Is) costos"
