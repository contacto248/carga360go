# Arquitectura objetivo

```
Usuarios/PWA/Web
      |
 WAF / Reverse Proxy
      |
 API Gateway + Identity + RBAC + Tenant
      |
 +---- Carga360 Core ---- PostgreSQL
 |       |
 |       +---- Event Bus ---- Workers/Notificaciones
 |
 +---- AI Gateway ---- Orchestrator ---- Policy Engine
                         |
       MASTER/SALES/OPS/DISPATCH/TRACK/GUARDIAN/DOC/CUSTOMER/CARRIER/ANALYST
                         |
                    MCP Tool Gateway
                         |
                 Carga360 Core API

Toda acción -> Audit Log. Acción sensible -> Approval Engine -> humano -> ejecución.
```

## Eventos canónicos
freight.created, quote.created, quote.accepted, operation.created, operation.assigned, trip.started, tracking.updated, anomaly.detected, incident.created, document.received, document.validated, delivery.completed, invoice.created, payment.received.

## Separación de autoridad
- Core API: fuente de verdad.
- Agentes: planificación y lenguaje.
- Policy Engine: decide si puede ejecutarse.
- Approval Engine: detiene acciones sensibles.
- MCP: superficie de herramientas, no acceso universal.
- Audit: reconstrucción de acciones.

## Integraciones preparadas
GPS/telemática, mapas, WhatsApp, email, object storage, facturación/ERP, firma, BI y proveedor LLM mediante adaptadores independientes. No se incluyen credenciales ni proveedores ficticios.
