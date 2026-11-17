# Carga360GO Unificado Final

Un solo despliegue con IAM multiempresa, JWT, MFA TOTP, RBAC, auditoria, medicion de uso y orquestador OpenAI/xAI con seleccion automatica por coste y fallback.

## Arranque
1. Copia `.env.example` a `.env` y sustituye todos los secretos.
2. Ejecuta `docker compose up -d --build`.
3. Comprueba `curl http://localhost/health`.
4. Crea el primer tenant, usuario y hash Argon2 mediante el procedimiento de `GUIA-DESPLIEGUE.md`.
5. Abre `http://localhost/docs` solo en una red administrada. En Internet, publica HTTPS y limita esa ruta.

No almacenes claves API en Git. Los precios del router son configurables y deben actualizarse con los valores vigentes del proveedor.
