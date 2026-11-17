# Inventario real y unificacion

## Archivos examinados
- `CARGA360GO-PRODUCTION-FINAL.zip`: API FastAPI compacta con enrutamiento OpenAI/xAI y fallback basico.
- `Carga360GO_Dual_AI_Orchestrator.zip`: orquestador independiente con modos auto, openai, xai y both.
- `carga360go-iam-completo.zip`: IAM, esquema SQL, Docker Compose y documentacion.

## Resultado unificado
- `app/main.py`: autenticacion, MFA, JWT, revocacion, RBAC, tenant, auditoria y orquestacion.
- `db/schema.sql`: tenants, usuarios, roles, permisos, tokens revocados, auditoria y consumo IA.
- `docker-compose.yml`: API, PostgreSQL y Nginx.
- `nginx/default.conf`: reverse proxy y limitacion basica.
- `.env.example`: secretos, modelos, timeouts y precios configurables.
- `README.md` y `GUIA-DESPLIEGUE.md`: ejecucion y administracion inicial.

## Mejoras agregadas
- Seleccion automatica basada en coste configurable.
- Fallback cruzado entre proveedores.
- Modo both.
- Estimacion y persistencia de coste y tokens.
- Trazabilidad por `trace_id`.
- Separacion por tenant y permisos `ai.execute`/`audit.read`.
- Health check, timeout, proxy y rate limiting basico.
