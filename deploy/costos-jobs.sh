#!/usr/bin/env bash
# Job del motor de costos: refresca el diésel (CNE – Bencina en Línea) y revisa los PDF oficiales de peajes (MOP).
# Uso: costos-jobs.sh   (lo invoca cron como el usuario carga360go; requiere COSTOS_CRON_SECRET en .env)
# El secreto se lee de .env y se entrega a curl por un archivo temporal de modo 600;
# no va en la línea de comandos (no queda visible en ps ni en /proc/*/cmdline).
set -euo pipefail
umask 077

env_file="${C360_ENV_FILE:-/opt/carga360go/.env}"
base_url="${C360_JOBS_URL:-http://127.0.0.1:3017}"
host_header="${C360_JOBS_HOST:-www.carga360go.cl}"

read_env() {
  local key="$1" line raw
  [[ -r "$env_file" ]] || return 0
  line="$(grep -E "^${key}=" "$env_file" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  raw="${line#${key}=}"
  raw="${raw%$'\r'}"
  if [[ "$raw" == \"*\" && "$raw" == *\" ]]; then
    raw="${raw#\"}"
    raw="${raw%\"}"
  elif [[ "$raw" == \'*\' && "$raw" == *\' ]]; then
    raw="${raw#\'}"
    raw="${raw%\'}"
  fi
  printf '%s' "$raw"
}

secret="$(read_env COSTOS_CRON_SECRET)"
if [[ -z "$secret" ]]; then
  echo "000 $(date -Is) costos: falta COSTOS_CRON_SECRET en $env_file (job omitido)"
  exit 0
fi

tmp="$(mktemp)"
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT
chmod 600 "$tmp"
printf 'Authorization: Bearer %s\n' "$secret" > "$tmp"

code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 300 -X POST -H "@${tmp}" -H "Host: ${host_header}" "${base_url}/api/costos/cron")"
echo "${code} $(date -Is) costos"
