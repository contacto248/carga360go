# Inventario físico — ONE y UNIFICADO

Auditoría leída de los bytes de los dos zip. No usa la tabla comparativa de Gerencia como fuente. Un archivo que no está en el zip no se da por existente.

| Zip | SHA-256 verificado con sha256sum | Fecha dentro del zip | Entradas | Bytes |
| --- | --- | --- | --- | --- |
| `CARGA360GO-ONE-UNIFICADO.zip` | `6883f4d08bce81f2755094ef2289b99875bfc071e0b5ffd07e4359d92c5654d0` | 2026-11-17 11:06 | 18 | 20028 |
| `CARGA360GO-UNIFICADO-FINAL.zip` | `25e71f3837054c84839d9c01030e3ab27f0447b9a780d4570b1a2756ab837410` | 2026-11-17 10:57 | 16 | 18162 |

Release de contraste: `origin/release/2026-11-15` en `be067cb97306d0e153fb9adb52eb8a188025db44`. Este PR no porta código, no arranca FastAPI, Redis, PostgreSQL ni Docker, y no abre otra aplicación.

Decisión de producto, no leída como código: ONE absorbe a UNIFICADO. UNIFICADO queda como infraestructura interna (IAM, API, orquestador, auditoría), no como segundo producto. En los bytes, ONE no incluye el fuente de UNIFICADO: lo reescribe más corto. Lo que UNIFICADO tiene y ONE no trae está en la sección 4.

No hay claves de API. En ONE, `OPENAI_API_KEY` y `XAI_API_KEY` van vacíos. `JWT_SECRET` del ejemplo es un texto de reemplazo. El fuente, si falta esa variable, usa un literal de desarrollo. El Compose y `DATABASE_URL` repiten un usuario local de demostración, el mismo nombre que la base. No es una credencial de producción y no se copia a un `.env` real. El bytecode `app/__pycache__/main.cpython-312.pyc` (6957 bytes) declara las mismas rutas que `app/main.py` (`/`, `/health`, `/api/ai/chat`, `/api/shipments`, `/api/control-tower`). No agrega endpoints. No se versiona.

## 1. Archivos de ONE

| Ruta | Bytes | Clase | Qué aporta |
| --- | ---: | --- | --- |
| `CARGA360GO-ONE/` | 0 | — | Directorio |
| `.env.example` | 233 | Plantilla | URL de Postgres, Redis, JWT de reemplazo, claves de API vacías, modelos y orden `AI_PRIMARY` / `AI_FALLBACK` |
| `Dockerfile` | 189 | Archivo, no se despliega | Python 3.12, uvicorn en `0.0.0.0:8000` |
| `README.md` | 943 | Solo descrito | Qué dice incluir y la sección «Antes de producción» |
| `app/` | 0 | — | Directorio |
| `app/__pycache__/` | 0 | — | Directorio |
| `app/__pycache__/main.cpython-312.pyc` | 6957 | Caché | Mismo módulo que `main.py` |
| `app/main.py` | 3284 | Implementado a medias | Cuatro rutas. Dos no escriben la base |
| `app/static/` | 0 | — | Directorio |
| `app/static/index.html` | 4326 | Stub visual | Torre dibujada con números fijos |
| `database/` | 0 | — | Directorio |
| `database/schema.sql` | 2501 | SQL no usado por `main.py` | Tablas de dominio. Ningún `INSERT` de negocio desde Python |
| `docker-compose.yml` | 552 | Archivo, no se ejecuta | Postgres 16, Redis 7, app y Nginx en el puerto 80 |
| `docs/` | 0 | — | Directorio |
| `docs/ARCHITECTURE.md` | 577 | Solo descrito | Cadena objetivo y agentes previstos |
| `nginx/default.conf` | 311 | Archivo, no se ejecuta | Límite 20 req/s y proxy. Sin TLS |
| `requirements.txt` | 155 | Lista | Paquetes fijados. `redis` y `passlib` no se importan en `main.py` |

`README.md`, sección «Antes de producción», dice que antes de producción hay que reemplazar secretos, poner TLS, persistir JWT/refresh/MFA con el IAM completo, conectar GPS y mapas, object storage, correo, WhatsApp, facturación y pruebas de seguridad y de carga. Cierra diciendo que no se incluyen claves privadas ni credenciales externas. El zip, con esas palabras, no se presenta listo para producción.

## 2. Archivos de UNIFICADO

La copia ya fusionada en el repo, sin bytecode, está en `docs/arquitectura/ai-router/referencia/`. El SHA de arriba es el del zip, no el de esa carpeta.

| Ruta | Bytes | Clase | Qué aporta |
| --- | ---: | --- | --- |
| `CARGA360GO-UNIFICADO-FINAL/` | 0 | — | Directorio |
| `.env.example` | 401 | Plantilla | Claves de API vacías. Modelos `gpt-5-mini` y `grok-4.7`. Timeout 120 s. Precios de entrada y salida por millón de tokens |
| `Dockerfile` | 209 | Archivo, no se despliega | uvicorn con `--proxy-headers` en el puerto 8000 |
| `GUIA-DESPLIEGUE.md` | 1419 | Solo descrito | Alta SQL del primer `SUPER_ADMIN` y prueba de `/v1/ai/orchestrate` |
| `INVENTARIO-REAL.md` | 1136 | Solo descrito | Nota de qué unificó. No es código |
| `README.md` | 699 | Solo descrito | Arranque y aviso de no guardar claves en Git |
| `app/main.py` | 10113 | Implementado, con huecos | Login, MFA TOTP, logout, `/v1/me`, orquestador con `both` y coste, uso agregado |
| `db/schema.sql` | 2634 | SQL de IAM y de uso | Tenants, usuarios, roles, permisos, tokens revocados, `audit_logs`, `ai_usage` |
| `docker-compose.yml` | 806 | Archivo, no se ejecuta | Postgres, API y Nginx. No trae Redis |
| `nginx/default.conf` | 303 | Archivo, no se ejecuta | 10 req/s, cuerpo máximo 2m, proxy de todo `/`. Sin TLS |
| `requirements.txt` | 218 | Lista | FastAPI, httpx, SQLAlchemy, psycopg, PyJWT, passlib con Argon2, pyotp |
| `tests/test_static.py` | 224 | Stub | Solo comprueba que cinco archivos existan |

UNIFICADO no dice la frase «antes de producción». Su guía pide HTTPS, secretos gestionados y copias de Postgres antes de exponerlo. Tampoco está cerrado: el rol `AUDITOR` se inserta sin permisos, `users.email` es `citext` sin `CREATE EXTENSION citext`, y el modo `both` no escribe `ai_usage`.

## 3. Qué hay de cada tema, leído en los archivos

| Tema | ONE | UNIFICADO |
| --- | --- | --- |
| Marketplace | Nombrado en el README, en el menú del HTML y en la lista de `GET /api/control-tower`. `POST /api/shipments` arma un id `C360-` y responde `REQUESTED` / `MATCHING` en memoria. No inserta en `shipments` ni elige transportista | No aparece |
| Control Tower | `index.html` pinta «Control Tower 360» con 24, 11, 3 y 96.4% fijos, una línea y tres puntos. `GET /api/control-tower` devuelve la lista de módulos y `status: ready`. No lee la base | No aparece |
| Operaciones | Tabla `shipments` en SQL. La ruta no la usa | No aparece |
| Cotizaciones | Tabla `quotes` (`amount`, `CLP`, `OFFERED`). Sin ruta | No aparece |
| Tracking | Tabla `tracking_events` (`lat`, `lon`). Sin ruta. El mapa del HTML no consulta coordenadas | No aparece |
| IoT | Tabla `sensor_events` (`sensor_type`, `value`, `unit`, `proof_hash`). Sin ruta ni cliente de sensores. Redis está en Compose, en `requirements.txt` y en `REDIS_URL`, y `main.py` no lo importa | No aparece |
| Documentos | Tabla `documents` (`kind`, `uri`, `sha256`). Sin subida | No aparece |
| Incidencias | Tabla `incidents` (`severity`, `OPEN`). Sin ruta | No aparece |
| Finanzas | Palabra `finance` en la lista del tower y «Finanzas» en el menú. Rol `FINANCE_MANAGER` sembrado. Sin cargos, facturas ni pagos | No aparece |
| Analytics | «Analytics» en el menú y `analytics` en la lista. El 96.4% es HTML fijo. Sin consulta | No aparece |
| Auditoría | Tabla `ai_audit` (`trace_id`, `provider`, `model`, `action`, `metadata`). `chat` no inserta ahí. No hay trigger que impida borrar | Implementado en el camino de un proveedor: `audit()` inserta `audit_logs` y el éxito inserta `ai_usage` (proveedor, modelo, tokens, coste, latencia, `fallback_used`). `GET /v1/admin/usage` suma por tenant. `both` solo deja el evento `AI_BOTH` con `trace_id` |
| Digital Twin | Ningún archivo contiene «digital» ni «twin» | Tampoco |
| Guardian AI | Tres frases fijas en el HTML («Desvío de ruta», «Documento próximo a vencer», «ETA recalculado»). `ARCHITECTURE.md` nombra al agente Guardian entre los previstos. No hay código del agente | No aparece |
| Cadena de evidencias con hashes | Columnas `proof_hash` y `documents.sha256`. Ninguna función calcula un hash ni encadena el anterior. `ARCHITECTURE.md` dice que el ledger verificable es opcional y está desacoplado | No aparece. El fallo de login guarda el SHA-256 del correo, no una cadena de evidencias |
| Orquestador OpenAI/xAI | Implementado en `provider` y `POST /api/ai/chat`. Modos `auto`, `openai`, `xai`. No hay `both`. Timeout fijo de 45 s. Modelos por defecto `gpt-5` y `grok-4`. `auto` usa `AI_PRIMARY` y luego `AI_FALLBACK`, no el precio. No calcula coste ni escribe uso | Implementado en `POST /v1/ai/orchestrate`. Modos `auto`, `openai`, `xai` y `both`. `auto` ordena por la suma de precios de entorno. Forzar un proveedor cae al otro. Timeout `PROVIDER_TIMEOUT_SECONDS` default 120. Coste con precios por millón. Exige permiso `ai.execute` |

## 4. Qué de UNIFICADO no está en ONE

Comparado archivo contra archivo. «No está» significa que ONE no trae ese comportamiento en su fuente.

| Pieza de UNIFICADO | En ONE |
| --- | --- |
| `POST /v1/auth/login` con Argon2 y formulario OAuth2 | No está. No hay ruta de login. `passlib` figura en `requirements.txt` y no se importa |
| `POST /v1/auth/mfa/verify` con TOTP (`pyotp`) y secreto en `users.mfa_secret` | No está. El esquema de ONE tiene `mfa_enabled` y no tiene `mfa_secret`. No está `pyotp` |
| `POST /v1/auth/logout` y tabla `revoked_tokens` | No está |
| `GET /v1/me` | No está |
| Permisos `ai.execute`, `audit.read`, `user.manage`, `role.assign` y `require()` | No está. ONE siembra roles y no tiene tabla `permissions` ni `role_permissions` |
| Identidad obligatoria | No está. Si no viene `Authorization`, `identity()` devuelve `sub=demo`, `tenant_id=demo`, rol `SUPER_ADMIN` |
| Modo `both` | No está. Cero apariciones en los archivos de texto de ONE |
| Coste configurable y `estimated_cost_usd` | No está |
| `max_output_tokens` y `store: false` en la llamada | No está. El cuerpo solo manda `model` e `input` |
| Persistencia de `ai_usage` y `GET /v1/admin/usage` | No está. La tabla de ONE es `ai_audit` y el chat no escribe |
| `GUIA-DESPLIEGUE.md`, `INVENTARIO-REAL.md`, `tests/test_static.py` | No están |
| Modelos por defecto `gpt-5-mini` y `grok-4.7`, timeout 120 s | ONE trae otros defaults: `gpt-5`, `grok-4`, 45 s |
| SQLAlchemy | No está en `requirements.txt` de ONE. `psycopg` sí está listado y `main.py` no abre la base |

ONE añade, y UNIFICADO no tiene, el HTML, `POST /api/shipments`, `GET /api/control-tower`, Redis en el Compose, y las tablas `shipments`, `tracking_events`, `sensor_events`, `documents`, `incidents` y `quotes`. Esas tablas no reciben escrituras desde `main.py`.

## 5. Orden de porte, sin hacerlo en este PR

Un solo Next.js. Los zip no se despliegan. Las migraciones 030 y 031 ya están ocupadas (operación y severidad de alertas). La 032 en adelante queda para Policy Engine, bus e IAM. Este documento no crea SQL.

Cada PR futuro nace con su flag apagado salvo el texto exacto `true`. Apagado, la ruta responde 404. Ninguno envuelve el orquestador en `OPS_FEATURE_ENABLED`.

1. No sustituir el login de Next por `identity()` de ONE. Esa función, sin bearer, entra como `SUPER_ADMIN` de demostración. El IAM que sí corre en UNIFICADO (Argon2, TOTP, revocación, permisos) es la referencia interna, y solo entra cuando el flag de IAM exista. Hoy el ingreso sigue siendo el de la app.
2. Orquestador interno, en un PR aparte, detrás de `AI_ROUTER_ENABLED`. Del UNIFICADO: `auto`, `openai`, `xai`, `both`, precios de entorno, timeout, `trace_id`, tokens, coste, latencia y `fallback_used`, con `both` también persistido. Del ONE no se porta el modo sin `both` ni la identidad de demostración. `tenant_id` y `user_id` salen de la sesión. Claves `OPENAI_API_KEY` y `XAI_API_KEY` solo del entorno, leídas en el request.
3. Control Tower como páginas de admin con flag, con datos de esta base. No se publica `index.html` como segunda app ni se copian sus cifras fijas.
4. Marketplace y operaciones, cuando dejen de ser un eco en memoria. Alta real, no el `next: MATCHING` que no busca camión.
5. Cotizaciones, tracking, documentos, incidencias y finanzas, cada uno con su flag, recién cuando haya comportamiento y no solo un `CREATE TABLE`.
6. IoT y la cadena de hashes, cuando exista quien calcule `proof_hash` y `sha256`. Hoy son columnas.
7. Analytics, Guardian AI y Digital Twin al final. Analytics y Guardian están dibujados. Digital Twin no está en ninguno de los dos zip.
