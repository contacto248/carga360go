# Carga360GO IAM v1
Módulo base ejecutable de identidad y acceso para integrar en el backend Carga360GO.

Incluye: PostgreSQL, usuarios multi-tenant, 19 roles, permisos RBAC, sesiones revocables, access/refresh tokens, MFA TOTP, bloqueo básico ante intentos fallidos, auditoría y endpoint de asignación de roles protegido por MFA.

## Antes de ejecutar
1. Copia `.env.example` a `.env` y sustituye todos los secretos.
2. Genera `MFA_ENCRYPTION_KEY` con Python/Fernet. Nunca reutilices el ejemplo.
3. En producción usa TLS y `COOKIE_SECURE=true`.
4. Crea el primer SUPER_ADMIN mediante un procedimiento administrativo seguro; no se incluye una contraseña por defecto.

## Ejecutar
`docker compose up --build`

Swagger: `http://localhost:8000/docs`

## Endpoints
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout
- POST /auth/logout-all
- POST /auth/mfa/setup
- POST /auth/mfa/enable
- GET /me
- POST /admin/roles/assign
- GET /admin/audit

## Integración
El módulo debe quedar delante de las APIs de Carga360. Cada servicio de dominio debe aplicar permisos y, además, reglas de tenant/propiedad del recurso. RBAC por sí solo no sustituye los controles ABAC y de pertenencia.
