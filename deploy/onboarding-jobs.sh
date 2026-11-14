#!/usr/bin/env bash
# Job de recordatorios de onboarding. Uso: onboarding-jobs.sh recordatorios
set -euo pipefail
job="${1:-recordatorios}"
env_file="${C360_ENV_FILE:-/opt/carga360go/.env}"
base_url="${C360_JOBS_URL:-http://127.0.0.1:3017}"
host_header="${C360_JOBS_HOST:-www.carga360go.cl}"
secret="$(grep -E '^ONBOARDING_CRON_SECRET=' "$env_file" | cut -d= -f2-)"
code="$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer ${secret}" -H "Host: ${host_header}" "${base_url}/api/onboarding/jobs/${job}")"
echo "${code} $(date -Is) ${job}"
