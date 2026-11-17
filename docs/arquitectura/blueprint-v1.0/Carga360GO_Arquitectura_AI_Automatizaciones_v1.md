CARGA360GO.CL  |  AI & AUTOMATION ENGINEERING BLUEPRINT

**CARGA360GO.CL**

**BLUEPRINT MAESTRO DE ARQUITECTURA AI Y AUTOMATIZACIONES**

Diseño técnico integral para una plataforma logística AI-native

| Documento | Arquitectura de referencia y especificación funcional |
| --- | --- |
| Versión | 1.0 |
| Fecha | 17 noviembre 2026 |
| Estado | Blueprint ejecutable para ingeniería |

# 1. Resumen ejecutivo

Carga360GO se define como un sistema de gestión logística donde la inteligencia artificial coordina trabajo, pero nunca sustituye la fuente oficial de datos ni las reglas transaccionales. El núcleo debe ser una API de dominio auditable; los agentes acceden a capacidades acotadas mediante herramientas y políticas.

Decisión de arquitectura  Backend Carga360 = autoridad; AI Gateway = razonamiento; MCP/API tools = ejecución controlada; Event Bus = automatización; Human Approval = control de riesgo.

## Objetivos de diseño

- Trazabilidad completa desde solicitud hasta cierre y liquidación.
- Automatización orientada a eventos, no a sondeos continuos.
- Agentes especializados con privilegio mínimo, aislamiento por tenant y auditoría.
- Independencia del proveedor de modelo mediante un AI Gateway.
- Operaciones críticas deterministas: precios, estados, permisos y contabilidad no dependen de respuestas generativas.
# 2. Arquitectura lógica objetivo

```
USUARIOS / CANALES
Cliente | Transportista | Operador | Administración | API Partners
                         ↓
WEB/PWA + BFF + API GATEWAY + IAM/WAF
                         ↓
CARGA360 CORE / DOMAIN SERVICES
Clientes | RFQ | Cotización | Órdenes | Viajes | Flota | Docs | Facturación
             ↓                         ↓
        EVENT BUS                WORKFLOW ENGINE
             ↓                         ↓
        AI GATEWAY  ←→  POLICY / APPROVAL ENGINE
             ↓
       C360 ORCHESTRATOR
 Sales | Ops | Dispatch | Track | Guardian | Doc | Customer | Carrier | Analyst
             ↓
     TOOL / MCP GATEWAY
     Internal APIs | Maps/GPS | Email | Messaging | Storage | ERP/BI
             ↓
DATA: PostgreSQL | Redis | Object Storage | Search/Vector | Warehouse | Audit
```

## Principios no negociables

| Principio | Aplicación |
| --- | --- |
| System of Record | PostgreSQL/servicios de dominio conservan el estado oficial. |
| Zero direct DB | Ningún bot escribe directamente en tablas de negocio. |
| Least privilege | Cada agente recibe herramientas y scopes mínimos. |
| Idempotencia | Cada comando mutable usa idempotency_key y control de versión. |
| Human-in-the-loop | Acciones sensibles requieren aprobación antes de ejecución. |
| Observabilidad | Cada decisión, tool call, aprobación y resultado genera trace/audit. |
| Tenant isolation | tenant_id obligatorio en identidad, autorización, consultas y eventos. |
| Provider abstraction | Model Router separa Carga360 del proveedor LLM. |

# 3. Catálogo de agentes

| Agente | Responsabilidad | Scope | Salida clave |
| --- | --- | --- | --- |
| C360-MASTER | Coordinar solicitudes y delegar | Lectura amplia; sin mutaciones críticas directas | approval.request |
| C360-SALES | RFQ, propuesta, seguimiento | CRM/RFQ/pricing; borradores | quote.ready |
| C360-OPS | Preparar operación | orders, requirements, capacity | operation.ready |
| C360-DISPATCH | Asignación | carriers, vehicles, drivers | assignment.proposed |
| C360-TRACK | Seguimiento/ETA | trips, tracking | delay.detected |
| C360-GUARDIAN | Riesgo/excepciones | alerts, incidents, rules | incident.escalated |
| C360-DOC | Documentación/OCR | documents, object storage | document.validated |
| C360-CUSTOMER | Autoservicio cliente | datos limitados al cliente | customer.notification |
| C360-CARRIER | Autoservicio transportista | datos limitados al carrier | carrier.response |
| C360-ANALYST | KPIs e insights | warehouse/read-only | insight.generated |

# 4. Automatizaciones end-to-end

| Workflow | Trigger | Secuencia | Resultado |
| --- | --- | --- | --- |
| WF-01 RFQ→Cotización | rfq.created | Validar → completar → pricing → borrador → aprobación → notificar | quote.sent |
| WF-02 Aceptación→Operación | quote.accepted | Crear orden → expediente → requisitos → planificar | operation.created |
| WF-03 Matching | capacity.requested | Filtrar elegibilidad → score → propuesta → aprobación | assignment.accepted |
| WF-04 Pre-dispatch | assignment.accepted | Docs → vehículo/conductor → checklist → liberar | trip.ready |
| WF-05 Tracking | gps.updated | Actualizar posición → ETA → geofence → detectar desviación | tracking.updated |
| WF-06 Excepción | risk.detected | Clasificar → playbook → alertar → aprobación/acción | incident.resolved |
| WF-07 POD | delivery.arrived | Recolectar evidencia → validar → POD → cierre | delivery.completed |
| WF-08 Facturación | delivery.completed | Conciliar evidencia → cargos → borrador → aprobación | invoice.ready |
| WF-09 Document expiry | document.expiring | Notificar → solicitar renovación → bloquear si política | compliance.updated |
| WF-10 Daily control | schedule.daily | KPIs → anomalías → resumen ejecutivo | briefing.ready |

# 5. Microservicios / módulos de dominio

- Identity & Tenant: usuarios, RBAC/ABAC, MFA, organizaciones, sesiones
- Customer: clientes, contactos, direcciones, preferencias
- RFQ: solicitudes y requerimientos de transporte
- Pricing: reglas tarifarias deterministas, costes, márgenes y versiones
- Quote: propuestas, vigencia, aceptación/rechazo
- Order: orden contractual/operativa confirmada
- Capacity: transportistas, flota, conductores, disponibilidad
- Matching: elegibilidad y scoring de candidatos
- Dispatch: asignaciones y checklist predespacho
- Trip: viaje, paradas, hitos y máquina de estados
- Tracking: GPS, geofences, ETA y timeline
- Incident: excepciones, severidad, playbooks y resolución
- Document: metadatos, versiones, OCR, validación y expiración
- POD: prueba de entrega y evidencias
- Billing: cargos, conciliación y estado de facturación
- Notification: plantillas y entrega por canal
- Approval: solicitudes, expiración, decisión y evidencia
- Audit: registro append-only de acciones humanas/máquina
# 6. Modelo de datos mínimo

| Dominio | Entidades |
| --- | --- |
| IAM | tenants, users, memberships, roles, policies, api_clients |
| Comercial | customers, contacts, rfqs, rfq_items, quotes, quote_versions |
| Operaciones | orders, shipments, trips, stops, assignments, status_history |
| Capacidad | carriers, drivers, vehicles, availability, compliance_status |
| Tracking | tracking_points, geofences, eta_snapshots, tracking_events |
| Documentos | documents, document_versions, extraction_results, validations |
| Incidentes | incidents, incident_events, playbook_runs |
| Finanzas | charges, invoice_drafts, invoices, settlements |
| AI | ai_sessions, ai_runs, tool_calls, model_usage, ai_actions |
| Control | approvals, audit_logs, outbox_events, idempotency_keys |

Claves transversales  Usar UUID/ULID, tenant_id en entidades multiempresa, timestamps UTC, created_by/updated_by, version para optimistic locking y correlation_id/trace_id para trazabilidad.

# 7. Contrato de eventos

Formato recomendado: event_id, event_type, event_version, tenant_id, aggregate_type, aggregate_id, occurred_at, actor, correlation_id, causation_id, payload, data_classification.

| Familia | Eventos principales |
| --- | --- |
| RFQ | rfq.created, rfq.validated, rfq.cancelled |
| Quote | quote.created, quote.approval_requested, quote.approved, quote.sent, quote.accepted |
| Order | order.created, order.changed, order.cancelled |
| Assignment | assignment.proposed, assignment.approved, assignment.accepted |
| Trip | trip.ready, trip.started, stop.arrived, trip.completed |
| Tracking | gps.updated, eta.changed, geofence.entered, route.deviation_detected |
| Incident | incident.opened, incident.escalated, incident.resolved |
| Document | document.received, document.validated, document.rejected, document.expiring |
| Billing | charge.created, invoice.ready, invoice.approved |

# 8. Tool Gateway y servidor MCP carga360

El MCP expone capacidades estrechas. No debe existir una herramienta genérica de SQL, shell de producción o modificación arbitraria de registros.

| Tool | Agente | Acceso | Guardrail |
| --- | --- | --- | --- |
| rfq.search/get/create | Sales/Master | RW | validación schema + tenant |
| pricing.calculate | Sales | R | motor determinista; no LLM price |
| quote.create_draft | Sales | W | draft only |
| quote.request_approval | Sales | W | crea approval |
| operation.get/create | Ops | RW | idempotencia |
| capacity.search | Ops/Dispatch | R | filtros de compliance |
| matching.rank | Dispatch | R | explica score, no asigna |
| assignment.propose | Dispatch | W | no confirmar sin policy |
| trip.get_timeline | Track/Customer | R | scope por relación |
| tracking.get_position | Track/Customer | R | RBAC + tenant |
| incident.create/escalate | Guardian | W | severity rules |
| document.upload/validate | Doc | RW | malware scan + OCR pipeline |
| approval.request/status | Todos | RW | policy-bound |
| analytics.query_kpi | Analyst | R | warehouse/read-only |

# 9. Runtime de IA

- AI Gateway: autentica, aplica cuotas, redacción de PII, routing de modelos y logging.
- Intent Router: clasifica solicitud y selecciona agente/workflow.
- Context Builder: obtiene únicamente datos autorizados mediante APIs y búsqueda.
- Tool Planner: selecciona herramientas disponibles; los schemas son fuente de verdad.
- Policy Engine: determina allow/deny/approval antes de una acción mutable.
- Model Router: selecciona modelo por riesgo, coste, latencia y tarea.
- Response Validator: valida JSON/schema, referencias de objetos y restricciones de política.
- Memory Store: preferencias/continuidad; nunca reemplaza datos del sistema de registro.
# 10. Seguridad y control

| Control | Implementación exigida |
| --- | --- |
| Autenticación | OIDC/OAuth2; MFA para operadores/administradores. |
| Autorización | RBAC + ABAC; tenant, owner, relationship y action scope. |
| Secretos | Secret manager; nunca claves en prompts/repositorio/logs. |
| Networking | WAF, TLS, private networking para datos, egress allowlist donde aplique. |
| Datos | cifrado en tránsito/reposo, clasificación PII, retención y borrado controlado. |
| Bots | service identity por agente; permisos mínimos; tool allowlist. |
| Prompt injection | contenido externo tratado como datos, no instrucciones; confirmación para acciones sensibles. |
| Supply chain | dependencias fijadas, scanning, SBOM, CI security checks. |
| Auditoría | append-only audit; actor humano/IA; before/after; reason; approval. |
| Resiliencia | timeouts, retries con backoff, circuit breakers, DLQ, idempotencia. |

## Matriz de aprobación

| Riesgo | Ejemplos | Política |
| --- | --- | --- |
| Bajo | resumir, clasificar, consultar estado | Automático |
| Medio | crear borrador, proponer asignación, abrir incidente | Automático con audit; opcional aprobación por regla |
| Alto | enviar propuesta vinculante, confirmar asignación, emitir factura | Aprobación humana |
| Crítico | cambio de permisos, borrado masivo, bypass compliance | Doble control/administrador; AI no ejecuta solo |

# 11. Máquinas de estado

| Objeto | Estados |
| --- | --- |
| RFQ | DRAFT → SUBMITTED → VALIDATED → QUOTED → ACCEPTED/REJECTED/CANCELLED |
| ORDER | CREATED → PLANNING → READY → IN_TRANSIT → DELIVERED → CLOSED/CANCELLED |
| TRIP | PLANNED → READY → STARTED → AT_PICKUP → IN_TRANSIT → AT_DELIVERY → COMPLETED |
| INCIDENT | OPEN → TRIAGED → IN_PROGRESS → MONITORING → RESOLVED → CLOSED |
| DOCUMENT | RECEIVED → PROCESSING → VALID/INVALID → EXPIRING/EXPIRED |
| APPROVAL | PENDING → APPROVED/REJECTED/EXPIRED/CANCELLED |

# 12. Observabilidad, calidad AI y FinOps

- OpenTelemetry en web, API, workflows, agentes y tools; trace_id común.
- Dashboards: latencia, error rate, queue depth, DLQ, workflows bloqueados y aprobaciones pendientes.
- AI telemetry: modelo, tokens/coste, latencia, tool success, schema failures, groundedness tests y policy denials.
- Evaluación offline con casos dorados de logística; evaluación de regresión antes de cambiar prompts/modelos.
- Presupuesto por tenant/agente/workflow y límites de concurrencia para controlar coste.
# 13. Estructura de repositorio recomendada

```
carga360-platform/
  apps/
    web/                 # cliente, carrier, operaciones, admin
    api/                 # API/BFF pública
    worker/              # consumidores de eventos/jobs
  services/
    identity/ customer/ rfq/ pricing/ quote/ order/
    capacity/ matching/ dispatch/ trip/ tracking/
    incident/ document/ billing/ approval/ notification/ audit/
  ai/
    gateway/ orchestrator/ agents/ policies/ prompts/ evals/
  mcp/
    carga360-server/ tools/ schemas/ auth/
  packages/
    contracts/ events/ sdk/ observability/ security/ ui/
  infra/
    terraform/ kubernetes/ environments/ monitoring/
  docs/
    architecture/ adr/ api/ runbooks/ threat-model/
```

# 14. Topología de despliegue

- Edge: DNS/CDN/WAF y rate limiting.
- Frontend: Web/PWA separada del API mediante BFF cuando sea necesario.
- Compute: servicios stateless escalables + workers para eventos/workflows.
- Data: PostgreSQL HA, Redis administrado, object storage versionado, warehouse analítico.
- Messaging: bus/colas con DLQ y outbox pattern para consistencia evento-transacción.
- AI: gateway privado, agentes stateless donde sea posible; memoria y estado en stores explícitos.
- CI/CD: build, tests, SAST/SCA, migraciones controladas, canary/blue-green y rollback.
- Entornos: dev, staging y production separados por cuentas/proyectos y secretos independientes.
# 15. API contractual inicial

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | /v1/rfqs | Crear solicitud |
| POST | /v1/rfqs/{id}/quote | Solicitar cálculo/borrador |
| POST | /v1/quotes/{id}/approvals | Solicitar aprobación |
| POST | /v1/quotes/{id}/accept | Aceptar cotización |
| POST | /v1/orders/{id}/matching | Calcular candidatos |
| POST | /v1/assignments | Proponer/crear asignación |
| POST | /v1/trips/{id}/start | Iniciar viaje |
| POST | /v1/tracking/events | Ingerir tracking |
| POST | /v1/incidents | Crear incidente |
| POST | /v1/documents | Registrar/subir documento |
| GET | /v1/operations/{id}/timeline | Timeline único |
| GET | /v1/analytics/kpis | KPIs autorizados |

# 16. Paquete de construcción integral

Para construir el producto completo, el trabajo de ingeniería queda dividido por capacidades, no por una secuencia obligatoria. Los equipos pueden ejecutar streams en paralelo con contratos compartidos.

| Stream | Entregables |
| --- | --- |
| Platform | monorepo, CI/CD, IaC, entornos, secrets, observability |
| Identity/Security | OIDC, tenant isolation, RBAC/ABAC, audit, threat model |
| Core logistics | RFQ, quote, order, capacity, dispatch, trip, incident |
| Tracking | ingesta GPS, geofence, ETA, timeline, alertas |
| Documents | storage, OCR/extraction interface, validation, expiries |
| Finance | charges, invoice draft, approvals, export/integration interface |
| Automation | event bus, outbox, workflow engine, schedulers, DLQ |
| AI | gateway, orchestrator, catálogo de agentes, evals, safety policies |
| MCP | carga360-server, tool schemas, auth, audit, tool allowlists |
| Frontends | customer, carrier, operations, admin, approvals inbox |
| Analytics | warehouse, KPI contracts, ops dashboards, AI analyst read-only |
| Reliability | load tests, backup/restore, DR, runbooks, incident response |

# 17. Definition of Done del sistema

- Una operación puede recorrer RFQ → cotización → aprobación → orden → asignación → viaje → POD → facturación con audit trail.
- Cada mutación identifica usuario/agente, tenant, correlation_id e idempotency_key.
- Un bot no puede ejecutar tools fuera de su allowlist ni acceder a otro tenant.
- Acciones high-risk detienen el workflow hasta aprobación; el rechazo evita la mutación.
- Los eventos son versionados, reintentables y enviados a DLQ tras fallos persistentes.
- El pricing puede reproducir exactamente una cotización histórica usando la versión de reglas.
- Tracking e incidentes generan una línea temporal verificable.
- Los documentos conservan versión, origen, checksum, resultado de validación y expiración.
- Existe trazabilidad de coste/latencia/errores por modelo, agente y workflow.
- Backups y restore son probados; existen runbooks de incidentes y rollback.
# 18. Compatibilidad con Grok Bot / Cursor

La arquitectura se ha mantenido desacoplada del proveedor. La documentación oficial consultada indica que MCP permite a Cursor conectar herramientas y fuentes externas; soporta tools, prompts y resources, con transporte local o remoto. La documentación de Agent SDK describe conexiones MCP por servidor remoto, proceso stdio, conectores de la cuenta o peer agent. Grok Bot se describe como un conjunto de Bots persistentes que trabajan con navegador, filesystem y terminal, y pueden coordinarse. Estas capacidades justifican usar MCP/Agent SDK como adaptador, no como base de datos ni autoridad transaccional.

| Fuente | Uso en este blueprint |
| --- | --- |
| Cursor Docs – Model Context Protocol (MCP) | Base para Tool/MCP Gateway y tools estructuradas. |
| Cursor Docs – Agent SDK MCP connections | Base para conexiones remotas/locales y peer-agent. |
| Cursor Docs – Grok Bot | Base para integración de bots persistentes y coordinación. |

# 19. Blueprint de operación final

```
CLIENTE → RFQ → SALES → PRICING → APPROVAL → ORDER → OPS → MATCHING → DISPATCH → TRIP → TRACK → GUARDIAN → POD → BILLING
                                   ↘ DOCUMENT AI ↗                 ↘ ANALYTICS ↗
```

Resultado  Carga360GO puede evolucionar como plataforma logística AI-native en la que los agentes aceleran decisiones y automatizan trabajo, mientras el core conserva consistencia, seguridad, trazabilidad y control humano.

Documento de arquitectura de referencia · v1.0
