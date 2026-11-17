#!/usr/bin/env bash
# Respaldo nocturno cifrado de Carga360go: base SQLite (copia en línea con la API de backup de SQLite) + documentos subidos.
# Corre como root desde /etc/cron.d/carga360go-backup (instalado en /usr/local/sbin/carga360go-backup).
# Deja archivos .tar.gz.gpg (AES-256, clave simétrica en /root/.carga360go-backup.key) en /var/backups/carga360go/{daily,weekly}:
# 14 diarios y 8 semanales. Después de cada archivo .gpg nuevo, intenta copiarlo a Cloudflare R2
# (bucket carga360go-backups, prefijos daily/ y weekly/). Si la subida falla se registra y el respaldo local no se interrumpe.
# Si algo falla en el respaldo local envía una alerta a contacto@carga360go.cl.
set -Eeuo pipefail
umask 077

APP=${APP_DIR:-/opt/carga360go}
ENV_FILE=$APP/.env
DEST=${BACKUP_ROOT:-/var/backups/carga360go}
KEY=${BACKUP_KEY_FILE:-/root/.carga360go-backup.key}
ALERT=${BACKUP_ALERT:-/usr/local/sbin/carga360go-backup-alert}
PULL_GROUP=${BACKUP_PULL_GROUP:-irprgxxh}
KEEP_DAILY=${KEEP_DAILY:-14}
KEEP_WEEKLY=${KEEP_WEEKLY:-8}
WORK=""

log() { echo "$(date -u +%FT%TZ) $*"; }

fail() {
  trap - ERR
  log "ERROR: $1"
  "$ALERT" "$1" || log "No se pudo enviar la alerta por correo."
  exit 1
}
trap 'fail "Falló en la línea $LINENO (comando: $BASH_COMMAND)"' ERR
cleanup() { [[ -n "$WORK" && -d "$WORK" ]] && rm -rf "$WORK"; }
trap cleanup EXIT

envval() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }

[[ -r "$ENV_FILE" ]] || fail "No se puede leer $ENV_FILE"
DB=$(envval DATABASE_PATH)
UP=$(envval UPLOAD_DIR)
[[ -f "$DB" ]] || fail "No existe la base $DB"
[[ -d "$UP" ]] || fail "No existe la carpeta de documentos $UP"
[[ -s "$KEY" ]] || fail "Falta la clave de cifrado $KEY"

install -d -m 750 -o root -g "$PULL_GROUP" "$DEST" "$DEST/daily" "$DEST/weekly"
WORK=$(mktemp -d /var/tmp/c360-backup.XXXXXX)
DAY=$(TZ=America/Santiago date +%F)
TS=$(date -u +%Y%m%dT%H%M%SZ)
NAME="carga360go-$DAY-$TS"

# 1) Copia en línea de SQLite (consistente aunque la app esté escribiendo) y verificación de integridad.
node - "$DB" "$WORK/carga360go.sqlite" "$WORK/manifest.json" "$APP" <<'NODE'
const [db, out, manifest, app] = process.argv.slice(2);
const Database = require(`${app}/node_modules/better-sqlite3`);
(async () => {
  const source = new Database(db, { readonly: true, fileMustExist: true });
  await source.backup(out);
  source.close();
  const copy = new Database(out, { readonly: true });
  const integrity = copy.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") throw new Error(`integrity_check: ${integrity}`);
  const count = (table) => copy.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  const info = {
    createdAt: new Date().toISOString(),
    schema: copy.prepare("SELECT MAX(version) AS v FROM schema_migrations").get().v,
    users: count("users"),
    loads: count("loads"),
    trucks: count("trucks"),
    documents: count("documents"),
  };
  copy.close();
  require("fs").writeFileSync(manifest, JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info));
})().catch((error) => { console.error(error.message); process.exit(1); });
NODE
UPLOAD_FILES=$(find "$UP" -type f | wc -l)
log "Base copiada; documentos subidos: $UPLOAD_FILES archivos"

# 2) Un solo tar con base + manifiesto + documentos, cifrado con AES-256.
tar -czf "$WORK/bundle.tar.gz" -C "$WORK" carga360go.sqlite manifest.json -C "$(dirname "$UP")" "$(basename "$UP")"
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$KEY" --symmetric --cipher-algo AES256 \
  -o "$WORK/$NAME.tar.gz.gpg" "$WORK/bundle.tar.gz"

# 3) Comprobar que el archivo cifrado se puede descifrar y leer antes de darlo por bueno.
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$KEY" -d "$WORK/$NAME.tar.gz.gpg" | tar -tzf - >/dev/null

(cd "$WORK" && sha256sum "$NAME.tar.gz.gpg" > "$NAME.tar.gz.gpg.sha256")
install -m 640 -o root -g "$PULL_GROUP" "$WORK/$NAME.tar.gz.gpg" "$WORK/$NAME.tar.gz.gpg.sha256" "$DEST/daily/"

# 4) Semanal: si el último semanal tiene 7 días o más (o no hay), este diario también queda como semanal.
LAST_WEEKLY=$(ls -1t "$DEST/weekly/"*.gpg 2>/dev/null | head -n 1 || true)
if [[ -z "$LAST_WEEKLY" ]] || [[ $(( ($(date +%s) - $(stat -c %Y "$LAST_WEEKLY")) / 86400 )) -ge 7 ]]; then
  cp -p "$DEST/daily/$NAME.tar.gz.gpg" "$DEST/daily/$NAME.tar.gz.gpg.sha256" "$DEST/weekly/"
  log "Copia semanal: $NAME"
fi

# 5) Retención: 14 diarios y 8 semanales.
prune() {
  local dir=$1 keep=$2
  ls -1t "$dir"/*.tar.gz.gpg 2>/dev/null | tail -n +"$((keep + 1))" | while read -r old; do rm -f "$old" "$old.sha256"; done
}
prune "$DEST/daily" "$KEEP_DAILY"
prune "$DEST/weekly" "$KEEP_WEEKLY"

SIZE=$(stat -c %s "$DEST/daily/$NAME.tar.gz.gpg")
printf '{"ok":true,"file":"%s","bytes":%s,"uploads":%s,"at":"%s","manifest":%s}\n' \
  "daily/$NAME.tar.gz.gpg" "$SIZE" "$UPLOAD_FILES" "$(date -u +%FT%TZ)" "$(cat "$WORK/manifest.json" | tr -d '\n')" > "$WORK/last-success.json"
install -m 640 -o root -g "$PULL_GROUP" "$WORK/last-success.json" "$DEST/last-success.json"
log "Respaldo listo: $DEST/daily/$NAME.tar.gz.gpg ($SIZE bytes)"

# 6) Copia remota a Cloudflare R2, solo de los .gpg ya cifrados. Un fallo se registra y no corta el respaldo local.
R2_ENV=${R2_ENV_FILE:-/root/.carga360go-r2.env}
r2_upload() {
  local src=$1 dest_dir=$2
  local base
  base=$(basename "$src")
  if [[ ! -f "$src" || "$base" != *.gpg || "$base" == *.sha256 ]]; then
    return 0
  fi
  if [[ ! -r "$R2_ENV" ]]; then
    log "R2 omitido: no se puede leer $R2_ENV"
    return 0
  fi
  if ! command -v rclone >/dev/null 2>&1; then
    log "R2 omitido: rclone no está instalado"
    return 0
  fi
  if (
    trap - ERR EXIT
    set -euo pipefail
    # Leer KEY=valor en crudo, sin que bash expanda $ u otros metacaracteres del secreto.
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ -z "$line" || "$line" == \#* ]] && continue
      key=${line%%=*}
      val=${line#*=}
      case "$key" in
        R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|R2_ENDPOINT|R2_BUCKET)
          printf -v "$key" '%s' "$val"
          ;;
      esac
    done < "$R2_ENV"
    : "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}" "${R2_ENDPOINT:?}" "${R2_BUCKET:?}"
    export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
    rclone copyto "$src" ":s3:${R2_BUCKET}/${dest_dir}/${base}" \
      --s3-provider=Cloudflare \
      --s3-env-auth \
      --s3-region=auto \
      --s3-endpoint="${R2_ENDPOINT}" \
      --s3-no-check-bucket \
      --s3-acl=private \
      --retries 3 \
      --low-level-retries 5
  ); then
    log "R2: subido ${dest_dir}/${base}"
  else
    log "R2: falló la subida de ${dest_dir}/${base}; el respaldo local está intacto."
  fi
  return 0
}

r2_upload "$DEST/daily/$NAME.tar.gz.gpg" "daily"
if [[ -f "$DEST/weekly/$NAME.tar.gz.gpg" ]]; then
  r2_upload "$DEST/weekly/$NAME.tar.gz.gpg" "weekly"
fi
