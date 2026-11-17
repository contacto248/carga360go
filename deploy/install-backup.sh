#!/usr/bin/env bash
# Instala (o actualiza) el respaldo cifrado. Ejecutar con sudo desde /opt/carga360go.
# La clave debe existir antes en /root/.carga360go-backup.key (root, 600).
set -euo pipefail
APP=/opt/carga360go
install -m 750 -o root -g root "$APP/deploy/backup.sh" /usr/local/sbin/carga360go-backup
install -m 750 -o root -g root "$APP/deploy/backup-alert.cjs" /usr/local/sbin/carga360go-backup-alert
install -m 750 -o root -g root "$APP/deploy/restore-backup.sh" /usr/local/sbin/carga360go-restore
install -m 644 -o root -g root "$APP/deploy/carga360go-backup.cron" /etc/cron.d/carga360go-backup
touch /var/log/carga360go-backup.log && chmod 640 /var/log/carga360go-backup.log
# El respaldo antiguo (crontab del usuario carga360go, sin cifrar y sin documentos) queda reemplazado.
crontab -u carga360go -r 2>/dev/null || true
test -s /root/.carga360go-backup.key && stat -c '%U %a' /root/.carga360go-backup.key
echo "Instalado. Próxima ejecución: 06:15 UTC (03:15 Chile)."
