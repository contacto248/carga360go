# Carga360GO AI Platform

Base funcional para construir la plataforma logística AI-native de Carga360GO.

## Incluye
- API FastAPI con cargas, cotización, asignación, tracking, incidencias, documentos, aprobaciones y auditoría.
- 10 agentes definidos y orquestador con permisos mínimos.
- Event bus interno reemplazable por Redis/Kafka.
- Policy Engine + Human Approval para acciones sensibles.
- Esquema PostgreSQL de producción.
- Contrato MCP de herramientas controladas.
- Docker Compose y Nginx.
- Dashboard web operativo sin dependencias externas.

## Inicio rápido
1. Copia `.env.example` a `.env`.
2. Ejecuta `docker compose up --build`.
3. Web: http://localhost
4. API/OpenAPI: http://localhost/api/docs

## Credenciales demo
Header: `X-API-Key: change-me-now`

## Principio
El LLM nunca escribe directamente en la base. Toda mutación pasa por API, autorización, política, aprobación y auditoría.

## Producción
Cambiar secretos, activar TLS, OIDC/MFA, almacenamiento de objetos, proveedor GPS, correo/WhatsApp, LLM y MCP remotos, backups y monitoring antes de tráfico real.
