#!/usr/bin/env bash
# Restaurar un respaldo cifrado de Carga360go.
#   Probar (no toca producción):  sudo carga360go-restore /var/backups/carga360go/daily/ARCHIVO.tar.gz.gpg /var/tmp/prueba
#   Restaurar en producción:      sudo carga360go-restore ARCHIVO.tar.gz.gpg --produccion
# En modo --produccion: detiene el servicio, guarda la base y los documentos actuales en /var/lib/carga360go/antes-de-restaurar-FECHA,
# restaura la base y los documentos del respaldo y vuelve a iniciar el servicio.
set -euo pipefail
umask 077
FILE=${1:?Indica el archivo .tar.gz.gpg}
TARGET=${2:?Indica una carpeta de prueba o --produccion}
KEY=${BACKUP_KEY_FILE:-/root/.carga360go-backup.key}
if [[ -f "$FILE.sha256" ]]; then (cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256"); fi
WORK=$(mktemp -d /var/tmp/c360-restore.XXXXXX)
trap 'rm -rf "$WORK"' EXIT
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$KEY" -d "$FILE" | tar -xzf - -C "$WORK"
node -e "const D=require('/opt/carga360go/node_modules/better-sqlite3');const db=new D(process.argv[1],{readonly:true});const r=db.pragma('integrity_check',{simple:true});if(r!=='ok'){console.error(r);process.exit(1)};console.log('integridad ok; usuarios',db.prepare('select count(*) n from users').get().n,'cargas',db.prepare('select count(*) n from loads').get().n)" "$WORK/carga360go.sqlite"
cat "$WORK/manifest.json"; echo
if [[ "$TARGET" != "--produccion" ]]; then
  mkdir -p "$TARGET"
  cp -a "$WORK/." "$TARGET/"
  echo "Respaldo extraído en $TARGET (producción no se tocó)."
  exit 0
fi
DB=$(grep -E '^DATABASE_PATH=' /opt/carga360go/.env | cut -d= -f2-)
UP=$(grep -E '^UPLOAD_DIR=' /opt/carga360go/.env | cut -d= -f2-)
SAVE=/var/lib/carga360go/antes-de-restaurar-$(date -u +%Y%m%d-%H%M%S)
systemctl stop carga360go
mkdir -p "$SAVE"
cp -a "$DB"* "$SAVE/" 2>/dev/null || true
cp -a "$UP" "$SAVE/uploads"
rm -f "$DB-wal" "$DB-shm"
install -m 600 -o carga360go -g carga360go "$WORK/carga360go.sqlite" "$DB"
rm -rf "$UP" && cp -a "$WORK/$(basename "$UP")" "$UP" && chown -R carga360go:carga360go "$UP" && chmod 700 "$UP"
systemctl start carga360go
echo "Restaurado. Copia previa de la base y documentos en $SAVE"
