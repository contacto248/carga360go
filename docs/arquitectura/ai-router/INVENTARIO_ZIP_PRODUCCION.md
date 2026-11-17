# Inventario exacto — CARGA360GO-UNIFICADO-FINAL.zip

| Campo | Valor |
| --- | --- |
| Zip vigente | `CARGA360GO-UNIFICADO-FINAL.zip` |
| SHA-256 verificado | `25e71f3837054c84839d9c01030e3ab27f0447b9a780d4570b1a2756ab837410` |
| Fecha dentro del zip | 2026-11-17 10:57 |
| Entradas | 16 (4 son directorios) |
| Bytes sumados | 18162 |
| Copia en el repo | `docs/arquitectura/ai-router/referencia/`, igual al zip, sin `__pycache__` (el zip no trae bytecode) |
| Este PR | Solo documentación. No porta el orquestador, no arranca FastAPI, Docker, PostgreSQL ni Nginx. |
| Release contrastada | `origin/release/2026-11-15` en `0ad534f28cbfb40fc0a26602c794fe0e3dda6755` |

Este zip reemplaza a `CARGA360GO-PRODUCTION-FINAL.zip` y a `Carga360GO_Dual_AI_Orchestrator.zip` donde se solapan. El inventario anterior de este archivo describía PRODUCTION-FINAL y decía que el modo `both` no se arrastraba. Eso queda corregido: **este zip sí trae modo `both` y coste configurable por entorno.**

No hay claves reales. `OPENAI_API_KEY` y `XAI_API_KEY` van vacíos. `POSTGRES_PASSWORD`, `DATABASE_URL` y `JWT_SECRET` del ejemplo son textos de reemplazo (`CAMBIA_UNA_CLAVE_LARGA`, `CAMBIA_POR_64_CARACTERES_ALEATORIOS`). El fuente, si faltan variables, usa otros placeholders (`cambia_esto`, `CAMBIAR_EN_PRODUCCION`). No son credenciales de Carga360GO y este PR no los carga en runtime.

## 1. Archivos

| Ruta en el zip | Bytes | Clase | Qué es |
| --- | ---: | --- | --- |
| `CARGA360GO-UNIFICADO-FINAL/` | 0 | — | Directorio raíz |
| `.env.example` | 401 | Implementado como plantilla | Variables. Claves de API vacías. Precios, modelos y timeout con valor |
| `Dockerfile` | 209 | Implementado, no se despliega | Python 3.12, uvicorn en el puerto 8000 |
| `GUIA-DESPLIEGUE.md` | 1419 | Solo descrito | Pasos de Compose, alta SQL del primer admin y prueba de `/v1/ai/orchestrate` |
| `INVENTARIO-REAL.md` | 1136 | Solo descrito | Nota de Gerencia sobre qué unificó. No es código |
| `README.md` | 699 | Solo descrito | Arranque y aviso de no guardar claves en Git |
| `app/` | 0 | — | Directorio |
| `app/main.py` | 10113 | Implementado, con huecos abajo | Único fuente. IAM, orquestador, `both`, coste |
| `db/` | 0 | — | Directorio |
| `db/schema.sql` | 2634 | Implementado en SQL Postgres, no aplicado a SQLite | Tablas, semilla de roles y permisos |
| `docker-compose.yml` | 806 | Implementado como archivo, no se ejecuta | Postgres 16, API y Nginx |
| `nginx/` | 0 | — | Directorio |
| `nginx/default.conf` | 303 | Implementado como archivo, no se ejecuta | Proxy al API y límite de 10 req/s |
| `requirements.txt` | 218 | Implementado como lista | Dependencias fijadas |
| `tests/` | 0 | — | Directorio |
| `tests/test_static.py` | 224 | Stub | Solo comprueba que cinco archivos existan |

No hay `__pycache__`, ni tests de login, ni de fallback, ni de `both`.

## 2. Endpoints y funciones de `app/main.py`

App: `FastAPI(title='Carga360GO Unificado', version='1.0.0')`.

| Ruta | Función | Estado |
| --- | --- | --- |
| `GET /health` | `health` | Implementado. `select 1` a Postgres. Responde `status` (`ok` o `degraded`), `database`, `openai_configured`, `xai_configured`. Sin auth |
| `POST /v1/auth/login` | `login` | Implementado. Formulario OAuth2 `username`/`password`. Argon2. Si `mfa_enabled`, devuelve un JWT de desafío (5 min, `purpose=mfa`), no la sesión |
| `POST /v1/auth/mfa/verify` | `verify_mfa` | Implementado. TOTP con `pyotp`, ventana 1. Emite el JWT de sesión con `mfa=true` |
| `POST /v1/auth/logout` | `logout` | Implementado. Inserta `jti` en `revoked_tokens` y audita `LOGOUT` |
| `GET /v1/me` | `me` | Implementado. Devuelve `sub`, `tenant_id`, `roles`, `permissions`, `mfa` del JWT |
| `POST /v1/ai/orchestrate` | `orchestrate` | Implementado. Exige permiso `ai.execute`. Modos `auto`, `openai`, `xai` y `both` |
| `GET /v1/admin/usage` | `usage` | Implementado. Exige `audit.read`. Suma tokens y `cost_usd` de `ai_usage` del tenant del JWT |

Funciones que no son rutas:

| Función | Estado |
| --- | --- |
| `audit` | Implementado. `INSERT` en `audit_logs` con `event`, `user_id`, `tenant_id` y `detail` jsonb |
| `token_for` | Implementado. JWT HS256 con `sub`, `tenant_id`, `roles`, `permissions`, `mfa`, `iat`, `exp`, `jti` |
| `current` | Implementado. Decodifica el bearer, rechaza `jti` revocado o usuario inactivo |
| `require` | Implementado. Deja pasar a `SUPER_ADMIN` o a quien tenga el permiso |
| `call_provider` | Implementado. POST a `{base}/responses` con `model`, `input`, `max_output_tokens` y `store: false` |
| `provider_order` | Implementado a medias. Ordena por suma de precios. Recibe `prompt` y no lo lee |

Modelo `Ask`: `prompt` (1 a 100000), `provider` (`auto` \| `openai` \| `xai` \| `both`, default `auto`), `max_output_tokens` (default 1200, entre 1 y 8000). No trae `tenant_id` ni `user_id`.

Modelo `UserCreate` (`email`, `password` mínimo 12, `tenant_id`, `role` default `USER`): **solo declarado**. No hay ruta que lo use. No existe alta de usuario por HTTP.

## 3. Orquestador: both, coste, fallback, timeout, traza

`call_provider` llama a `https://api.openai.com/v1/responses` o `https://api.x.ai/v1/responses`. El texto une las partes `type == output_text` con salto de línea. Calcula:

`estimated_cost_usd = input_tokens * precio_entrada / 1_000_000 + output_tokens * precio_salida / 1_000_000`

redondeado a 8 decimales. Los precios salen del entorno, no del código fijo de negocio:

| Variable | Default del fuente |
| --- | --- |
| `OPENAI_MODEL` | `gpt-5-mini` |
| `XAI_MODEL` | `grok-4.7` |
| `OPENAI_INPUT_USD_PER_M` | `0.25` |
| `OPENAI_OUTPUT_USD_PER_M` | `2.0` |
| `XAI_INPUT_USD_PER_M` | `2.0` |
| `XAI_OUTPUT_USD_PER_M` | `6.0` |
| `PROVIDER_TIMEOUT_SECONDS` | `120` (segundos, cliente httpx) |
| `ACCESS_TOKEN_MINUTES` | `30` |

Esos defaults están también en `.env.example`, salvo que las claves de API van vacías.

| `provider` | Qué hace el fuente |
| --- | --- |
| `both` | `asyncio.gather` de OpenAI y de xAI, siempre los dos. Devuelve `trace_id` y `results` con cada lado o `{"error": ...}`. **Sí está implementado** |
| `auto` | `provider_order`: solo proveedores con clave, del más barato al más caro (suma entrada+salida). Si empatan, queda OpenAI antes que xAI porque se inserta primero y el orden de Python es estable |
| `openai` o `xai` | Ese primero y el otro como fallback |

Si el intento falla, el siguiente sigue. `fallback_used` es true cuando responde un proveedor que no era el primero. El 502 final lleva `trace_id`, el texto `Todos los proveedores fallaron` y `errors` con el `str` de la excepción recortado a 500 caracteres. Una clave ausente lanza `RuntimeError` con el nombre del proveedor y la frase de clave no configurada. No incluye el valor de la clave.

`trace_id` es un UUID 4 por request de orquestación.

Registro, en el camino de un solo proveedor (no en `both`):

- Fila en `ai_usage`: `trace_id`, `user_id`, `tenant_id`, `provider`, `model`, `input_tokens`, `output_tokens`, `cost_usd`, `latency_ms` (solo esa llamada), `fallback_used`.
- `audit_logs` con evento `AI_SUCCESS` y detalle `trace_id`, `provider`, `fallback`.
- Un fallo audita `AI_PROVIDER_FAILURE` con `trace_id` y `provider`, sin el texto del error.

`latency_ms` es el tiempo de esa llamada al proveedor, no el del request entero.

Hueco de `both`: la respuesta HTTP sí trae usage, coste y latencia de cada lado que respondió, pero **no inserta `ai_usage`**. El audit de ese modo es `AI_BOTH` y el detalle solo guarda `trace_id`. No guarda proveedor, modelo, tokens, coste ni latencia.

`provider_order` ignora el texto del prompt. No hay política por palabras.

## 4. IAM del zip frente a `docs/arquitectura/IAM_V1.md`

La instrucción vive en `docs/arquitectura/IAM_V1.md`. Este inventario no la edita. El zip no es esa instrucción ni el login de Next.

| Tema | IAM v1 (documento) | Este zip | En Next hoy (`release/2026-11-15`) |
| --- | --- | --- | --- |
| Interruptor | `IAM_V2_ENABLED` apagado. Con el flag apagado el login actual no cambia. El documento no crea el flag | No conoce ese flag. Trae su propio login | El login sigue siendo correo, scrypt y cookie `c360_session`. 2FA por correo solo si `users.role = admin` |
| Tenant | Sale de la sesión. Un body o un header del navegador no lo elige. Hoy no hay `tenant_id` de sesión | En el orquestador sale del JWT, copiado de `users.tenant_id` al hacer login. `Ask` no tiene tenant. El modelo `UserCreate` sí trae `tenant_id`, pero no hay ruta | No hay `tenant_id`. Lo más cercano es `ops_organizations` (migración 22), y el documento dice que eso no es el tenant |
| Roles | 19: SUPER_ADMIN, TENANT_ADMIN, SECURITY_ADMIN, OPERATIONS_MANAGER, DISPATCHER, SALES_MANAGER, SALES_AGENT, DOCUMENT_CONTROLLER, FINANCE_MANAGER, TRACKING_OPERATOR, SUPPORT_AGENT, CUSTOMER_ADMIN, CUSTOMER_USER, CARRIER_ADMIN, CARRIER_OPERATOR, DRIVER, AUDITOR, AI_SERVICE, INTEGRATION_SERVICE | 4 sembrados: SUPER_ADMIN, TENANT_ADMIN, AI_USER, AUDITOR | `transportista`, `mandante`, `admin` en `users.role`. OPS añade `ops_role` |
| Permisos | Catálogo de envíos, cotización, tracking, documentos, facturas, `user.create`, `user.disable`, `role.assign`, `audit.read`, `ai.execute`, `approval.approve` | Cuatro nombres: `ai.execute`, `audit.read`, `user.manage`, `role.assign` | No hay esas tablas. OPS tiene permisos en memoria |
| Semilla | El documento no inserta roles | SUPER_ADMIN recibe los cuatro permisos. AI_USER solo `ai.execute`. TENANT_ADMIN los cuatro. **AUDITOR se inserta y no recibe ningún permiso** | — |
| MFA | Obligatorio para admin, reutilizando el 2FA por correo. TOTP del otro zip de IAM no reemplaza ese flujo mientras el flag esté apagado | TOTP opcional si `mfa_enabled` ya es true. El secreto queda en `users.mfa_secret` en claro. No hay ruta para activar MFA | 2FA admin por correo. No hay TOTP |
| Cadena | Usuario → Rol → Permisos → Scope → Policy Engine → API. ABAC de transportista, cliente y conductor | `require` mira rol SUPER_ADMIN o el nombre del permiso. No hay scope ni Policy Engine ni ABAC | `users.role`, `can()` de OPS y dueño del recurso |
| Agentes | Diez principales `AI_SERVICE`, flujo Bot → AI Gateway → Policy Engine → Tool/MCP → API → Data | No hay agentes, tools ni MCP | Agente comercial y de calidad, aparte |
| Approval Engine | Solicitud, MFA, alguien con `approval.approve` que no sea quien pidió | No hay tabla ni ruta | No hay motor IAM. La confirmación de asignación OPS es otra cosa |
| Auditoría | Append-only con identidad, organización, acción, recurso, resultado, IP, user-agent y traza. Eventos `AUTH_SUCCESS`, `AUTH_FAILURE`, `MFA_ENABLED`, `MFA_DISABLED`, `PASSWORD_CHANGED`, `SESSION_REVOKED`, `ROLE_ASSIGNED`, `ROLE_REMOVED`, `PERMISSION_DENIED`, `AI_ACTION_REQUESTED`, `AI_ACTION_APPROVED`, `AI_ACTION_REJECTED`, `AI_TOOL_EXECUTED` | Hay `INSERT` en `audit_logs`. No hay trigger que impida UPDATE/DELETE. No guarda IP ni user-agent. Eventos que el fuente sí escribe: `AUTH_FAILURE` (solo hash SHA-256 del correo), `AUTH_SUCCESS`, `MFA_FAILURE`, `MFA_SUCCESS`, `LOGOUT`, `AI_BOTH`, `AI_SUCCESS`, `AI_PROVIDER_FAILURE`. Un 403 de `require` no audita `PERMISSION_DENIED` | `audit_log` (migración 6), insert desde `src/lib/audit.ts`, otros nombres de acción |

El zip tampoco trae OIDC, recuperación de contraseña, verificación de correo, cierre de todas las sesiones ni refresh token.

## 5. Esquema Postgres y migraciones 031+

`db/schema.sql` crea, en PostgreSQL: `tenants`, `users` (email `citext`, hash, `mfa_secret`), `roles`, `permissions`, `user_roles`, `role_permissions`, `revoked_tokens`, `audit_logs`, `ai_usage`. Activa `pgcrypto`. Inserta los permisos y roles de la tabla de arriba.

Huecos del propio SQL:

- Usa `citext` y no ejecuta `CREATE EXTENSION citext`. Solo crea `pgcrypto`.
- `ai_usage` no tiene llave foránea a `users` ni a `tenants`.
- No es append-only: no hay trigger contra UPDATE/DELETE.
- El rol `AUDITOR` queda sin filas en `role_permissions`.

En `origin/release/2026-11-15` (`0ad534f`) las migraciones de `docs/migrations/` llegan a **030** (`030-ops-operacion.sql` y su rollback). **No hay migración 031 ni ninguna posterior.** `IAM_V1.md` no agrega SQL y dice que el 030 es de la operación, no de IAM. `src/lib/db.ts` aplica hasta la 30 con `hasMigration`. Este PR no añade número ni toca `db.ts`.

La app Next sigue en SQLite. Este zip no se aplica a esa base.

## 6. Dependencias y proceso

`requirements.txt`:

| Paquete | Versión |
| --- | --- |
| fastapi | 0.115.6 |
| uvicorn[standard] | 0.34.0 |
| httpx | 0.28.1 |
| SQLAlchemy | 2.0.36 |
| psycopg[binary] | 3.2.3 |
| PyJWT | 2.10.1 |
| passlib[argon2] | 1.7.4 |
| argon2-cffi | 23.1.0 |
| pyotp | 2.9.0 |
| python-multipart | 0.0.20 |
| pydantic[email] | 2.10.4 |

`Dockerfile`: `python:3.12-slim`, pip sin caché, copia `app/`, `uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers`. No declara `EXPOSE`.

`docker-compose.yml`: servicio `db` (`postgres:16-alpine`) con el SQL en `docker-entrypoint-initdb.d`, servicio `api` que espera a que Postgres esté sano y no publica el 8000, servicio `nginx` (`nginx:1.27-alpine`) publicando `80:80`. Volumen `pgdata`.

`nginx/default.conf`: escucha 80, cuerpo máximo 2m, `limit_req` 10 req/s con ráfaga 20, proxy a `api:8000`. No hay TLS.

`tests/test_static.py` afirma que existan `app/main.py`, `db/schema.sql`, `docker-compose.yml`, `.env.example` y `GUIA-DESPLIEGUE.md`. No llama a la red ni al orquestador.

`INVENTARIO-REAL.md` dice que unificó PRODUCTION-FINAL, el orquestador dual y el IAM, y lista both, coste, fallback y `trace_id`. Esa nota es correcta en el camino de un proveedor. No dice que `both` no persiste `ai_usage`.

## 7. Qué se porta a Next.js / SQLite

**No en este PR.** El porte va en un PR aparte, después de este inventario. No se abre aquí.

Cuando se porte, entra en este Next.js. No queda un segundo proceso FastAPI ni Compose de producción.

Se porta el comportamiento del orquestador de este zip:

- `POST` equivalente a `/v1/ai/orchestrate` con `auto`, `openai`, `xai` y **`both`**.
- `auto` elige por la suma de precios de entorno y, si falla, cae al otro proveedor configurado.
- Forzar un proveedor también cae al otro.
- `both` consulta los dos y devuelve los dos resultados o el error de cada lado.
- Timeout `PROVIDER_TIMEOUT_SECONDS` (default 120).
- Modelos `OPENAI_MODEL` (default `gpt-5-mini`) y `XAI_MODEL` (default `grok-4.7`).
- Coste con `OPENAI_INPUT_USD_PER_M`, `OPENAI_OUTPUT_USD_PER_M`, `XAI_INPUT_USD_PER_M`, `XAI_OUTPUT_USD_PER_M`.
- `trace_id`, proveedor, modelo, tokens de entrada y salida, coste estimado, latencia y `fallback_used`.
- Flag `AI_ROUTER_ENABLED` apagado salvo el texto exacto `true`. Apagado, la ruta responde 404 JSON.
- `OPENAI_API_KEY` y `XAI_API_KEY` solo del entorno de runtime, leídas en el request. Vacías en `.env.example` de Next. Nunca en código, tests ni logs.
- `tenant_id` y `user_id` de la sesión de Carga360GO. No del cuerpo ni de un header que mande el navegador. Hoy la sesión no tiene tenant: `user_id` será el id de sesión y `tenant_id` quedará vacío hasta que la sesión lo traiga.
- La bitácora de uso, en SQLite, aditiva, con rollback, en el siguiente número libre. La 030 ya es la operación. No hay 031 en esta release. Ese SQL no se escribe en este PR.

No se porta desde este zip, ni ahora ni como sustituto del login:

- Argon2, JWT, TOTP, `revoked_tokens` y el catálogo corto de roles. El login sigue el de `IAM_V1.md` mientras `IAM_V2_ENABLED` no exista.
- Postgres, Nginx, Docker y el puerto 80.
- `UserCreate` y cualquier tenant elegido en el body.
- Bots, tools MCP, function calling y Approval Engine: este zip no los trae.

El maestro `OPS_FEATURE_ENABLED` no envuelve al orquestador. En este repo solo condiciona los flags hijos de `src/lib/ops/flags.ts`. El interruptor del porte es `AI_ROUTER_ENABLED`.
