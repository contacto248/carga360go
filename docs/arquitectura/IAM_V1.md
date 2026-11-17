# IAM v1 — Instrucción de Gerencia

| Campo | Valor |
| --- | --- |
| Fecha de la instrucción | 17-11-2026, 07:32 (hora de Chile) |
| Idioma | Español |
| Base de este documento | `release/2026-11-15` en el merge del PR #51 (`3cac81f`, blueprint v1.0) |
| Naturaleza | Solo documentación. No cambia `src/`, tests, migraciones, flags ni el login. |
| Referencia adjunta | `docs/arquitectura/iam-v1/referencia/` (copia byte a byte del zip de Gerencia). No se cablea al Next.js. |
| Interruptor futuro | `IAM_V2_ENABLED`, apagado por defecto. Este documento no lo crea en el código. Con el flag apagado, o ausente, el login actual queda idéntico. |

El blueprint de arquitectura ya está en `docs/arquitectura/blueprint-v1.0/` (PR #51). Este archivo es la instrucción de identidad y acceso. El módulo de referencia no sustituye esa instrucción ni el login de producción.

## Texto íntegro de la instrucción (17-11-2026 07:32)

1. Autenticación: email/usuario + contraseña; MFA obligatorio para administradores y operaciones sensibles (reutilizar el 2FA admin existente); recuperación segura de contraseña; verificación de correo (envío real solo vía interfaz/modo simulado hasta autorización); throttling/bloqueo ante intentos repetidos; sesiones revocables por dispositivo; cierre global de sesiones; reautenticación para operaciones críticas; OIDC/SSO empresarial preparado como interfaz, sin activar; registro de login, logout, fallos y cambios de seguridad.

2. Autorización RBAC + ABAC. Roles: SUPER_ADMIN, TENANT_ADMIN, SECURITY_ADMIN, OPERATIONS_MANAGER, DISPATCHER, SALES_MANAGER, SALES_AGENT, DOCUMENT_CONTROLLER, FINANCE_MANAGER, TRACKING_OPERATOR, SUPPORT_AGENT, CUSTOMER_ADMIN, CUSTOMER_USER, CARRIER_ADMIN, CARRIER_OPERATOR, DRIVER, AUDITOR, AI_SERVICE, INTEGRATION_SERVICE. ABAC: CARRIER_OPERATOR solo viajes de su transportista; CUSTOMER_USER solo cargas de su organización; DRIVER solo viajes asignados. Mapear roles actuales (admin y los que existan) sin perder accesos.

3. Permisos: shipment.read/create/update/cancel, quote.read/create/approve, carrier.assign, tracking.read/update, document.upload/validate, incident.create/resolve, invoice.read/approve, user.create/disable, role.assign, audit.read, ai.execute, approval.approve. Cadena Usuario → Rol → Permisos → Scope → Policy Engine → API. Nunca frontend → DB. Controles en backend.

4. Multiempresa: tenant_id en entidades sensibles; el tenant sale de la sesión, nunca de un parámetro del navegador.

5. Identidades de servicio de los 10 agentes (C360-MASTER, SALES, OPS, DISPATCH, TRACK, GUARDIAN, DOC, CUSTOMER, CARRIER, ANALYST), permisos mínimos, nunca SUPER_ADMIN. Flujo Bot → AI Gateway → Policy Engine → Tool/MCP → API → Data. Nunca Bot → DB.

6. Approval Engine: IA solicita → Policy Engine → aprobación → usuario autorizado + MFA/reautenticación → ejecución → auditoría. Cubre cotización excepcional, reasignación crítica, cambios financieros, permisos, revocación administrativa y acciones IA de alto impacto.

7. Auditoría append-only: identidad, organización, acción, recurso, resultado y contexto técnico. Eventos AUTH_SUCCESS, AUTH_FAILURE, MFA_ENABLED, MFA_DISABLED, PASSWORD_CHANGED, SESSION_REVOKED, ROLE_ASSIGNED, ROLE_REMOVED, PERMISSION_DENIED, AI_ACTION_REQUESTED, AI_ACTION_APPROVED, AI_ACTION_REJECTED, AI_TOOL_EXECUTED.

Reglas: flag `IAM_V2_ENABLED` apagado por defecto; con flag apagado el login actual queda idéntico; migraciones aditivas con rollback; CDN/WAF, API Gateway separado, PostgreSQL y Redis quedan como arquitectura objetivo, no se migran ahora. Sin secretos, sin pagos, sin DNS, sin credenciales, sin `.env`.

Gerencia adjuntó después el módulo de referencia (`app.py`, `schema.sql`, `Dockerfile`, `docker-compose.yml`, `requirements.txt`, `README.md`, `.env.example`). Va tal cual bajo `docs/arquitectura/iam-v1/referencia/`. No se ejecuta, no se importa desde la app Next y no cambia el login.

## Reglas de este documento

- `IAM_V2_ENABLED` permanece apagado. Mientras esté apagado, el ingreso sigue siendo el de hoy: cookie `c360_session`, contraseña con scrypt, y el segundo factor por correo solo para `users.role = admin`.
- Las migraciones de IAM, cuando Gerencia las autorice en otro PR, son aditivas y llevan script de rollback. No reescriben las migraciones 001–029. No reservan el número 030: ese número queda para el stream de la operación 360. Este archivo no trae SQL.
- CDN/WAF, API Gateway separado del BFF Next, PostgreSQL y Redis son arquitectura objetivo. Hoy la app es Next.js con SQLite (`better-sqlite3` en `src/lib/db.ts`). No se migran en este documento.
- Sin secretos, sin pagos, sin DNS, sin credenciales y sin `.env` de entorno. El único ejemplo de variables es el `.env.example` de la referencia, y solo contiene placeholders.

## 1. Autenticación

Identificador: correo (el usuario entra con email). Contraseña verificada en el servidor.

MFA obligatorio para administradores y para operaciones sensibles. Se reutiliza el 2FA admin que ya existe (`src/lib/admin-2fa.ts`): código de 6 dígitos por correo, 10 minutos, 5 intentos, como máximo 5 códigos cada 15 minutos, cookie de desafío `c360_2fa` y dispositivo de confianza `c360_td` por 30 días. La sesión de administrador solo vale si `sessions.mfa_at` está marcado (`src/lib/auth.ts`, `userFromToken`). El TOTP del módulo de referencia no reemplaza ese flujo mientras el flag esté apagado.

Recuperación de contraseña: la que ya está en `requestPasswordReset` / `resetPassword` (`src/lib/auth.ts`). El enlace guarda solo el hash del token, vence en 1 hora, es de un uso, y al usarse cierra todas las sesiones y los dispositivos de confianza de esa cuenta. La respuesta no dice si el correo existe. Límites en `src/app/api/auth/recuperar/route.ts` y `src/app/api/auth/restablecer/route.ts`.

Verificación de correo: el envío real pasa solo por la interfaz `sendEmail` (`src/lib/notify.ts`, usada desde `src/lib/verification.ts`). Hasta una autorización escrita de Gerencia, el modo es el simulado: si el canal de correo no está listo, el mensaje queda en el outbox y la función responde `no_configurado`. Este documento no autoriza envío real ni cambia esa interfaz.

Throttling y bloqueo ante intentos repetidos, ya presentes y que se conservan:

- Por IP: 10 intentos de ingreso cada 10 minutos (`LOGIN_LIMIT` en `src/lib/rate-limit.ts`, rutas `src/app/api/auth/ingreso/route.ts` y el ingreso móvil).
- Por cuenta: 8 fallos seguidos bloquean 15 minutos (`LOCK_AFTER` / `LOCK_MS` en `src/lib/auth.ts`) y se audita `usuario.bloqueo_login`.
- Código admin: límites de `src/lib/admin-2fa.ts`.
- Redis, como almacén distribuido de esos contadores, es objetivo. Hoy el límite vive en el proceso.

Sesiones revocables por dispositivo: objetivo. Hoy la sesión es una fila en `sessions` (hash del token, vencimiento a 14 días, `mfa_at`). `revokeToken` borra esa fila. El user-agent vive en `trusted_devices` (solo la confianza del 2FA admin), no en cada sesión. El cierre por dispositivo, con inventario, queda para cuando el flag se encienda.

Cierre global de sesiones: hoy ocurre al restablecer la contraseña (borra `sessions` y `trusted_devices` de esa cuenta). El objetivo añade un cierre global explícito, auditado, sin esperar al restablecimiento.

Reautenticación para operaciones críticas: el administrador ya pasa el 2FA al ingresar. El objetivo exige un paso nuevo de ese mismo 2FA antes de cotización excepcional, reasignación crítica, cambios financieros, cambio de permisos, revocación administrativa y acciones de IA de alto impacto.

OIDC/SSO empresarial: se prepara como interfaz (un puerto de proveedor) y no se activa. No hay IdP, no hay cliente y no hay secretos. Con el flag apagado esa interfaz no se consulta: el login sigue siendo correo y contraseña.

Registro: login, logout, fallos y cambios de seguridad se escriben en auditoría (sección 7).

## 2. Autorización RBAC + ABAC

Catálogo de roles de la instrucción: SUPER_ADMIN, TENANT_ADMIN, SECURITY_ADMIN, OPERATIONS_MANAGER, DISPATCHER, SALES_MANAGER, SALES_AGENT, DOCUMENT_CONTROLLER, FINANCE_MANAGER, TRACKING_OPERATOR, SUPPORT_AGENT, CUSTOMER_ADMIN, CUSTOMER_USER, CARRIER_ADMIN, CARRIER_OPERATOR, DRIVER, AUDITOR, AI_SERVICE, INTEGRATION_SERVICE.

ABAC, además del rol:

- CARRIER_OPERATOR solo ve y opera viajes de su transportista.
- CUSTOMER_USER solo ve y opera cargas de su organización.
- DRIVER solo ve y opera viajes que le están asignados.

Esos tres alcances se evalúan en el backend con datos de la sesión (usuario, rol, organización). Un parámetro del navegador no amplía el alcance.

### Mapa de roles actuales, sin perder accesos

El rol de plataforma hoy es una columna, no una tabla de roles. `src/lib/types.ts` declara `ROLES = ["transportista", "mandante", "admin"]` y `schemaV1` en `src/lib/db.ts` lo exige con `CHECK`. El módulo OPS añade otro eje en `ops_org_members.ops_role` (`src/lib/ops/permissions.ts`): `org_admin`, `procurement`, `trafico`, `finanzas`, `auditor`, `lectura`. `can()` deja pasar todo al `admin` de plataforma. Una cuenta sin fila en `ops_org_members` no gana permisos OPS.

Al encender el flag en un PR futuro, el mapa conserva el piso de lo que cada cuenta ya puede hacer. Un rol del catálogo nuevo que sea más amplio no se concede solo: hace falta `role.assign` explícito.

| Hoy | Dónde | Rol IAM que conserva el piso | Qué no se concede solo |
| --- | --- | --- | --- |
| `admin` | `users.role` | SUPER_ADMIN | SECURITY_ADMIN no parte ni reduce al admin actual. El admin sigue entrando con el 2FA por correo y sigue pudiendo todo lo que `can()` y los paneles le permiten hoy. |
| `mandante` | `users.role` | CUSTOMER_ADMIN de su propia cuenta | No se degrada a CUSTOMER_USER. CUSTOMER_USER es un asiento futuro, más estrecho, para otra persona de la misma organización. |
| `transportista` | `users.role` | CARRIER_ADMIN de su propia cuenta | No se degrada a CARRIER_OPERATOR ni a DRIVER. Esos dos son asientos futuros. |
| `org_admin` | `ops_org_members.ops_role` | TENANT_ADMIN dentro de esa organización | Sigue por debajo del admin de plataforma. Conserva los siete permisos OPS actuales: tarifas ver/editar, asignación ver/ejecutar, reglas editar, desempeño ver, miembros editar. |
| `procurement` | idem | Piso propio: `tarifas.ver`, `tarifas.editar`, `asignacion.ver` | No hereda `quote.approve` ni `carrier.assign` por parecerse a SALES_MANAGER. |
| `trafico` | idem | DISPATCHER con piso `asignacion.ver`, `asignacion.ejecutar`, `desempeno.ver` | No hereda `shipment.cancel` ni facturas. |
| `finanzas` | idem | Piso `tarifas.ver` | No se promueve a FINANCE_MANAGER. `invoice.approve` queda fuera hasta un `role.assign`. |
| `auditor` (OPS) | idem | AUDITOR con piso de lectura: tarifas, asignación y desempeño | `audit.read` del catálogo nuevo no se abre solo. |
| `lectura` | idem | Piso `tarifas.ver` y `asignacion.ver` | No hay rol homónimo en el catálogo. No se promueve a OPERATIONS_MANAGER. |

`users.role` sigue siendo la fuente del login mientras el flag esté apagado. El catálogo de 19 roles no reemplaza ese `CHECK` en este documento.

## 3. Permisos y cadena de control

Permisos de la instrucción:

`shipment.read`, `shipment.create`, `shipment.update`, `shipment.cancel`, `quote.read`, `quote.create`, `quote.approve`, `carrier.assign`, `tracking.read`, `tracking.update`, `document.upload`, `document.validate`, `incident.create`, `incident.resolve`, `invoice.read`, `invoice.approve`, `user.create`, `user.disable`, `role.assign`, `audit.read`, `ai.execute`, `approval.approve`.

Cadena obligatoria:

`Usuario → Rol → Permisos → Scope → Policy Engine → API`

El navegador no consulta la base. Cada control de permiso y de alcance vive en el backend, en la API, antes de leer o escribir datos. El Policy Engine es el punto único que junta rol, permiso y scope ABAC. Hoy ese motor no existe: el control está repartido entre `users.role`, `can()` de OPS y comprobaciones de dueño (`owner_id`, `carrier_id`) en los módulos de cargas, ofertas y viajes.

Los permisos OPS actuales (`tarifas.*`, `asignacion.*`, `reglas.editar`, `desempeno.ver`, `miembros.editar`) siguen vigentes con el flag apagado. No se renombran en este documento.

## 4. Multiempresa

Las entidades sensibles llevan `tenant_id`. El tenant se lee de la sesión autenticada. Un query, un body o una cabecera enviada por el navegador no elige el tenant.

Hoy no hay `tenant_id` de sesión. Lo más cercano es `ops_organizations` (migración 22, `MIGRATION_22_SQL` en `src/lib/db.ts`): organizaciones de kind `mandante`, `transportista` o `plataforma`, con miembros en `ops_org_members`. El dueño de una carga sigue siendo `loads.owner_id`. Eso no es el tenant de la instrucción y no se migra aquí.

## 5. Identidades de servicio de los 10 agentes

Cada agente es un principal `AI_SERVICE`, con permisos mínimos, y nunca SUPER_ADMIN. Ninguno abre la base por su cuenta.

Flujo obligatorio:

`Bot → AI Gateway → Policy Engine → Tool/MCP → API → Data`

| Agente | Permisos mínimos | Queda fuera |
| --- | --- | --- |
| C360-MASTER | `ai.execute` y solicitar aprobación | Aprobar sus propias acciones. `approval.approve`. SUPER_ADMIN. |
| SALES | `quote.read`, `quote.create`, `shipment.read` en el tenant de la conversación | `quote.approve` directo. Facturas. |
| OPS | `shipment.read`, `shipment.create`, `shipment.update` | `shipment.cancel` directo: pasa por Approval Engine. |
| DISPATCH | `shipment.read`, `tracking.read`, proponer `carrier.assign` | Reasignación crítica sin aprobación humana. |
| TRACK | `tracking.read`, `tracking.update`, `incident.create` | Resolver incidencias ajenas al viaje. |
| GUARDIAN | `audit.read`, `incident.create` | `role.assign`, `user.disable` directo. |
| DOC | `document.upload`, proponer `document.validate` | Validación excepcional sin aprobación. |
| CUSTOMER | `shipment.read`, `quote.read`, `incident.create` en la organización del cliente | Datos de otra organización. |
| CARRIER | `shipment.read`, `tracking.read`, `tracking.update`, `document.upload` del transportista | `carrier.assign`. Viajes de otro transportista. |
| ANALYST | Lectura: `shipment.read`, `tracking.read`, `quote.read`, `invoice.read` | Escrituras de negocio y `approval.approve`. |

`INTEGRATION_SERVICE` es el principal de clientes de API, distinto de estos diez agentes, también sin SUPER_ADMIN.

Hoy no existen estas identidades. El agente comercial y el agente de calidad escriben auditoría (`agente.*`, `bassam.agente` en `src/lib/audit.ts`) con la sesión de un usuario o de administración. El contrato MCP del blueprint está en `docs/arquitectura/blueprint-v1.0/plataforma/mcp/tool-contract.json` y no se cablea desde este documento.

## 6. Approval Engine

Flujo:

`IA solicita → Policy Engine → aprobación → usuario autorizado + MFA/reautenticación → ejecución → auditoría`

Cubre: cotización excepcional, reasignación crítica, cambios financieros, permisos (`role.assign`, alta y baja de roles), revocación administrativa de sesiones y acciones de IA de alto impacto.

Estados de la solicitud: pendiente, aprobada, rechazada, vencida, ejecutada. Quien solicita no se aprueba a sí mismo. La ejecución ocurre solo después de la decisión de un usuario que tiene `approval.approve` y que acaba de pasar el 2FA admin (o el mismo desafío, cuando el rol sensible no es admin).

Hoy no hay tabla ni API de aprobaciones IAM. Lo más cercano en operaciones es la confirmación humana de una propuesta de asignación (`ops.asignacion_confirmada` en `src/lib/audit.ts`, rutas bajo `src/app/api/ops/asignacion/`). Eso sigue siendo del módulo OPS y no es este motor.

## 7. Auditoría append-only

Cada evento guarda, completos: identidad, organización, acción, recurso, resultado y contexto técnico (como mínimo IP, user-agent y un id de traza). La bitácora solo acepta inserciones. No se actualiza ni se borra una fila para corregir el pasado; una corrección es otro evento.

Eventos de la instrucción:

`AUTH_SUCCESS`, `AUTH_FAILURE`, `MFA_ENABLED`, `MFA_DISABLED`, `PASSWORD_CHANGED`, `SESSION_REVOKED`, `ROLE_ASSIGNED`, `ROLE_REMOVED`, `PERMISSION_DENIED`, `AI_ACTION_REQUESTED`, `AI_ACTION_APPROVED`, `AI_ACTION_REJECTED`, `AI_TOOL_EXECUTED`.

Hoy `writeAudit` en `src/lib/audit.ts` solo hace `INSERT` en `audit_log` (migración 6 de `src/lib/db.ts`): `actor_id`, `actor_email`, `action`, `target_type`, `target_id`, `detail` recortado a 1000 caracteres, `ip`, `created_at`. No guarda organización, resultado ni user-agent, y los nombres de acción son otros (`usuario.bloqueo_login`, `usuario.clave_restablecida`, `admin.2fa_ok`, `admin.2fa_fallido`, `admin.2fa_codigo_enviado`). La página `src/app/admin/auditoria/page.tsx` lista esos registros para `role = admin`. Esos eventos actuales se conservan. Los nombres nuevos se añaden cuando el flag exista, sin borrar el historial.

## Módulo de referencia

Copia íntegra, sin editar, en `docs/arquitectura/iam-v1/referencia/`:

| Archivo | Qué es |
| --- | --- |
| `app.py` | FastAPI de ejemplo: login, refresh, logout, logout-all, TOTP, `/me`, asignar rol, listar auditoría. |
| `schema.sql` | PostgreSQL: tenants, users, 19 roles, permisos, sesiones, MFA recovery, `audit_logs`, `approval_requests`. |
| `Dockerfile` | Imagen Python 3.12 que arranca uvicorn en `0.0.0.0:8000`. |
| `docker-compose.yml` | Postgres 16 y esa API, para quien ejecute la referencia aparte. |
| `requirements.txt` | Dependencias del ejemplo. |
| `README.md` | Cómo lo describe Gerencia. |
| `.env.example` | Solo placeholders. |

`.env.example` no tiene secretos. Las tres marcas son placeholders: `change-me-now`, `GENERATE_A_LONG_RANDOM_SECRET`, `GENERATE_WITH_PYTHON_FERNET`. No hay `.env`.

El mismo tipo de marca, también placeholder y no una credencial real, viene dentro del zip y se conservó tal cual en `docker-compose.yml` (`change-me-now`, `CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_BEFORE_PRODUCTION`, `CHANGE_THIS_TO_FERNET_KEY`) y como valor por defecto de desarrollo en `app.py` (`change-me-now`, `dev-only-change-me`). No se sustituyeron y no se usan en el despliegue de Carga360go.

La referencia no implementa sola toda la instrucción. `schema.sql` crea `approval_requests` y no tiene flujo de ejecución. `app.py` aplica RBAC con `require_perm` y no aplica las tres reglas ABAC, no define los 10 agentes, no ofrece OIDC, no verifica el correo y no conoce `IAM_V2_ENABLED`. Los roles `TENANT_ADMIN`, `SUPPORT_AGENT` e `INTEGRATION_SERVICE` se insertan en `roles` y el script no les asigna filas en `role_permissions`. El README de la referencia lo dice: cada servicio de dominio aplica permisos y, además, tenant y pertenencia del recurso.

Esa carpeta no entra al build de Next, no se importa desde `src/` y no se despliega.

## Brechas IAM: `schema.sql` y `app.py` frente al Next.js actual

Comparación hecha sobre `release/2026-11-15` en `3cac81f`. “Existe” significa que el Next.js ya tiene esa capacidad, aunque con otro nombre o otra forma. “No existe” significa que no hay equivalente en la app.

### Objetos de `schema.sql`

| Objeto de la referencia | En el Next.js | Dónde | Qué falta respecto de la referencia |
| --- | --- | --- | --- |
| Extensiones `pgcrypto` y `citext`; tipos enum `user_status`, `principal_type`, `session_state`, `approval_state` | No | Motor SQLite en `src/lib/db.ts` | No hay PostgreSQL en la app. Esos tipos no existen. |
| `tenants` | No como tenant de sesión | `ops_organizations` en `MIGRATION_22_SQL` (`src/lib/db.ts`), kind `mandante` / `transportista` / `plataforma` | No hay `tenant_id` leído de la sesión. La organización OPS no sustituye a `tenants`. |
| `users` | Sí, parcial | `schemaV1` y columnas posteriores en `src/lib/db.ts` (`email_verified_at` entre ellas) | Hay email único, `password_hash` (scrypt, no Argon2), `login_failures`, `locked_until`, `verification_status`. No hay `tenant_id`, `principal`, `mfa_required`, `mfa_enabled`, `mfa_secret_enc` ni `token_version`. El rol es un `CHECK` de tres valores, no un catálogo. |
| `roles`, `permissions`, `role_permissions`, `user_roles` | No | Rol en `users.role` (`src/lib/types.ts`). Permisos OPS en memoria: `OPS_ROLES`, `OPS_PERMISSIONS`, `PERMISSIONS` y `can()` en `src/lib/ops/permissions.ts` | No hay tablas de RBAC ni los códigos `shipment.*` / `quote.*` / `role.assign`. |
| Semilla de 19 roles y de permisos | No | Los tres roles de plataforma y los seis `ops_role` citados arriba | Ningún código del `INSERT` de `schema.sql` existe como valor almacenado. |
| `sessions` | Sí, otra forma | `schemaV1` más columna `mfa_at` (migración 10, `src/lib/db.ts`) | Hash del token de sesión, vencimiento y `mfa_at`. No hay `refresh_hash`, estado `REVOKED` (la fila se borra), `ip`, `user_agent` ni `revoke_reason` en la sesión. |
| `mfa_recovery_codes` | No | El 2FA admin no entrega códigos de recuperación TOTP | Tabla ausente. |
| `audit_logs` | Parcial: `audit_log` | Migración 6 en `src/lib/db.ts`. Escritura en `src/lib/audit.ts` | Insert-only en la aplicación. Columnas: actor, acción, target, `detail` (máximo 1000), ip, fecha. Sin `tenant_id`, `result`, `user_agent`, `trace_id` ni `metadata` jsonb. |
| `approval_requests` | No | Confirmación de asignación OPS, otro modelo (`src/lib/ops/allocation.ts`, rutas `src/app/api/ops/asignacion/`) | No hay solicitud IAM con estados PENDING / APPROVED / REJECTED / EXPIRED. |

### Endpoints y comportamiento de `app.py`

| Pieza de `app.py` | En el Next.js | Dónde | Qué no está |
| --- | --- | --- | --- |
| `GET /health` → `{status: ok}` | Hay salud, otro contrato | `src/app/api/health/route.ts` y `src/app/api/salud/route.ts`, implementación `health` en `src/lib/mobile.ts` | Responde `{ok, database, documents, auth, commit}` y abre SQLite. No es el health de FastAPI. |
| `POST /auth/login` (correo, contraseña, OTP TOTP, JWT de acceso y refresh) | Hay ingreso con correo y contraseña | `src/app/api/auth/ingreso/route.ts`, `src/app/api/auth/login/route.ts`, `loginUser` / `verifyCredentials` en `src/lib/auth.ts` | Cookie `c360_session` (el móvil reutiliza el mismo token como Bearer opaco, `src/lib/current-user.ts`). No hay JWT HS256 ni refresh de sesión. Si el rol es `admin`, `loginUser` responde 403 `requiere_2fa` y el código sigue en `src/app/api/auth/ingreso/codigo/route.ts`. |
| Bloqueo por fallos (`failed_login_count >= 4`, 15 minutos) | Sí, otro umbral | `src/lib/auth.ts`: 8 fallos, 15 minutos, más el límite por IP | No es el contador de 5 de la referencia. |
| `POST /auth/refresh` (rota el refresh y emite otro access token) | No para identidad | — | No existe refresh de sesión IAM. La renovación de tokens de Mercado Pago (`src/lib/pagos/`) es de pagos y queda fuera de este documento. |
| `POST /auth/logout` (marca la sesión `REVOKED`) | Hay cierre de la sesión actual | Web: `src/app/api/auth/salir/route.ts` → `clearSessionCookie` en `src/lib/current-user.ts`. Móvil: `src/app/api/auth/logout/route.ts` → `logout` en `src/lib/mobile.ts`. Ambos llaman `revokeToken`, que hace `DELETE` de esa fila (`src/lib/auth.ts`) | No hay estado `REVOKED` ni `revoke_reason`. |
| `POST /auth/logout-all` (revoca todas las sesiones y sube `token_version`) | No como endpoint | `resetPassword` en `src/lib/auth.ts` borra todas las `sessions` y `trusted_devices` de esa cuenta al cambiar la clave | No hay cierre global a voluntad ni `token_version`. |
| `POST /auth/mfa/setup` y `POST /auth/mfa/enable` (TOTP, secreto cifrado con Fernet) | No | 2FA admin por correo: `startAdminChallenge` y `verifyAdminChallenge` en `src/lib/admin-2fa.ts`. Desafíos en `login_challenges`, confianza en `trusted_devices` (migración 10) | No hay secreto TOTP, no hay `otpauth`, no hay activar/desactivar MFA. Para el admin el segundo factor es obligatorio, no opcional. |
| `GET /me` (user, tenant, roles[], permissions[], mfa) | Hay perfil de la sesión, otro contrato | `src/app/api/me/route.ts` → `me` en `src/lib/mobile.ts` (`profileOf`, `gateOf`) | No devuelve el catálogo de 19 roles ni los permisos de `schema.sql`. No devuelve `tenant_id`. |
| `require_perm` (JOIN `user_roles` → `role_permissions` → `permissions`) | No | Autorización actual: `user.role`, `can()` en `src/lib/ops/permissions.ts`, y dueño del recurso en cargas, ofertas y viajes | No hay Policy Engine ni scope ABAC de CARRIER_OPERATOR / CUSTOMER_USER / DRIVER. |
| `POST /admin/roles/assign` (permiso `role.assign` y claim `mfa`) | No | Miembros OPS: `src/app/api/ops/organizaciones/[id]/miembros/route.ts` y `src/lib/ops/organizations.ts`. Cuentas de plataforma: rutas `src/app/api/admin/usuarios/`. `src/app/api/admin/identidad/` es revisión de identidad/KYC, no asignación de roles IAM | No exige `role.assign` ni un MFA de step-up. |
| `GET /admin/audit` (JSON de `audit_logs`, tope 500) | Parcial, como página | `src/app/admin/auditoria/page.tsx` llama `listAudit` (`src/lib/audit.ts`) y solo si `role = admin` | No es la API JSON de la referencia. No filtra por tenant. No expone `trace_id` ni `metadata`. |
| Cookie de refresh `HttpOnly`, `SameSite=strict`, path `/auth` | Hay cookie de sesión `HttpOnly` | `COOKIE_NAME = c360_session` y `cookieOptions` en `src/lib/auth.ts` | Es la sesión única, no un refresh separado. |
| Tenant dentro del JWT (`tenant`) | No | La sesión no lleva tenant | La referencia pone el tenant en el token; la instrucción exige que salga de la sesión y no de un parámetro del navegador. El Next.js todavía no tiene ese campo. |
| Argon2 (`pwdlib`), PyJWT, pyotp, Fernet | No en el login | Hash scrypt en `src/lib/auth.ts` | Esas librerías no forman parte de la app Next. Este PR no las agrega. |

### Qué de la instrucción tampoco está en la referencia ni en el Next.js

Queda escrito para no tomar el zip como implementación cerrada:

- Interfaz OIDC/SSO sin activar.
- Las tres reglas ABAC (transportista, organización del cliente, viaje asignado al conductor).
- Los 10 agentes como principales de servicio, con el flujo Bot → AI Gateway → Policy Engine → Tool/MCP → API → Data.
- El recorrido completo del Approval Engine (solicitud, decisión humana con MFA, ejecución). En la referencia solo está la tabla.
- Verificación de correo en modo simulado. En el Next.js sí existe, aparte de este zip: `src/lib/verification.ts` y `sendEmail`.
- El flag `IAM_V2_ENABLED`.
- Los eventos de auditoría con los nombres de la sección 7.

## Fuera de alcance

Este documento no modifica el login, no enciende flags, no crea migraciones, no toca el panel de operaciones ni el stream de la operación 360, no despliega y no se fusiona solo. CDN/WAF, API Gateway separado, PostgreSQL y Redis siguen como objetivo. No hay secretos, pagos, DNS, credenciales ni `.env`.
