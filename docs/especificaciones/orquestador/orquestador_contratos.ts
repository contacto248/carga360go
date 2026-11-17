/**
 * Carga360go · Contratos del Orquestador (Master Bot + 10 agentes C360-*).
 *
 * Contrato v1.1 (sobre c360-msg/1.1 con meta.testData; estados y niveles alineados con PLAYBOOK_OPS_DISPATCH.md v1.0).
 * Especificación cerrada para implementar, 17-11-2026 (hora de Chile, UTC−3). No está en el repo ni en producción, y este bot no se lo encargó a Cursor.
 * Las decisiones técnicas D-01…D-29 están en ORQUESTADOR_SPEC_V1.md §9 «Decisiones de cierre»; cada una dice cómo revertirla.
 * Acompaña a out/arquitectura/ORQUESTADOR_SPEC_V1.md. Reutiliza los tipos de ./mcp_tools_contrato.ts (VALIDACION_DATOS.md §12).
 * Fuente de los 10 agentes: blueprint v1.0 en el repo (docs/arquitectura/blueprint-v1.0/…, §3, y AGENTS en plataforma/services/api/main.py),
 * release/2026-11-15 @ 89cb8a5. Los ZIP vigentes del orquestador (UNIFICADO-FINAL y ONE, inventariados en docs/arquitectura/ai-router/
 * INVENTARIO_ZIP_PRODUCCION.md e INVENTARIO_ONE.md) no traen bots, herramientas MCP ni Approval Engine: los 10 agentes siguen saliendo del blueprint.
 *
 * Reglas de diseño:
 *  - Carga360 Core es el sistema de registro. Ningún agente toca la DB: solo herramientas MCP → API de Core → Policy → validación → auditoría.
 *  - Pricing y Matching son deterministas (src/lib/costos/engine.ts, src/lib/match.ts, src/lib/ops/allocation.ts). Ningún LLM calcula precio ni elige transportista.
 *  - Cada agente es un principal AI_SERVICE con permisos mínimos (techo = IAM_V1.md §5, PR #53 fusionado, + extensiones D-11). Ninguno es SUPER_ADMIN ni users.role = "admin".
 *  - Nivel 3 nunca lo ejecuta un agente: pide aprobación y espera.
 *  - Montos de costo y precios de proveedores LLM son PARÁMETROS configurables, no constantes de este archivo.
 *
 * Verificado: compila con `tsc --noEmit --strict` (typescript 5.9.3, zod 3.25.76, zod-to-json-schema 3.25.2), junto a mcp_tools_contrato.ts.
 */
import { z } from "zod";
import {
  Canal,
  CODIGOS_REGLA,
  CrearOperacionInput,
  EstadoOperacion,
  MOTIVOS_BLOQUEADA,
  OperacionId,
  SubnivelAccion,
  ValidarSolicitudInput,
  canonicalJson,
  sha256Hex,
} from "./mcp_tools_contrato";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Agentes, participantes e identidades de servicio
// ─────────────────────────────────────────────────────────────────────────────

/** Los 10 agentes del blueprint v1.0 §3 (mismo orden que AGENTS en main.py). */
export const AGENTES = [
  "C360-MASTER", "C360-SALES", "C360-OPS", "C360-DISPATCH", "C360-TRACK",
  "C360-GUARDIAN", "C360-DOC", "C360-CUSTOMER", "C360-CARRIER", "C360-ANALYST",
] as const;
export const AgenteId = z.enum(AGENTES);
export type AgenteId = z.infer<typeof AgenteId>;

/** Equivalencia con los 4 bots de ARQUITECTURA_IA_REFERENCIA.md §2 (nombres en castellano). */
export const ALIAS_BOTS_REFERENCIA: Record<string, AgenteId> = {
  "Master Bot": "C360-MASTER",
  OPERACIONES: "C360-OPS",
  DOCUMENTACION: "C360-DOC",
  SEGUIMIENTO: "C360-TRACK",
  INTELIGENCIA_DE_NEGOCIO: "C360-ANALYST",
};

/** Quién puede aparecer en from/to de un sobre. "core" y "event-bus" no son agentes: son infraestructura. */
export const Participante = z.union([
  AgenteId,
  z.literal("orquestador"),
  z.literal("core"),
  z.literal("event-bus"),
  z.string().regex(/^canal:(web|app|whatsapp|bot|telefono|api)$/),
  z.string().regex(/^humano:[0-9a-f-]{36}$/, "humano:<uuid de usuario>"),
  z.literal("cola-humana"),
]);
export type Participante = z.infer<typeof Participante>;

/** Identidad de servicio: una por agente y por entorno. El secreto vive en el secret manager; aquí solo el nombre. */
export const IdentidadServicio = z.object({
  service_id: z.string().regex(/^svc-c360-[a-z]+$/),
  agente: AgenteId,
  entorno: z.enum(["dev", "staging", "prod"]),
  /** Nombre de la variable del secreto (nunca el valor). */
  secret_ref: z.string().regex(/^[A-Z0-9_]+$/),
  /** principal_type de IAM v1 (iam-v1/referencia/schema.sql). Nunca HUMAN, nunca SUPER_ADMIN ni users.role = admin. */
  principal: z.literal("AI_SERVICE"),
  /** Permisos IAM v1 efectivos (= permisosDe(agente)); Core rechaza la identidad si trae uno de PERMISOS_PROHIBIDOS_AGENTES. */
  permisos: z.array(z.string()).min(1),
  /** Organizaciones OPS en las que puede actuar (ops_organizations.id). Vacío = ninguna. */
  org_ids: z.array(z.string().uuid()),
}).strict();
export type IdentidadServicio = z.infer<typeof IdentidadServicio>;

// ─────────────────────────────────────────────────────────────────────────────
// 2. Permisos: los 22 de IAM v1 (PR #53, docs/arquitectura/IAM_V1.md §3) + extensiones propuestas
// ─────────────────────────────────────────────────────────────────────────────

/** Permisos de la instrucción IAM v1 de Gerencia (17-11-2026 07:32), tal cual. */
export const PERMISOS_IAM_V1 = [
  "shipment.read", "shipment.create", "shipment.update", "shipment.cancel",
  "quote.read", "quote.create", "quote.approve", "carrier.assign",
  "tracking.read", "tracking.update", "document.upload", "document.validate",
  "incident.create", "incident.resolve", "invoice.read", "invoice.approve",
  "user.create", "user.disable", "role.assign", "audit.read", "ai.execute", "approval.approve",
] as const;
export type PermisoIam = (typeof PERMISOS_IAM_V1)[number];

/**
 * Permisos que IAM v1 no trae y que el cierre técnico agrega (D-11, ORQUESTADOR_SPEC_V1.md «Decisiones de cierre»).
 * approval.request: IAM v1 §6 dice «IA solicita», pero no le da código de permiso.
 * Se apagan todos con EXTENSIONES_ACTIVAS = false (reversa de D-11).
 */
export const PERMISOS_EXTENSION = ["approval.request", "document.read", "offer.read", "offer.respond", "notification.send", "bus.read", "analytics.read"] as const;
export type PermisoExtension = (typeof PERMISOS_EXTENSION)[number];
export type Permiso = PermisoIam | PermisoExtension;

/** Techo por agente según la tabla de IAM_V1.md §5 («Permisos mínimos»). approval.request se agrega a quien la tabla dice «solicitar» o «proponer». */
export const TECHO_IAM_V1: Record<AgenteId, readonly Permiso[]> = {
  "C360-MASTER": ["ai.execute", "approval.request"],
  "C360-SALES": ["quote.read", "quote.create", "shipment.read", "approval.request"],
  "C360-OPS": ["shipment.read", "shipment.create", "shipment.update", "approval.request"],
  "C360-DISPATCH": ["shipment.read", "tracking.read", "carrier.assign", "approval.request"],
  "C360-TRACK": ["tracking.read", "tracking.update", "incident.create"],
  "C360-GUARDIAN": ["audit.read", "incident.create", "approval.request"],
  "C360-DOC": ["document.upload", "document.validate", "approval.request"],
  "C360-CUSTOMER": ["shipment.read", "quote.read", "incident.create"],
  "C360-CARRIER": ["shipment.read", "tracking.read", "tracking.update", "document.upload"],
  "C360-ANALYST": ["shipment.read", "tracking.read", "quote.read", "invoice.read"],
};

/** D-11: interruptor de las extensiones. false = vuelve al techo estricto de IAM v1 (las herramientas de `extensiones` quedan inactivas). */
export const EXTENSIONES_ACTIVAS: boolean = true;

/**
 * D-11 y D-12: extensiones aprobadas por agente (solo lecturas, respuestas propias, avisos con plantilla y ai.execute para los agentes que usan LLM).
 * Rechazada en el cierre: shipment.read para C360-MASTER (delega en CUSTOMER u OPS; mínimo privilegio).
 */
export const EXTENSIONES_APROBADAS: Record<AgenteId, readonly Permiso[]> = {
  "C360-MASTER": ["bus.read"],
  "C360-SALES": ["ai.execute"],
  "C360-OPS": ["ai.execute"],
  "C360-DISPATCH": [],
  "C360-TRACK": ["shipment.read", "bus.read"],
  "C360-GUARDIAN": ["ai.execute", "shipment.read", "tracking.read", "notification.send"],
  "C360-DOC": ["ai.execute", "document.read", "shipment.read"],
  "C360-CUSTOMER": ["ai.execute", "tracking.read"],
  "C360-CARRIER": ["ai.execute", "offer.read", "offer.respond"],
  "C360-ANALYST": ["ai.execute", "analytics.read", "bus.read"],
};

/** Techo efectivo = IAM v1 + extensiones aprobadas (si están activas). */
export function techoEfectivo(agente: AgenteId): readonly Permiso[] {
  return EXTENSIONES_ACTIVAS ? [...TECHO_IAM_V1[agente], ...EXTENSIONES_APROBADAS[agente]] : TECHO_IAM_V1[agente];
}

/** Permisos que un agente nunca tiene, ni siquiera como extensión (IAM_V1.md §5 «Queda fuera» + blueprint §8). */
export const PERMISOS_PROHIBIDOS_AGENTES = [
  "approval.approve", "role.assign", "user.create", "user.disable", "quote.approve", "invoice.approve",
  "incident.resolve", "shipment.cancel",
] as const satisfies readonly PermisoIam[];
/** Capacidades que no existen como herramienta para nadie. */
export const CAPACIDADES_INEXISTENTES = ["sql.execute", "shell.execute", "flags.write", "record.delete", "payment.execute", "payment.refund", "bulk.export.pii"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// 3. Herramientas MCP (catálogo del orquestador) y su nivel
// ─────────────────────────────────────────────────────────────────────────────

export type HerramientaSpec = {
  nombre: string;
  /** Permiso IAM que exige en Core. null = no toca Core (p. ej. redactar un borrador local). */
  permiso: Permiso | null;
  /** "proponer": el permiso se usa solo para dejar una propuesta; la ejecución es de una persona (IAM_V1.md §5: «proponer carrier.assign», «proponer document.validate»). */
  modo: "directo" | "proponer";
  subnivel: z.infer<typeof SubnivelAccion>;
  /** Ruta de Core. "PROPUESTA" si no existe hoy en el repo. */
  api: string;
  existe_hoy: boolean;
  determinista: boolean;
  idempotente: boolean;
};

export const HERRAMIENTAS = {
  estructurar_solicitud: { nombre: "estructurar_solicitud", permiso: "shipment.create", modo: "directo", subnivel: "2a", api: "POST /api/ops/solicitudes (PROPUESTA)", existe_hoy: false, determinista: false, idempotente: true },
  ver_solicitud: { nombre: "ver_solicitud", permiso: "shipment.read", modo: "directo", subnivel: "1", api: "GET /api/ops/solicitudes/{id} (PROPUESTA)", existe_hoy: false, determinista: true, idempotente: true },
  validar_solicitud: { nombre: "validar_solicitud", permiso: "shipment.read", modo: "directo", subnivel: "1", api: "POST /api/ops/solicitudes/validar (PROPUESTA)", existe_hoy: false, determinista: true, idempotente: true },
  crear_operacion: { nombre: "crear_operacion", permiso: "shipment.create", modo: "directo", subnivel: "2a", api: "POST /api/ops/operaciones (PR #52 y #58 fusionados; cuerpo plano, adaptador aCuerpoCoreOperacion, D-14)", existe_hoy: true, determinista: true, idempotente: true },
  actualizar_operacion: { nombre: "actualizar_operacion", permiso: "shipment.update", modo: "directo", subnivel: "2a", api: "PATCH /api/ops/operaciones/{codigo} (PROPUESTA)", existe_hoy: false, determinista: true, idempotente: true },
  consultar_operacion: { nombre: "consultar_operacion", permiso: "shipment.read", modo: "directo", subnivel: "1", api: "GET /api/ops/operaciones/{codigo} (PROPUESTA)", existe_hoy: false, determinista: true, idempotente: true },
  ver_envio: { nombre: "ver_envio", permiso: "shipment.read", modo: "directo", subnivel: "1", api: "GET /api/ops/v1/envios/{id}", existe_hoy: true, determinista: true, idempotente: true },
  calcular_costo_referencia: { nombre: "calcular_costo_referencia", permiso: "quote.create", modo: "directo", subnivel: "2a", api: "POST /api/costos/cotizar (guarda cotización en «borrador»)", existe_hoy: true, determinista: true, idempotente: false },
  ver_cotizacion: { nombre: "ver_cotizacion", permiso: "quote.read", modo: "directo", subnivel: "1", api: "PROPUESTA (lectura de cost_quotes)", existe_hoy: false, determinista: true, idempotente: true },
  buscar_capacidad: { nombre: "buscar_capacidad", permiso: "carrier.assign", modo: "proponer", subnivel: "1", api: "PROPUESTA (hoy: countMatchingTrucks en src/lib/agent/tools.ts)", existe_hoy: false, determinista: true, idempotente: true },
  proponer_asignacion: { nombre: "proponer_asignacion", permiso: "carrier.assign", modo: "proponer", subnivel: "2a", api: "POST /api/ops/asignacion", existe_hoy: true, determinista: true, idempotente: false },
  ver_asignacion: { nombre: "ver_asignacion", permiso: "shipment.read", modo: "directo", subnivel: "1", api: "GET /api/ops/v1/asignaciones/{runId}", existe_hoy: true, determinista: true, idempotente: true },
  consultar_eta: { nombre: "consultar_eta", permiso: "tracking.read", modo: "directo", subnivel: "1", api: "GET /api/ops/envios/{id}/eta", existe_hoy: true, determinista: true, idempotente: true },
  listar_alertas: { nombre: "listar_alertas", permiso: "tracking.read", modo: "directo", subnivel: "1", api: "GET /api/ops/envios/{id}/alertas", existe_hoy: true, determinista: true, idempotente: true },
  registrar_posicion: { nombre: "registrar_posicion", permiso: "tracking.update", modo: "directo", subnivel: "2a", api: "POST /api/ops/gps/conductor", existe_hoy: true, determinista: true, idempotente: true },
  suscribir_operacion: { nombre: "suscribir_operacion", permiso: "tracking.update", modo: "directo", subnivel: "2a", api: "POST /api/ops/operaciones/{codigo}/suscripciones (PROPUESTA)", existe_hoy: false, determinista: true, idempotente: true },
  abrir_incidente: { nombre: "abrir_incidente", permiso: "incident.create", modo: "directo", subnivel: "2b", api: "POST /api/ops/incidentes (PROPUESTA; no hay tabla incidents)", existe_hoy: false, determinista: true, idempotente: true },
  leer_auditoria_operacion: { nombre: "leer_auditoria_operacion", permiso: "audit.read", modo: "directo", subnivel: "1", api: "GET /api/ops/operaciones/{codigo}/auditoria (PROPUESTA; hoy listAudit solo en /admin/auditoria)", existe_hoy: false, determinista: true, idempotente: true },
  crear_expediente: { nombre: "crear_expediente", permiso: "document.upload", modo: "directo", subnivel: "2a", api: "POST /api/ops/operaciones/{codigo}/expediente (PROPUESTA)", existe_hoy: false, determinista: true, idempotente: true },
  registrar_item_expediente: { nombre: "registrar_item_expediente", permiso: "document.upload", modo: "directo", subnivel: "2a", api: "POST /api/ops/operaciones/{codigo}/expediente/items (PROPUESTA)", existe_hoy: false, determinista: true, idempotente: true },
  ver_expediente: { nombre: "ver_expediente", permiso: "document.read", modo: "directo", subnivel: "1", api: "GET /api/ops/operaciones/{codigo}/expediente (PROPUESTA)", existe_hoy: false, determinista: true, idempotente: true },
  proponer_validacion_documento: { nombre: "proponer_validacion_documento", permiso: "document.validate", modo: "proponer", subnivel: "2a", api: "PROPUESTA (la aprobación sigue en src/lib/accreditation.ts, humana)", existe_hoy: false, determinista: false, idempotente: true },
  subir_documento_propio: { nombre: "subir_documento_propio", permiso: "document.upload", modo: "directo", subnivel: "2a", api: "PROPUESTA (documento del transportista a su expediente)", existe_hoy: false, determinista: true, idempotente: true },
  solicitar_aprobacion: { nombre: "solicitar_aprobacion", permiso: "approval.request", modo: "directo", subnivel: "2a", api: "POST /api/ops/aprobaciones (PROPUESTA; no hay tabla approvals)", existe_hoy: false, determinista: true, idempotente: true },
  estado_aprobacion: { nombre: "estado_aprobacion", permiso: "approval.request", modo: "directo", subnivel: "1", api: "GET /api/ops/aprobaciones/{id} (PROPUESTA)", existe_hoy: false, determinista: true, idempotente: true },
  clasificar_intencion: { nombre: "clasificar_intencion", permiso: "ai.execute", modo: "directo", subnivel: "1", api: "AI Gateway (AIClient.chat task=clasificar_intencion)", existe_hoy: false, determinista: false, idempotente: true },
  redactar_notificacion: { nombre: "redactar_notificacion", permiso: null, modo: "directo", subnivel: "1", api: "local (borrador, sin envío)", existe_hoy: false, determinista: false, idempotente: true },
  notificar_parte: { nombre: "notificar_parte", permiso: "notification.send", modo: "directo", subnivel: "2b", api: "POST /api/ops/notificaciones (PROPUESTA; plantillas aprobadas)", existe_hoy: false, determinista: true, idempotente: true },
  ver_ofertas_propias: { nombre: "ver_ofertas_propias", permiso: "offer.read", modo: "directo", subnivel: "1", api: "PROPUESTA (lectura de offers del transportista)", existe_hoy: false, determinista: true, idempotente: true },
  responder_oferta_propia: { nombre: "responder_oferta_propia", permiso: "offer.respond", modo: "directo", subnivel: "2a", api: "POST /api/ofertas/{id} {action:\"retirar\"} (hoy solo retirar)", existe_hoy: true, determinista: true, idempotente: false },
  consultar_kpi: { nombre: "consultar_kpi", permiso: "analytics.read", modo: "directo", subnivel: "1", api: "PROPUESTA (GET /api/ops/kpis); no hay warehouse", existe_hoy: false, determinista: true, idempotente: true },
  listar_eventos_bus: { nombre: "listar_eventos_bus", permiso: "bus.read", modo: "directo", subnivel: "1", api: "GET /api/ops/bus/eventos (PROPUESTA)", existe_hoy: false, determinista: true, idempotente: true },
} as const satisfies Record<string, HerramientaSpec>;
export type NombreHerramienta = keyof typeof HERRAMIENTAS;

// ─────────────────────────────────────────────────────────────────────────────
// 4. Fichas de agente (allowlist dentro del techo IAM v1, extensiones propuestas aparte)
// ─────────────────────────────────────────────────────────────────────────────

export type FichaAgente = {
  agente: AgenteId;
  service_id: string;
  /** principal_type de iam-v1/referencia/schema.sql. */
  principal: "AI_SERVICE";
  riesgo: "bajo" | "medio" | "alto";
  /** true si puede usar un LLM para redactar o clasificar. Las decisiones de precio/calce nunca. */
  usa_llm: boolean;
  /** Activas: su permiso está dentro de TECHO_IAM_V1 (o es null). */
  herramientas: readonly NombreHerramienta[];
  /** Extensiones (D-11): necesitan un permiso fuera del techo IAM v1. Activas solo con EXTENSIONES_ACTIVAS. */
  extensiones: readonly NombreHerramienta[];
  /** Subnivel máximo que puede ejecutar sin aprobación. Nunca "3". */
  subnivel_max: "1" | "2a" | "2b";
  prepara_para_aprobacion: readonly string[];
  prohibido: readonly string[];
};

const PROHIBIDO_COMUN = ["acceso directo a la DB", "SQL o shell", "borrar registros", "pagos o reembolsos", "cambiar flags, roles o permisos", "approval.approve (aprobarse a sí mismo o a otro agente)", "actuar en otra organización", "SUPER_ADMIN o users.role = admin"] as const;

export const FICHAS: Record<AgenteId, FichaAgente> = {
  "C360-MASTER": { agente: "C360-MASTER", service_id: "svc-c360-master", principal: "AI_SERVICE", riesgo: "medio", usa_llm: true,
    herramientas: ["clasificar_intencion", "solicitar_aprobacion", "estado_aprobacion", "redactar_notificacion"],
    extensiones: ["listar_eventos_bus"],
    subnivel_max: "2a", prepara_para_aprobacion: [], prohibido: [...PROHIBIDO_COMUN, "mutaciones de negocio (delega)", "hablar fuera del canal de origen"] },
  "C360-SALES": { agente: "C360-SALES", service_id: "svc-c360-sales", principal: "AI_SERVICE", riesgo: "medio", usa_llm: true,
    herramientas: ["validar_solicitud", "ver_solicitud", "calcular_costo_referencia", "ver_cotizacion", "solicitar_aprobacion", "estado_aprobacion", "redactar_notificacion"],
    extensiones: [],
    subnivel_max: "2a", prepara_para_aprobacion: ["quote.approve: propuesta vinculante, cotización excepcional, descuento"], prohibido: [...PROHIBIDO_COMUN, "inventar o ajustar un precio", "hablar de comisiones", "facturas"] },
  "C360-OPS": { agente: "C360-OPS", service_id: "svc-c360-ops", principal: "AI_SERVICE", riesgo: "medio", usa_llm: true,
    herramientas: ["estructurar_solicitud", "validar_solicitud", "ver_solicitud", "crear_operacion", "actualizar_operacion", "consultar_operacion", "ver_envio", "solicitar_aprobacion", "estado_aprobacion"],
    extensiones: [],
    subnivel_max: "2a", prepara_para_aprobacion: ["cancelar operación: la ejecuta una persona (2b con confirmación previa si está asignada o en_curso; Nivel 3 si hay cobros; PLAYBOOK_OPS_DISPATCH §6 y §8). IAM_V1 §5 pide Approval Engine: conflicto abierto, ver D-13"], prohibido: [...PROHIBIDO_COMUN, "asignar transportista", "cancelar directo"] },
  "C360-DISPATCH": { agente: "C360-DISPATCH", service_id: "svc-c360-dispatch", principal: "AI_SERVICE", riesgo: "alto", usa_llm: false,
    herramientas: ["consultar_operacion", "ver_envio", "consultar_eta", "buscar_capacidad", "proponer_asignacion", "ver_asignacion", "solicitar_aprobacion", "estado_aprobacion"],
    extensiones: [],
    subnivel_max: "2a", prepara_para_aprobacion: ["confirmar asignación: Nivel 2b con confirmación humana previa de una persona con asignacion.ejecutar (NIVEL_ACCIONES)", "reasignar (2b, misma regla)", "tarifa distinta a la del motor: Nivel 3"], prohibido: [...PROHIBIDO_COMUN, "carrier.assign directo", "cambiar pesos de reglas"] },
  "C360-TRACK": { agente: "C360-TRACK", service_id: "svc-c360-track", principal: "AI_SERVICE", riesgo: "bajo", usa_llm: false,
    herramientas: ["consultar_eta", "listar_alertas", "suscribir_operacion", "abrir_incidente"],
    extensiones: ["consultar_operacion", "listar_eventos_bus"],
    subnivel_max: "2b", prepara_para_aprobacion: [], prohibido: [...PROHIBIDO_COMUN, "mover el estado del viaje", "cerrar alertas de seguridad", "resolver incidencias ajenas al viaje"] },
  "C360-GUARDIAN": { agente: "C360-GUARDIAN", service_id: "svc-c360-guardian", principal: "AI_SERVICE", riesgo: "alto", usa_llm: true,
    herramientas: ["leer_auditoria_operacion", "abrir_incidente", "solicitar_aprobacion", "estado_aprobacion"],
    extensiones: ["consultar_operacion", "listar_alertas", "notificar_parte"],
    subnivel_max: "2b", prepara_para_aprobacion: ["bloquear transportista o conductor", "user.disable", "bypass de compliance (nunca automático)"], prohibido: [...PROHIBIDO_COMUN, "role.assign", "user.disable directo", "incident.resolve"] },
  "C360-DOC": { agente: "C360-DOC", service_id: "svc-c360-doc", principal: "AI_SERVICE", riesgo: "medio", usa_llm: true,
    herramientas: ["crear_expediente", "registrar_item_expediente", "proponer_validacion_documento", "solicitar_aprobacion", "estado_aprobacion"],
    extensiones: ["ver_expediente", "consultar_operacion"],
    subnivel_max: "2a", prepara_para_aprobacion: ["document.validate (aprobar o rechazar)", "validación excepcional", "borrar archivo"], prohibido: [...PROHIBIDO_COMUN, "inventar archivos", "document.validate directo"] },
  "C360-CUSTOMER": { agente: "C360-CUSTOMER", service_id: "svc-c360-customer", principal: "AI_SERVICE", riesgo: "medio", usa_llm: true,
    herramientas: ["validar_solicitud", "consultar_operacion", "ver_cotizacion", "abrir_incidente", "redactar_notificacion"],
    extensiones: ["consultar_eta"],
    subnivel_max: "2b", prepara_para_aprobacion: [], prohibido: [...PROHIBIDO_COMUN, "datos de otra organización", "dar precios o comisiones", "mostrar RUT, teléfonos o correos de terceros"] },
  "C360-CARRIER": { agente: "C360-CARRIER", service_id: "svc-c360-carrier", principal: "AI_SERVICE", riesgo: "medio", usa_llm: true,
    herramientas: ["consultar_operacion", "consultar_eta", "registrar_posicion", "subir_documento_propio", "redactar_notificacion"],
    extensiones: ["ver_ofertas_propias", "responder_oferta_propia"],
    subnivel_max: "2a", prepara_para_aprobacion: [], prohibido: [...PROHIBIDO_COMUN, "carrier.assign", "viajes u ofertas de otro transportista"] },
  "C360-ANALYST": { agente: "C360-ANALYST", service_id: "svc-c360-analyst", principal: "AI_SERVICE", riesgo: "bajo", usa_llm: true,
    herramientas: ["consultar_operacion", "listar_alertas", "ver_cotizacion"],
    extensiones: ["consultar_kpi", "listar_eventos_bus"],
    subnivel_max: "1", prepara_para_aprobacion: ["publicar un reporte hacia afuera"], prohibido: [...PROHIBIDO_COMUN, "escribir cualquier registro", "exportar datos personales", "approval.approve"] },
};

/** Herramientas que el orquestador y Core autorizan hoy: las de la ficha más las extensiones si EXTENSIONES_ACTIVAS. */
export function herramientasActivas(agente: AgenteId): readonly NombreHerramienta[] {
  return EXTENSIONES_ACTIVAS ? [...FICHAS[agente].herramientas, ...FICHAS[agente].extensiones] : FICHAS[agente].herramientas;
}

/** Permisos de la identidad de servicio = permisos de sus herramientas activas + ai.execute si usa LLM (D-12). No se asignan a mano. */
export function permisosDe(agente: AgenteId): Permiso[] {
  const set = new Set<Permiso>();
  for (const h of herramientasActivas(agente)) {
    const p = HERRAMIENTAS[h].permiso;
    if (p !== null) set.add(p);
  }
  if (FICHAS[agente].usa_llm && (agente === "C360-MASTER" || EXTENSIONES_ACTIVAS)) set.add("ai.execute");
  return [...set].sort();
}

/** Revisión de coherencia: activas dentro del techo, extensiones fuera, nada prohibido. Devuelve la lista de problemas (vacía = ok). */
export function revisarFichas(): string[] {
  const problemas: string[] = [];
  for (const ag of AGENTES) {
    const techo = techoEfectivo(ag);
    for (const p of permisosDe(ag)) if (!techo.includes(p)) problemas.push(`${ag}: ${p} fuera del techo efectivo`);
    for (const p of EXTENSIONES_APROBADAS[ag]) {
      if ((PERMISOS_PROHIBIDOS_AGENTES as readonly string[]).includes(p)) problemas.push(`${ag}: extensión prohibida ${p}`);
      if (TECHO_IAM_V1[ag].includes(p)) problemas.push(`${ag}: ${p} ya está en IAM v1 (no es extensión)`);
      const usada = p === "ai.execute" ? FICHAS[ag].usa_llm : FICHAS[ag].extensiones.some((h) => HERRAMIENTAS[h].permiso === p);
      if (!usada) problemas.push(`${ag}: extensión ${p} sin uso (sobra)`);
    }
    for (const h of [...FICHAS[ag].herramientas, ...FICHAS[ag].extensiones]) {
      const p = HERRAMIENTAS[h].permiso;
      if (p !== null && (PERMISOS_PROHIBIDOS_AGENTES as readonly string[]).includes(p)) problemas.push(`${ag}: ${h} usa permiso prohibido ${p}`);
    }
    for (const h of FICHAS[ag].extensiones) {
      const p = HERRAMIENTAS[h].permiso;
      if (p === null || TECHO_IAM_V1[ag].includes(p)) problemas.push(`${ag}: ${h} no es extensión (ya cabe en IAM v1)`);
      else if (!EXTENSIONES_APROBADAS[ag].includes(p)) problemas.push(`${ag}: ${h} usa ${p}, que no está en EXTENSIONES_APROBADAS`);
    }
  }
  return problemas;
}

const ORDEN_SUBNIVEL = { "1": 1, "2a": 2, "2b": 3, "3": 4 } as const;

/** Chequeo previo del orquestador. Core repite el chequeo (nunca confía en el orquestador). Las extensiones solo con EXTENSIONES_ACTIVAS. */
export function autorizarHerramienta(
  agente: AgenteId,
  herramienta: string,
  aprobacion: { approval_id: string; estado: "APPROVED" } | null,
): { ok: true; subnivel: z.infer<typeof SubnivelAccion> } | { ok: false; codigo: "HERRAMIENTA_NO_PERMITIDA" | "REQUIERE_APROBACION" | "HERRAMIENTA_DESCONOCIDA" } {
  if (!(herramienta in HERRAMIENTAS)) return { ok: false, codigo: "HERRAMIENTA_DESCONOCIDA" };
  const h = HERRAMIENTAS[herramienta as NombreHerramienta];
  if (!(herramientasActivas(agente) as readonly string[]).includes(herramienta)) return { ok: false, codigo: "HERRAMIENTA_NO_PERMITIDA" };
  if (ORDEN_SUBNIVEL[h.subnivel] > ORDEN_SUBNIVEL[FICHAS[agente].subnivel_max] && !aprobacion) return { ok: false, codigo: "REQUIERE_APROBACION" };
  return { ok: true, subnivel: h.subnivel };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Taxonomía de intenciones y router del Master Bot
// ─────────────────────────────────────────────────────────────────────────────

export const INTENCIONES = [
  "cotizar_flete", "solicitar_transporte", "completar_dato", "estado_operacion", "eta_seguimiento",
  "documento_enviar", "documento_estado", "incidente_reportar", "oferta_responder", "posicion_reportar",
  "asignacion_proponer", "kpi_consulta", "registro_cuenta", "precio_comision",
  "humano", "reclamo", "pago", "legal", "saludo", "cancelar_flujo", "fuera_de_alcance", "desconocida",
] as const;
export const Intencion = z.enum(INTENCIONES);
export type Intencion = z.infer<typeof Intencion>;

/** Intenciones que siempre pasan a una persona (igual que HANDOFF_INTENTS en src/lib/whatsapp/intents.ts). */
export const INTENCIONES_HUMANAS: readonly Intencion[] = ["humano", "reclamo", "pago", "legal"];

/** Tabla intención → agente principal (los secundarios se encadenan por eventos, no por el router). */
export const RUTA_INTENCION: Record<Intencion, AgenteId | "cola-humana" | "C360-MASTER"> = {
  cotizar_flete: "C360-SALES", solicitar_transporte: "C360-OPS", completar_dato: "C360-OPS",
  estado_operacion: "C360-CUSTOMER", eta_seguimiento: "C360-TRACK", documento_enviar: "C360-DOC", documento_estado: "C360-DOC",
  incidente_reportar: "C360-TRACK", oferta_responder: "C360-CARRIER", posicion_reportar: "C360-CARRIER",
  asignacion_proponer: "C360-DISPATCH", kpi_consulta: "C360-ANALYST", registro_cuenta: "C360-MASTER", precio_comision: "C360-SALES",
  humano: "cola-humana", reclamo: "cola-humana", pago: "cola-humana", legal: "cola-humana",
  saludo: "C360-MASTER", cancelar_flujo: "C360-MASTER", fuera_de_alcance: "C360-MASTER", desconocida: "C360-MASTER",
};

/** Intenciones que solo puede pedir cierto tipo de usuario (RBAC antes de rutear). */
export const ROLES_POR_INTENCION: Partial<Record<Intencion, readonly ("mandante" | "transportista" | "admin" | "ops")[]>> = {
  oferta_responder: ["transportista"], posicion_reportar: ["transportista"],
  asignacion_proponer: ["ops", "admin"], kpi_consulta: ["ops", "admin"],
  solicitar_transporte: ["mandante", "ops", "admin"],
};

export const ClasificacionLLM = z.object({
  intenciones: z.array(z.object({ intencion: Intencion, confianza: z.number().min(0).max(1), span: z.string().max(200).optional() })).min(1).max(3),
  idioma: z.string().max(10).optional(),
  modelo: z.string().max(80),
  prompt_version: z.string().regex(/^router@v\d+$/),
}).strict();
export type ClasificacionLLM = z.infer<typeof ClasificacionLLM>;

export const UmbralesRouter = z.object({
  /** Aceptar la intención del LLM si confianza ≥ aceptar. */
  aceptar: z.number().min(0).max(1).default(0.8),
  /** Entre desambiguar y aceptar: preguntar con opciones. Bajo desambiguar: derivar a humano tras N intentos. */
  desambiguar: z.number().min(0).max(1).default(0.55),
  /** Diferencia mínima entre la 1.ª y la 2.ª intención para no preguntar. */
  margen: z.number().min(0).max(1).default(0.15),
  max_intentos_desambiguar: z.number().int().min(1).max(5).default(2),
}).strict();
export type UmbralesRouter = z.infer<typeof UmbralesRouter>;

export type DecisionRouter =
  | { tipo: "rutear"; fuente: "regla" | "llm"; intenciones: Intencion[]; destino: (AgenteId | "cola-humana")[]; confianza: number }
  | { tipo: "desambiguar"; opciones: Intencion[]; pregunta_id: string }
  | { tipo: "derivar_humano"; motivo: "intencion_humana" | "baja_confianza" | "sin_llm" | "rol_no_permitido" | "injection_sospechosa" | "presupuesto" };

/** Router determinista primero; el LLM solo si las reglas no resuelven. Pura y testeable. */
export function decidirRuta(input: {
  reglas: Intencion[]; // resultado de las expresiones regulares (orden de prioridad)
  llm: ClasificacionLLM | null; // null = sin proveedor, sin cupo o apagado
  umbrales: UmbralesRouter;
  intentosDesambiguar: number;
  rolUsuario: "mandante" | "transportista" | "admin" | "ops" | "anonimo";
  injectionSospechosa: boolean;
}): DecisionRouter {
  const destinoDe = (i: Intencion): AgenteId | "cola-humana" => RUTA_INTENCION[i];
  const permitido = (i: Intencion) => {
    const roles = ROLES_POR_INTENCION[i];
    return !roles || (input.rolUsuario !== "anonimo" && roles.includes(input.rolUsuario));
  };
  if (input.injectionSospechosa) return { tipo: "derivar_humano", motivo: "injection_sospechosa" };
  const humana = input.reglas.find((i) => INTENCIONES_HUMANAS.includes(i));
  if (humana) return { tipo: "derivar_humano", motivo: "intencion_humana" };
  if (input.reglas.length > 0) {
    const ok = input.reglas.filter(permitido).slice(0, 3);
    if (ok.length === 0) return { tipo: "derivar_humano", motivo: "rol_no_permitido" };
    return { tipo: "rutear", fuente: "regla", intenciones: ok, destino: [...new Set(ok.map(destinoDe))], confianza: 1 };
  }
  if (!input.llm) return { tipo: "derivar_humano", motivo: "sin_llm" };
  const orden = [...input.llm.intenciones].sort((a, b) => b.confianza - a.confianza);
  const [p, s] = orden;
  if (!p) return { tipo: "derivar_humano", motivo: "baja_confianza" };
  if (INTENCIONES_HUMANAS.includes(p.intencion)) return { tipo: "derivar_humano", motivo: "intencion_humana" };
  const u = input.umbrales;
  // Empate solo si la 2.ª queda bajo el umbral de aceptar: si ambas lo superan, es una intención múltiple.
  const empate = s !== undefined && s.confianza < u.aceptar && p.confianza - s.confianza < u.margen && s.intencion !== p.intencion;
  if (p.confianza >= u.aceptar && !empate) {
    const multi = orden.filter((x) => x.confianza >= u.aceptar).map((x) => x.intencion).filter(permitido);
    if (multi.length === 0) return { tipo: "derivar_humano", motivo: "rol_no_permitido" };
    return { tipo: "rutear", fuente: "llm", intenciones: multi, destino: [...new Set(multi.map(destinoDe))], confianza: p.confianza };
  }
  if (p.confianza >= u.desambiguar && input.intentosDesambiguar < u.max_intentos_desambiguar) {
    return { tipo: "desambiguar", opciones: orden.slice(0, 3).map((x) => x.intencion), pregunta_id: `desamb-${input.intentosDesambiguar + 1}` };
  }
  return { tipo: "derivar_humano", motivo: "baja_confianza" };
}

/** Contexto de sesión. Solo referencias y resúmenes: los datos se leen de Core en cada turno (Core manda). */
export const ContextoSesion = z.object({
  session_id: z.string().uuid(),
  canal: Canal,
  usuario_id: z.string().uuid().nullable(),
  rol_usuario: z.enum(["mandante", "transportista", "admin", "ops", "anonimo"]),
  org_id: z.string().uuid().nullable(),
  correlation_id: z.string().uuid(),
  intencion_activa: Intencion.nullable(),
  agente_activo: AgenteId.nullable(),
  pendientes: z.array(z.object({ intencion: Intencion, estado: z.enum(["en_cola", "en_curso", "esperando_usuario", "esperando_aprobacion", "listo"]) })).max(5),
  refs: z.object({ solicitud_id: z.string().nullable(), operacion_id: OperacionId.nullable(), approval_ids: z.array(z.string().uuid()) }).strict(),
  campos_faltantes: z.array(z.enum(CODIGOS_REGLA)).max(20),
  turnos: z.number().int().min(0),
  intentos_desambiguar: z.number().int().min(0),
  tokens_usados: z.number().int().min(0),
  expira_at: z.string(),
}).strict();
export type ContextoSesion = z.infer<typeof ContextoSesion>;

// ─────────────────────────────────────────────────────────────────────────────
// 6. Sobre de mensaje entre agentes
// ─────────────────────────────────────────────────────────────────────────────

const RE_ISO_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?([+-]\d{2}:\d{2}|Z)$/;
/** ULID (Crockford base32, 26 caracteres): ordena por tiempo. https://github.com/ulid/spec */
const RE_ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const Presupuesto = z.object({
  max_tokens_entrada: z.number().int().min(0),
  max_tokens_salida: z.number().int().min(0),
  max_llamadas_llm: z.number().int().min(0).max(20),
  max_llamadas_herramienta: z.number().int().min(0).max(50),
  /** Saltos restantes entre agentes. Evita bucles A→B→A. */
  max_saltos: z.number().int().min(0).max(8),
  /** Costo máximo en micro-unidades de la moneda configurada (parámetro; sin precios fijos aquí). */
  max_costo_micro: z.number().int().min(0).nullable(),
}).strict();
export type Presupuesto = z.infer<typeof Presupuesto>;

export const Trace = z.object({
  /** W3C Trace Context: 32 hex trace-id, 16 hex span-id. https://www.w3.org/TR/trace-context/ */
  trace_id: z.string().regex(/^[0-9a-f]{32}$/),
  span_id: z.string().regex(/^[0-9a-f]{16}$/),
  parent_span_id: z.string().regex(/^[0-9a-f]{16}$/).nullable(),
  traceparent: z.string().regex(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/),
  saltos: z.array(Participante).max(16),
}).strict();

/** Payload tipado por intención. Lo no listado va como objeto genérico y lo valida el agente destino. */
export const PayloadPorIntencion = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("validar_solicitud"), datos: ValidarSolicitudInput }).strict(),
  z.object({ tipo: z.literal("crear_operacion"), datos: CrearOperacionInput }).strict(),
  z.object({ tipo: z.literal("consultar_operacion"), datos: z.object({ operacion_id: OperacionId }).strict() }).strict(),
  z.object({ tipo: z.literal("texto_usuario"), datos: z.object({ texto: z.string().max(4000), confiable: z.literal(false) }).strict() }).strict(),
  z.object({ tipo: z.literal("resultado"), datos: z.object({ ok: z.boolean(), resumen: z.string().max(1000), refs: z.record(z.string(), z.string()) }).strict() }).strict(),
  z.object({ tipo: z.literal("generico"), datos: z.record(z.string(), z.unknown()) }).strict(),
]);

export const SobreMensaje = z.object({
  schema_version: z.literal("c360-msg/1.1"),
  /** v1.1 (PLAYBOOK §2.1, P-07): marca de datos de prueba; se propaga sin cambios a todo sobre derivado y a los eventos. */
  meta: z.object({ testData: z.boolean() }).strict(),
  message_id: z.string().regex(RE_ULID),
  /** Igual para toda la conversación o el workflow (blueprint §7). UUID. */
  correlation_id: z.string().uuid(),
  /** message_id o event_id que causó este mensaje. null solo en el primer mensaje del canal. */
  causation_id: z.string().regex(RE_ULID).or(z.string().uuid()).nullable(),
  from: Participante,
  to: Participante,
  intent: Intencion,
  payload: PayloadPorIntencion,
  nivel: SubnivelAccion,
  /** Obligatoria si nivel ≠ "1". Mismo formato que en mcp_tools_contrato.ts. */
  idempotency_key: z.string().min(16).max(128).nullable(),
  /** Hora límite absoluta (ISO con offset). Si vence, el destino descarta y responde TIMEOUT. */
  deadline: z.string().regex(RE_ISO_OFFSET),
  budget: Presupuesto,
  trace: Trace,
  /** Organización OPS (hoy no hay tenant_id; blueprint §2 lo pide). */
  org_id: z.string().uuid().nullable(),
  /** Persona responsable (sesión X-C360-Session). null solo para eventos de sistema. */
  usuario_id: z.string().uuid().nullable(),
  approval_ref: z.string().uuid().nullable(),
  data_classification: z.enum(["publico", "interno", "personal", "sensible"]),
  intento: z.number().int().min(1).max(10),
  created_at: z.string().regex(RE_ISO_OFFSET),
}).strict()
  .refine((m) => m.nivel === "1" || m.idempotency_key !== null, { message: "idempotency_key es obligatoria si nivel ≠ 1.", path: ["idempotency_key"] })
  .refine((m) => m.nivel !== "3" || m.approval_ref !== null, { message: "Nivel 3 exige approval_ref (aprobación humana previa).", path: ["approval_ref"] })
  .refine((m) => m.from !== m.to, { message: "from y to no pueden ser iguales.", path: ["to"] });
export type SobreMensaje = z.infer<typeof SobreMensaje>;

/** Huella del sobre (para deduplicar y auditar): sha256 del JSON canónico sin trace ni intento. */
export function huellaSobre(m: SobreMensaje): string {
  const { trace: _t, intento: _i, ...resto } = m;
  return sha256Hex(canonicalJson(resto));
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Event Bus: sobre de evento y catálogo versionado
// ─────────────────────────────────────────────────────────────────────────────

export const RE_EVENT_TYPE = /^[a-z_]+(\.[a-z_]+)+\.v[1-9]\d*$/;

export const EventoBus = z.object({
  event_id: z.string().regex(RE_ULID),
  event_type: z.string().regex(RE_EVENT_TYPE, "dominio.hecho.vN, ej. solicitud.validada.v1"),
  aggregate_type: z.enum(["solicitud", "operacion", "envio", "cotizacion", "asignacion", "documento", "expediente", "incidente", "alerta", "aprobacion", "sistema"]),
  aggregate_id: z.string().min(1).max(80),
  /** Orden estricto por agregado (sin huecos). El consumidor descarta seq ≤ último aplicado. */
  aggregate_seq: z.number().int().min(1),
  occurred_at: z.string().regex(RE_ISO_OFFSET),
  producer: z.union([AgenteId, z.literal("core")]),
  actor: z.object({ tipo: z.enum(["bot", "usuario", "sistema"]), id: z.string().max(80) }).strict(),
  correlation_id: z.string().uuid(),
  causation_id: z.string().nullable(),
  org_id: z.string().uuid().nullable(),
  data_classification: z.enum(["publico", "interno", "personal", "sensible"]),
  /** v1.1: copia de meta.testData del sobre o de la solicitud que lo causó. Un consumidor de producción ignora testData = true fuera de staging. */
  test_data: z.boolean(),
  payload: z.record(z.string(), z.unknown()),
  /** sha256 del payload canónico; permite comprobar que no cambió en tránsito. */
  payload_hash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type EventoBus = z.infer<typeof EventoBus>;

export type DefEvento = { productor: "core" | AgenteId; consumidores: readonly (AgenteId | "core")[]; aggregate: z.infer<typeof EventoBus>["aggregate_type"]; payload: z.ZodTypeAny; existe_hoy: string | null };

const Ref = z.object({ solicitud_id: z.string().optional(), operacion_id: OperacionId.optional(), envio_id: z.string().uuid().optional() }).strict();

/** Catálogo v1. Solo Core produce eventos de hechos ya guardados (outbox en la misma transacción). Los agentes producen solo *.propuesto/*.solicitado vía API. */
export const CATALOGO_EVENTOS = {
  "solicitud.recibida.v1": { productor: "core", consumidores: ["C360-OPS", "C360-ANALYST"], aggregate: "solicitud", payload: Ref.extend({ canal: Canal }), existe_hoy: null },
  "solicitud.validada.v1": { productor: "core", consumidores: ["C360-OPS", "C360-MASTER"], aggregate: "solicitud", payload: Ref.extend({ version_reglas: z.string(), avisos: z.array(z.enum(CODIGOS_REGLA)) }), existe_hoy: null },
  "solicitud.bloqueada.v1": { productor: "core", consumidores: ["C360-OPS", "C360-MASTER", "C360-GUARDIAN"], aggregate: "solicitud", payload: Ref.extend({ motivos: z.array(z.enum(MOTIVOS_BLOQUEADA)).min(1), nivel: z.enum(["2a", "2b", "3"]) }), existe_hoy: null },
  "solicitud.incompleta.v1": { productor: "core", consumidores: ["C360-OPS", "C360-CUSTOMER", "C360-SALES"], aggregate: "solicitud", payload: Ref.extend({ faltantes: z.array(z.enum(CODIGOS_REGLA)) }), existe_hoy: null },
  "cotizacion.borrador_creado.v1": { productor: "core", consumidores: ["C360-SALES", "C360-ANALYST"], aggregate: "cotizacion", payload: z.object({ cotizacion_id: z.string(), motor: z.string() }), existe_hoy: "cost_quotes estado borrador (src/lib/costos/quotes.ts), sin evento" },
  "cotizacion.aprobacion_solicitada.v1": { productor: "core", consumidores: ["C360-MASTER"], aggregate: "cotizacion", payload: z.object({ cotizacion_id: z.string(), approval_id: z.string().uuid() }), existe_hoy: null },
  "operacion.creada.v1": { productor: "core", consumidores: ["C360-DOC", "C360-TRACK", "C360-DISPATCH", "C360-ANALYST"], aggregate: "operacion", payload: Ref.extend({ estado: z.string() }), existe_hoy: null },
  "operacion.actualizada.v1": { productor: "core", consumidores: ["C360-TRACK", "C360-CUSTOMER", "C360-ANALYST"], aggregate: "operacion", payload: Ref.extend({ antes: EstadoOperacion, despues: EstadoOperacion }), existe_hoy: null },
  "operacion.entregada.v1": { productor: "core", consumidores: ["C360-DOC", "C360-CUSTOMER", "C360-ANALYST"], aggregate: "operacion", payload: Ref.extend({ pod_documento_id: z.string() }), existe_hoy: null },
  "operacion.cancelada.v1": { productor: "core", consumidores: ["C360-DOC", "C360-TRACK", "C360-DISPATCH", "C360-CUSTOMER", "C360-CARRIER"], aggregate: "operacion", payload: Ref.extend({ motivo: z.string().max(300) }), existe_hoy: null },
  "expediente.creado.v1": { productor: "core", consumidores: ["C360-DOC", "C360-TRACK"], aggregate: "expediente", payload: Ref, existe_hoy: null },
  "documento.pendiente.v1": { productor: "core", consumidores: ["C360-DOC", "C360-CUSTOMER", "C360-CARRIER"], aggregate: "documento", payload: Ref.extend({ tipo_documento: z.string() }), existe_hoy: null },
  "documento.recibido.v1": { productor: "core", consumidores: ["C360-DOC"], aggregate: "documento", payload: Ref.extend({ documento_id: z.string(), sha256: z.string() }), existe_hoy: "documents (acreditación), sin evento" },
  "documento.validacion_propuesta.v1": { productor: "core", consumidores: ["C360-MASTER"], aggregate: "documento", payload: z.object({ documento_id: z.string(), resultado: z.enum(["valido", "invalido", "dudoso"]), approval_id: z.string().uuid() }), existe_hoy: null },
  "asignacion.propuesta.v1": { productor: "core", consumidores: ["C360-MASTER", "C360-ANALYST"], aggregate: "asignacion", payload: z.object({ run_id: z.string(), envio_id: z.string().uuid(), trace_hash: z.string() }), existe_hoy: "audit ops.asignacion_propuesta (src/lib/ops/allocation.ts)" },
  "asignacion.confirmada.v1": { productor: "core", consumidores: ["C360-DOC", "C360-TRACK", "C360-CARRIER", "C360-CUSTOMER"], aggregate: "asignacion", payload: z.object({ run_id: z.string(), confirmado_por: z.string().uuid() }), existe_hoy: "confirmAllocation (humano), sin evento" },
  "eta.cambiada.v1": { productor: "core", consumidores: ["C360-TRACK", "C360-CUSTOMER"], aggregate: "envio", payload: z.object({ envio_id: z.string().uuid(), eta: z.string(), delta_min: z.number() }), existe_hoy: "ops_eta_snapshots (migración 029), sin evento" },
  "alerta.generada.v1": { productor: "core", consumidores: ["C360-TRACK", "C360-GUARDIAN", "C360-ANALYST"], aggregate: "alerta", payload: z.object({ envio_id: z.string().uuid(), tipo: z.enum(["atraso", "detencion", "sin_senal"]) }), existe_hoy: "ops_alerts + reviewAlerts (src/lib/ops/alerts.ts), sin evento" },
  "alerta.cerrada.v1": { productor: "core", consumidores: ["C360-TRACK", "C360-ANALYST"], aggregate: "alerta", payload: z.object({ alerta_id: z.string(), cerrada_por: z.string() }), existe_hoy: null },
  "incidente.abierto.v1": { productor: "core", consumidores: ["C360-GUARDIAN", "C360-MASTER", "C360-ANALYST"], aggregate: "incidente", payload: z.object({ incidente_id: z.string(), severidad: z.enum(["baja", "media", "alta", "critica"]) }), existe_hoy: null },
  "incidente.escalado.v1": { productor: "core", consumidores: ["C360-MASTER"], aggregate: "incidente", payload: z.object({ incidente_id: z.string(), a: z.string() }), existe_hoy: null },
  "aprobacion.solicitada.v1": { productor: "core", consumidores: ["C360-MASTER"], aggregate: "aprobacion", payload: z.object({ approval_id: z.string().uuid(), accion: z.string(), expira_at: z.string() }), existe_hoy: null },
  "aprobacion.resuelta.v1": { productor: "core", consumidores: ["C360-MASTER", "C360-SALES", "C360-DISPATCH", "C360-DOC", "C360-GUARDIAN"], aggregate: "aprobacion", payload: z.object({ approval_id: z.string().uuid(), estado: z.enum(["APPROVED", "REJECTED", "EXPIRED", "CANCELLED"]) }), existe_hoy: null },
  "presupuesto.umbral.v1": { productor: "core", consumidores: ["C360-MASTER", "C360-ANALYST"], aggregate: "sistema", payload: z.object({ ambito: z.enum(["agente", "conversacion", "dia"]), pct: z.number() }), existe_hoy: "ai_call_log (cupo diario de llamadas), sin evento" },
  "agente.fallo.v1": { productor: "core", consumidores: ["C360-MASTER", "C360-ANALYST"], aggregate: "sistema", payload: z.object({ agente: AgenteId, codigo: z.string() }), existe_hoy: null },
} as const satisfies Record<string, DefEvento>;
export type TipoEvento = keyof typeof CATALOGO_EVENTOS;

export const ConfigEntrega = z.object({
  garantia: z.literal("al-menos-una-vez"),
  max_intentos: z.number().int().min(1).max(20).default(8),
  backoff_base_ms: z.number().int().min(50).default(500),
  backoff_tope_ms: z.number().int().min(1000).default(300_000),
  /** Tiempo de visibilidad/lease del mensaje tomado por un consumidor. */
  lease_ms: z.number().int().min(1000).default(60_000),
  orden: z.literal("por_aggregate_id"),
  dlq: z.literal("ops_bus_dlq"),
}).strict();

// ─────────────────────────────────────────────────────────────────────────────
// 8. Errores, reintentos y circuit breaker
// ─────────────────────────────────────────────────────────────────────────────

export const CODIGOS_ERROR_ORQUESTADOR = {
  // Del contrato MCP (mcp_tools_contrato.ts)
  VALIDACION_FALLIDA: { clase: "negocio", reintentable: false, escala: "usuario" },
  NO_AUTORIZADO: { clase: "seguridad", reintentable: false, escala: "humano" },
  POLICY_RECHAZA: { clase: "seguridad", reintentable: false, escala: "humano" },
  REQUIERE_APROBACION: { clase: "control", reintentable: false, escala: "aprobador" },
  IDEMPOTENCIA_CONFLICTO: { clase: "negocio", reintentable: false, escala: "humano" },
  SERVICIO_NO_DISPONIBLE: { clase: "transitorio", reintentable: true, escala: "ninguno" },
  // Del orquestador
  HERRAMIENTA_NO_PERMITIDA: { clase: "seguridad", reintentable: false, escala: "humano" },
  HERRAMIENTA_DESCONOCIDA: { clase: "seguridad", reintentable: false, escala: "humano" },
  LIMITE_EXCEDIDO: { clase: "transitorio", reintentable: true, escala: "ninguno" },
  TIMEOUT: { clase: "transitorio", reintentable: true, escala: "ninguno" },
  DEADLINE_VENCIDO: { clase: "control", reintentable: false, escala: "humano" },
  LLM_NO_DISPONIBLE: { clase: "proveedor", reintentable: true, escala: "ninguno" },
  LLM_SALIDA_INVALIDA: { clase: "proveedor", reintentable: true, escala: "ninguno" },
  LLM_FILTRO: { clase: "proveedor", reintentable: false, escala: "ninguno" },
  CIRCUITO_ABIERTO: { clase: "transitorio", reintentable: true, escala: "ninguno" },
  PRESUPUESTO_AGOTADO: { clase: "control", reintentable: false, escala: "humano" },
  BUCLE_DETECTADO: { clase: "control", reintentable: false, escala: "humano" },
  INJECTION_SOSPECHOSA: { clase: "seguridad", reintentable: false, escala: "humano" },
  COMPENSACION_FALLIDA: { clase: "control", reintentable: true, escala: "humano" },
  INTERNO: { clase: "transitorio", reintentable: true, escala: "humano" },
} as const satisfies Record<string, { clase: "negocio" | "seguridad" | "control" | "transitorio" | "proveedor"; reintentable: boolean; escala: "ninguno" | "usuario" | "humano" | "aprobador" }>;
export type CodigoErrorOrquestador = keyof typeof CODIGOS_ERROR_ORQUESTADOR;

export const ErrorOrquestador = z.object({
  ok: z.literal(false),
  code: z.enum(Object.keys(CODIGOS_ERROR_ORQUESTADOR) as [CodigoErrorOrquestador, ...CodigoErrorOrquestador[]]),
  error: z.string().max(300),
  message_id: z.string().regex(RE_ULID),
  correlation_id: z.string().uuid(),
  reintentable: z.boolean(),
  retry_after_ms: z.number().int().min(0).nullable(),
  escala: z.enum(["ninguno", "usuario", "humano", "aprobador"]),
}).strict();

/**
 * Espera antes del intento `intento` (1 = primer reintento), con "full jitter":
 * espera = aleatorio(0, min(tope, base · 2^intento)). AWS Architecture Blog, "Exponential Backoff and Jitter".
 * `rnd` se inyecta para que sea testeable. Si hay Retry-After, manda el mayor.
 */
export function esperaReintentoMs(intento: number, baseMs: number, topeMs: number, rnd: () => number, retryAfterMs: number | null = null): number {
  const techo = Math.min(topeMs, baseMs * 2 ** Math.max(0, intento));
  const jitter = Math.floor(Math.max(0, Math.min(1, rnd())) * techo);
  return Math.max(jitter, retryAfterMs ?? 0);
}

export type EstadoCircuito = { estado: "cerrado" | "abierto" | "semiabierto"; fallos: number; abierto_desde: number | null };
export const ConfigCircuito = z.object({
  umbral_fallos: z.number().int().min(1).default(5),
  ventana_ms: z.number().int().min(1000).default(60_000),
  enfriamiento_ms: z.number().int().min(1000).default(30_000),
}).strict();

/** Transición pura del circuit breaker (Fowler, "CircuitBreaker"). */
export function transicionCircuito(
  s: EstadoCircuito,
  evento: "exito" | "fallo" | "tick",
  ahora: number,
  cfg: z.infer<typeof ConfigCircuito>,
): EstadoCircuito {
  if (s.estado === "abierto") {
    if (evento === "tick" && s.abierto_desde !== null && ahora - s.abierto_desde >= cfg.enfriamiento_ms) return { estado: "semiabierto", fallos: s.fallos, abierto_desde: s.abierto_desde };
    return s;
  }
  if (s.estado === "semiabierto") {
    if (evento === "exito") return { estado: "cerrado", fallos: 0, abierto_desde: null };
    if (evento === "fallo") return { estado: "abierto", fallos: s.fallos + 1, abierto_desde: ahora };
    return s;
  }
  if (evento === "exito") return { estado: "cerrado", fallos: 0, abierto_desde: null };
  if (evento === "fallo") {
    const fallos = s.fallos + 1;
    return fallos >= cfg.umbral_fallos ? { estado: "abierto", fallos, abierto_desde: ahora } : { estado: "cerrado", fallos, abierto_desde: null };
  }
  return s;
}

/** Cadena de proveedores por tarea (router por tarea de IA_ASIGNACION.md §4.8). Nombres de modelo por variable de entorno. */
export const PoliticaTarea = z.object({
  tarea: z.string().regex(/^[a-z_]+$/),
  cadena: z.array(z.object({ proveedor: z.enum(["xai", "openai", "gemini", "openai_compatible"]), model_env: z.string().regex(/^[A-Z0-9_]+$/), solo_plan_pago: z.boolean() }).strict()).min(1).max(3),
  fallback_final: z.enum(["reglas", "plantilla_determinista", "derivar_humano"]),
  timeout_ms: z.number().int().min(500).max(60_000),
  max_tokens_salida: z.number().int().min(16).max(8000),
  temperatura: z.number().min(0).max(1),
  datos_permitidos: z.enum(["publico", "interno", "personal"]),
}).strict();
export type PoliticaTarea = z.infer<typeof PoliticaTarea>;

// ─────────────────────────────────────────────────────────────────────────────
// 9. Presupuesto de tokens y costo
// ─────────────────────────────────────────────────────────────────────────────

export const ConfigPresupuesto = z.object({
  por_agente_dia_tokens: z.record(AgenteId, z.number().int().min(0)),
  por_conversacion_tokens: z.number().int().min(0),
  por_dia_tokens_total: z.number().int().min(0),
  /** Reusa el cupo de llamadas que ya existe (AI_DAILY_CALL_LIMIT, src/lib/assistant/usage.ts). */
  por_dia_llamadas: z.number().int().min(0),
  /** Precio por millón de tokens por modelo: PARÁMETRO con fuente y fecha; null = sin cálculo de costo. */
  precios: z.record(z.string(), z.object({ entrada_por_millon: z.number().min(0), salida_por_millon: z.number().min(0), moneda: z.literal("USD"), fuente_url: z.string().url(), visto_el: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict()).nullable(),
  aviso_pct: z.number().min(0).max(100).default(80),
  degradar_pct: z.number().min(0).max(100).default(95),
}).strict();
export type ConfigPresupuesto = z.infer<typeof ConfigPresupuesto>;

export type AccionPresupuesto = "normal" | "avisar" | "degradar" | "cortar";

/** Qué hacer según el consumo (el peor de los tres ámbitos manda). Pura. */
export function evaluarPresupuesto(usado: { agente: number; conversacion: number; dia: number }, topes: { agente: number; conversacion: number; dia: number }, cfg: Pick<ConfigPresupuesto, "aviso_pct" | "degradar_pct">): { accion: AccionPresupuesto; ambito: "agente" | "conversacion" | "dia" | null; pct: number } {
  const pcts = (["agente", "conversacion", "dia"] as const).map((k) => ({ k, pct: topes[k] <= 0 ? 100 : (100 * usado[k]) / topes[k] }));
  const peor = pcts.reduce((a, b) => (b.pct > a.pct ? b : a));
  const accion: AccionPresupuesto = peor.pct >= 100 ? "cortar" : peor.pct >= cfg.degradar_pct ? "degradar" : peor.pct >= cfg.aviso_pct ? "avisar" : "normal";
  return { accion, ambito: accion === "normal" ? null : peor.k, pct: Math.round(peor.pct * 10) / 10 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Caso de evaluación (el set completo está en ORQUESTADOR_SPEC_V1.md §7)
// ─────────────────────────────────────────────────────────────────────────────

export const CasoEval = z.object({
  id: z.string().regex(/^EV-\d{2}$/),
  entrada: z.string(),
  intencion_esperada: Intencion.or(z.literal("n/a")),
  agente: z.union([AgenteId, z.literal("cola-humana"), z.literal("core")]),
  herramientas_esperadas: z.array(z.string()),
  herramientas_prohibidas: z.array(z.string()),
  resultado_esperado: z.string(),
  criterio: z.string(),
  categoria: z.enum(["ruteo", "validacion", "idempotencia", "seguridad", "nivel3", "proveedor", "presupuesto", "bus"]),
}).strict();

// ─────────────────────────────────────────────────────────────────────────────
// 11. EJEMPLOS (datos ficticios, chequeados por tipos)
// ─────────────────────────────────────────────────────────────────────────────

export const EJEMPLO_SOBRE: z.input<typeof SobreMensaje> = {
  schema_version: "c360-msg/1.1",
  meta: { testData: true },
  message_id: "01JD4Q7Z8X9Y0ABCDEFGHJKMNP",
  correlation_id: "6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d",
  causation_id: "01JD4Q7Y00000000000000000A",
  from: "C360-MASTER",
  to: "C360-OPS",
  intent: "solicitar_transporte",
  payload: { tipo: "consultar_operacion", datos: { operacion_id: "360-2611-0001" } },
  nivel: "1",
  idempotency_key: null,
  deadline: "2026-11-17T08:15:00-03:00",
  budget: { max_tokens_entrada: 6000, max_tokens_salida: 800, max_llamadas_llm: 2, max_llamadas_herramienta: 4, max_saltos: 3, max_costo_micro: null },
  trace: {
    trace_id: "4bf92f3577b34da6a3ce929d0e0e4736", span_id: "00f067aa0ba902b7", parent_span_id: null,
    traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01", saltos: ["canal:whatsapp", "C360-MASTER"],
  },
  org_id: null,
  usuario_id: "11111111-2222-4333-8444-555555555555",
  approval_ref: null,
  data_classification: "interno",
  intento: 1,
  created_at: "2026-11-17T08:14:00-03:00",
};

export const EJEMPLO_EVENTO: EventoBus = {
  event_id: "01JD4Q80000000000000000000",
  event_type: "solicitud.validada.v1",
  aggregate_type: "solicitud",
  aggregate_id: "EJEMPLO-sol-0001",
  aggregate_seq: 2,
  occurred_at: "2026-11-17T08:14:05-03:00",
  producer: "core",
  actor: { tipo: "bot", id: "svc-c360-ops" },
  correlation_id: "6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d",
  causation_id: "01JD4Q7Z8X9Y0ABCDEFGHJKMNP",
  org_id: null,
  data_classification: "interno",
  test_data: true,
  payload: { solicitud_id: "EJEMPLO-sol-0001", version_reglas: "val-v1.1", avisos: ["OPCIONAL_AUSENTE"] },
  payload_hash: sha256Hex(canonicalJson({ solicitud_id: "EJEMPLO-sol-0001", version_reglas: "val-v1.1", avisos: ["OPCIONAL_AUSENTE"] })),
};

export const EJEMPLO_POLITICA_ROUTER: PoliticaTarea = {
  tarea: "clasificar_intencion",
  cadena: [
    { proveedor: "xai", model_env: "AI_ROUTER_XAI_MODEL", solo_plan_pago: true },
    { proveedor: "openai", model_env: "AI_ROUTER_OPENAI_MODEL", solo_plan_pago: true },
  ],
  fallback_final: "reglas",
  timeout_ms: 4000,
  max_tokens_salida: 120,
  temperatura: 0,
  datos_permitidos: "interno",
};
