# Carga360go

Marketplace chileno de transporte de carga (general y masiva) en las 16 regiones, que conecta transportistas con mandantes y empresas que necesitan transporte. Reemplaza el demo estático (datos en el navegador) por una aplicación con cuentas, base de datos y despliegue en un VPS.

Chilean return-load marketplace for carriers (transportistas), shippers (mandantes) and mining companies. This is the self-hosted app behind [carga360go.cl](https://carga360go.cl).

La interfaz está en español de Chile. El contacto entre las partes sigue siendo WhatsApp; la plataforma no cobra ni ejecuta el flete.

## Por qué SQLite

El primer servidor es un VPS de 2 vCPU y 4 GB (AlmaLinux 9), con del orden de 100 transportistas. SQLite en modo WAL cabe en ese equipo sin un proceso extra de Postgres, aguanta las lecturas simultáneas de los listados y el respaldo nocturno es un archivo. Si más adelante hay varios nodos, el esquema es SQL plano y se puede mover a PostgreSQL.

SQLite (WAL) fits a single 2 vCPU / 4 GB VPS and about 100 carriers without another database process. Nightly backup is a file copy via the SQLite backup API. The schema is ordinary SQL if you later move to PostgreSQL.

## Desarrollo local

Requisito: Node.js 22 o superior (`better-sqlite3` 13 no arranca en Node 20).

```bash
cp .env.example .env
# En local puedes dejar DATABASE_PATH y UPLOAD_DIR por defecto (carpeta data/).
# COOKIE_SECURE=false mientras entras por http://127.0.0.1
npm ci
npm run dev
```

Abre http://127.0.0.1:4317

Producción local (después de `npm run build`):

```bash
npm start
```

Escucha en http://127.0.0.1:3017 (el mismo puerto que usa nginx en el servidor).

### Cuentas

El registro público crea `transportista` o `mandante` (las empresas con carga se registran como mandante). El rol `admin` solo se crea con el script:

```bash
ADMIN_EMAIL=admin@carga360go.cl ADMIN_PASSWORD='una-clave-larga' ADMIN_RUT='12.345.678-5' npm run create-admin
```

Si omites las variables y hay terminal, el script pregunta. La contraseña no se imprime ni queda en el código. Si el correo ya es admin, actualiza la clave. Si el correo pertenece a otra cuenta, se niega.

### Datos de prueba (opcional, no en producción)

```bash
SEED_DEV=1 npm run seed-dev
```

Crea `mandante@demo.local` / `Demo-Manda-2026` y `transportista@demo.local` / `Demo-Trans-2026`, con avisos marcados DEMO. No corre si `NODE_ENV=production` salvo que además pongas `ALLOW_DEMO_SEED=1` en un entorno desechable. Vuelve a correrlo para refrescar fechas. La base de producción debe nacer vacía, solo con el administrador.

### Pruebas

```bash
npm test
npm run build
```

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `APP_URL` | URL pública, sin barra final. Entra en el enlace de restablecer contraseña. |
| `DATABASE_PATH` | Archivo SQLite. En el VPS: `/var/lib/carga360go/carga360go.sqlite`. |
| `UPLOAD_DIR` | Documentos de camiones y personal. Límite y tipos en la app (PDF, JPG, PNG, WEBP, 10 MB). |
| `BACKUP_DIR` | Copias previas a cada despliegue. El respaldo nocturno cifrado va a `/var/backups/carga360go` (ver sección 9). |
| `MAIL_OUTBOX` | Si no hay SMTP, cada enlace de restablecimiento se guarda aquí y en el journal. |
| `COOKIE_SECURE` | `true` detrás de HTTPS. `false` solo en local por HTTP. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Correo real. Con `SMTP_HOST` vacío el enlace de “olvidé mi contraseña” queda en `MAIL_OUTBOX` y en el journal. |
| `MAX_UPLOAD_BYTES` | Tope de cada archivo. Nginx debe permitir un poco más (`client_max_body_size 12m`). |
| `TZ` | `America/Santiago` para que “hoy” y las fechas de retiro coincidan con Chile. |

La cookie de sesión se llama `c360_session`, es `httpOnly`, `SameSite=Lax` y dura 14 días. En la base se guarda solo el SHA-256 del token. La contraseña usa scrypt.

### Correo SMTP

La página `/recuperar` pide el correo y, si la cuenta existe, envía un enlace a `/restablecer` válido por una hora. Sin `SMTP_HOST` el envío es un stub: el texto queda en `MAIL_OUTBOX` y en `journalctl -u carga360go`.

Para enviarlo de verdad, completa `.env` y reinicia el servicio:

```
SMTP_HOST=smtp.tuproveedor.cl
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@carga360go.cl
SMTP_PASS=la-clave-del-buzón
SMTP_FROM=Carga360go <noreply@carga360go.cl>
APP_URL=https://www.carga360go.cl
```

`SMTP_SECURE=true` solo si el puerto es 465. En el 587 deja `false` (STARTTLS). `APP_URL` es la base del enlace, así que tiene que ser la dirección pública con `www`.

```bash
sudo systemctl restart carga360go
```

Prueba con “¿Olvidaste tu contraseña?” y revisa que el mensaje llegue. Si no hay SMTP, abre el archivo nuevo en `/var/lib/carga360go/mail-outbox`.

### Migraciones de la base

Al arrancar, la app aplica las migraciones que falten en `schema_migrations`. No hay un comando aparte.

| Versión | Qué agrega |
| --- | --- |
| 1 | Tablas iniciales: usuarios, sesiones, restablecimientos, cargas, camiones y documentos. |
| 2 | `loads.solo_verificados`. En `documents`: `audience` (`camion` o `personal`), `detail` (clase de licencia) y `holder_name`. Los tipos de camión que ya existían quedan con audiencia `camion`. |
| 14 | En `users`: contacto de respaldo (`backup_contact`, `backup_contact_type`, `backup_contact_at`) y verificación manual de solo lectura por 30 días (`manual_readonly_until`, `manual_readonly_at`, `manual_readonly_by`, `manual_readonly_by_email`). Ver `docs/VERIFICACION-RESPALDO.md`. |
| 15 | Agente comercial (web, WhatsApp y teléfono): `agent_conversations`, `agent_messages`, `agent_leads`, `load_tracking_codes` y `agent_otp_challenges`. Solo tablas nuevas. Copia legible: `docs/migrations/015-agente-comercial.sql`. |
| 16 | Motor de costos: `cost_params`, `cost_geocode_cache`, `cost_route_cache`, `cost_sources`, `cost_toll_plazas`, `cost_toll_rates`, `cost_diesel_prices`, `cost_job_runs` y `cost_quotes`; carga las plazas y tarifas de peaje con fuente. Solo tablas nuevas. Copia legible: `docs/migrations/016-motor-costos.sql`. El precio del diésel se llena con el job `deploy/carga360go-costos.cron`. |

## Despliegue en AlmaLinux 9

Un usuario con sudo, en el VPS. El sitio queda en `/opt/carga360go` y los datos en `/var/lib/carga360go` (la base no se borra al volver a compilar).

### 1. Node.js 22 y herramientas

`better-sqlite3` 13 exige Node.js 22 o superior. Node 20 falla al cargar el módulo.

```bash
sudo dnf install -y gcc-c++ make python3 git nginx firewalld
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
node -v   # v22.x
```

El paquete trae binario precompilado. El compilador queda por si ese binario no cubre la máquina.

### 2. Usuario, directorios y código

```bash
sudo useradd --system --create-home --home-dir /opt/carga360go --shell /sbin/nologin carga360go || true
sudo mkdir -p /var/lib/carga360go/uploads /var/lib/carga360go/backups /var/lib/carga360go/mail-outbox
sudo chown -R carga360go:carga360go /var/lib/carga360go
sudo mkdir -p /opt/carga360go
sudo chown carga360go:carga360go /opt/carga360go
sudo -u carga360go git clone <URL-DEL-REPO> /opt/carga360go
```

Si el directorio ya tiene el código, entra como `carga360go` y haz `git pull`.

### 3. Entorno

```bash
sudo -u carga360go cp /opt/carga360go/.env.example /opt/carga360go/.env
sudo -u carga360go nano /opt/carga360go/.env
```

Deja al menos:

```
NODE_ENV=production
APP_URL=https://www.carga360go.cl
DATABASE_PATH=/var/lib/carga360go/carga360go.sqlite
UPLOAD_DIR=/var/lib/carga360go/uploads
BACKUP_DIR=/var/lib/carga360go/backups
MAIL_OUTBOX=/var/lib/carga360go/mail-outbox
COOKIE_SECURE=true
TZ=America/Santiago
```

```bash
sudo chmod 600 /opt/carga360go/.env
```

### 4. Compilar y crear el administrador

```bash
sudo -u carga360go /opt/carga360go/deploy/deploy.sh
sudo -u carga360go bash -lc 'cd /opt/carga360go && set -a && source .env && set +a && ADMIN_EMAIL=admin@carga360go.cl ADMIN_PASSWORD="elige-una-clave" ADMIN_RUT="12.345.678-5" npm run create-admin'
```

`deploy.sh` corre `npm ci` y `npm run build`. No toca la base.

### 5. systemd

```bash
sudo cp /opt/carga360go/deploy/carga360go.service /etc/systemd/system/carga360go.service
sudo systemctl daemon-reload
sudo systemctl enable --now carga360go
sudo systemctl status carga360go
curl -fsS http://127.0.0.1:3017/api/salud
```

La app escucha solo en `127.0.0.1:3017`. Tras cada `git pull`:

```bash
sudo -u carga360go /opt/carga360go/deploy/deploy.sh
sudo systemctl restart carga360go
```

### 6. nginx

```bash
sudo cp /opt/carga360go/deploy/nginx-carga360go.conf /etc/nginx/conf.d/carga360go.conf
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

El archivo declara `server_name carga360go.cl www.carga360go.cl`, hace de proxy inverso hacia el puerto 3017 y fija `client_max_body_size 12m` para los documentos de la fase siguiente.

Firewall:

```bash
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 7. SELinux

En la política targeted, nginx no puede conectar a Node hasta activar esta boolean:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

Si el servicio no puede escribir la base o los archivos:

```bash
sudo semanage fcontext -a -t var_lib_t '/var/lib/carga360go(/.*)?'
sudo restorecon -Rv /var/lib/carga360go
```

Para ver un rechazo: `sudo ausearch -m avc -ts recent`.

### 8. HTTPS con Certbot

```bash
sudo dnf install -y epel-release
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d carga360go.cl -d www.carga360go.cl
```

Certbot modifica el sitio de nginx y deja la renovación en un timer de systemd. Comprueba con `sudo certbot renew --dry-run`.

El DNS de `carga360go.cl` y `www.carga360go.cl` tiene que apuntar a este VPS antes de pedir el certificado.

### 9. Respaldo nocturno cifrado (base + documentos)

1. Crea la clave de cifrado una sola vez (guárdala también fuera del servidor; sin ella los respaldos no se pueden abrir):

```bash
sudo sh -c 'umask 077; openssl rand -base64 48 > /root/.carga360go-backup.key'
```

2. Instala el respaldo (script en `/usr/local/sbin`, cron en `/etc/cron.d/carga360go-backup`, alerta y restauración):

```bash
sudo bash /opt/carga360go/deploy/install-backup.sh
sudo /usr/local/sbin/carga360go-backup   # prueba a mano
```

Cada día a las 03:15 (hora de Chile) `deploy/backup.sh`, como root:

- copia la base con la API de respaldo en línea de SQLite y verifica `integrity_check`;
- empaqueta la base, un manifiesto con conteos y la carpeta de documentos subidos (`UPLOAD_DIR`) en un `.tar.gz`;
- lo cifra con GPG simétrico AES-256 (`/root/.carga360go-backup.key`) y comprueba que se pueda descifrar;
- lo deja en `/var/backups/carga360go/daily` (14 últimos) y, una vez por semana, en `/var/backups/carga360go/weekly` (8 últimos), con su `.sha256` y `last-success.json`;
- si algo falla, envía una alerta a contacto@carga360go.cl con `carga360go-backup-alert`.

Copia fuera del servidor: `scripts/pull-backups.py` (en otro equipo) descarga por SFTP los archivos cifrados nuevos, verifica el sha256, prueba descifrar el último, aplica la misma retención y, si el último respaldo tiene más de 26 horas, dispara la alerta por correo.

Restaurar:

```bash
# Prueba sin tocar producción
sudo carga360go-restore /var/backups/carga360go/daily/ARCHIVO.tar.gz.gpg /var/tmp/prueba-restauracion
# Restaurar en producción (detiene el servicio y guarda lo actual en /var/lib/carga360go/antes-de-restaurar-FECHA)
sudo carga360go-restore /var/backups/carga360go/daily/ARCHIVO.tar.gz.gpg --produccion
```

Desde una copia externa: sube el `.tar.gz.gpg` al servidor (por ejemplo a `/var/tmp`) y usa el mismo comando.

## Qué hace esta fase

- Registro, ingreso y salida con correo y contraseña. Roles `transportista`, `mandante` y `admin`.
- Sesión en cookie `httpOnly`. Restablecimiento de contraseña (SMTP o stub).
- Cargas y camiones en la base: alta según el rol, listado con los filtros del demo, ficha, edición y borrado solo del dueño.
- El panel muestra las publicaciones propias y la cantidad de compatibles, calculada con la misma regla del demo (equipo, toneladas, ficha técnica, corredor y fecha). No se sugiere el propio aviso.
- Semáforo de vencimiento de documentos. El archivo, si se adjunta, queda en disco con tope de tamaño y tipo. Cada documento y cada cuenta tienen `verification_status` (`pendiente`, `verificado`, `rechazado`).
- Panel `/admin` para marcar cuentas y documentos. Verificar no bloquea publicar: el estado se ve en el aviso.
- Sin datos de demostración al instalar. El seed es aparte y marca los avisos como DEMO.

## Qué queda para después

- Avisos por WhatsApp cuando aparezca un match.
- Pago protegido, GPS y permisos de sobredimensión.
- Validación automática de patente y lectura automática del contenido de los PDF (hoy la revisión es manual).
- Bloquear la publicación hasta que la cuenta esté verificada, si el negocio lo pide.
- Varios usuarios por empresa y el rol “ambos” del demo (hoy una cuenta es transportista o mandante).
- Postgres y más de un servidor, si el volumen lo exige.

## English deployment (short)

1. AlmaLinux 9: install git, nginx, firewalld, gcc-c++, make, python3, and Node.js 22 from NodeSource (`setup_22.x`). `better-sqlite3` 13 does not load on Node 20.
2. Create system user `carga360go`, directories `/opt/carga360go` and `/var/lib/carga360go/{uploads,backups,mail-outbox}`.
3. Clone the repo to `/opt/carga360go`, copy `.env.example` to `.env`, set `APP_URL`, `DATABASE_PATH`, `COOKIE_SECURE=true`, `TZ=America/Santiago`. `chmod 600 .env`.
4. `sudo -u carga360go /opt/carga360go/deploy/deploy.sh` then `npm run create-admin` with `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_RUT`.
5. Install `deploy/carga360go.service`, `systemctl enable --now carga360go`. The process binds `127.0.0.1:3017`.
6. Install `deploy/nginx-carga360go.conf` (`server_name carga360go.cl www.carga360go.cl`, reverse proxy, `client_max_body_size 12m`). Open http and https on firewalld.
7. `setsebool -P httpd_can_network_connect 1`. If the service cannot write the database, label `/var/lib/carga360go` as `var_lib_t` and `restorecon`.
8. `certbot --nginx -d carga360go.cl -d www.carga360go.cl`.
9. Create `/root/.carga360go-backup.key` and run `sudo bash deploy/install-backup.sh` (03:15 Chile nightly encrypted backup of DB + uploads, 14 daily + 8 weekly, email alert on failure; off-site pull with `scripts/pull-backups.py`).

Do not run `npm run seed-dev` on production. Password reset emails are stubbed until `SMTP_HOST` is set; links then land in `MAIL_OUTBOX` and in `journalctl -u carga360go`.
