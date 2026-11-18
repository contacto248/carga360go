/**
 * Carga360go · Contrato de dos herramientas MCP: `validar_solicitud` y `crear_operacion`.
 *
 * Contrato v1.1 (schema de solicitud 1.1.0, reglas val-v1.1), cerrado el 17-11-2026 (hora de Chile, UTC−3). No está en el repo ni en producción,
 * y este bot no se lo encargó a Cursor. Alineado con out/equipo/operaciones/PLAYBOOK_OPS_DISPATCH.md v1.0 (§2.1 marca de prueba, §3 estados de
 * validación, §4 ID, §6 máquina de estados, §8 niveles). Decisiones: ORQUESTADOR_SPEC_V1.md §8.
 * Acompaña a out/arquitectura/VALIDACION_DATOS.md (§12) y sigue a FLUJO_E2E_V1.md (§2 ID de operación, §6 API, §9 MCP).
 * Base del repo: contacto248/carga360go, release/2026-11-15 @ 84da638 (revisado de nuevo @ b290274).
 *
 * Reglas de diseño:
 *  - Las herramientas MCP **solo llaman a la API de Carga360 Core** (CoreApiClient). Nunca a la DB.
 *  - El servidor **revalida siempre**. Nunca confía en lo que mande el cliente MCP (ni en `valido`, ni en `normalizada`, ni en el hash).
 *  - Motor determinista, sin LLM. La IA solo propone campos (`meta.suggestedFields`).
 *  - zod 3 (el repo usa zod ^3.25.76). El JSON Schema del inputSchema sale de zod-to-json-schema.
 *
 * Verificado: compila con `tsc --noEmit --strict` (typescript 5.9.3, zod 3.25.76, zod-to-json-schema 3.25.2).
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Catálogos compartidos (calzan con el repo)
// ─────────────────────────────────────────────────────────────────────────────

/** Igual a EQUIPMENT_IDS en src/lib/types.ts. */
export const EQUIPMENT_IDS = [
  "rampla_plana", "sider", "furgon_seco", "refrigerado", "cama_baja", "tolva",
  "estanque", "portacontenedor", "camion_34", "portaautos", "peligrosa", "otro",
] as const;
export const EquipmentId = z.enum(EQUIPMENT_IDS);

export const Canal = z.enum(["web", "app", "whatsapp", "bot", "telefono", "api"]);
export type Canal = z.infer<typeof Canal>;

export const Severidad = z.enum(["BLOQUEA", "AVISA", "AUTOCOMPLETA"]);
export type Severidad = z.infer<typeof Severidad>;

/** Todos los códigos de la tabla de reglas (VALIDACION_DATOS.md §3.2), más OPCIONAL_AUSENTE (contrato de FLUJO_E2E_V1.md §4). */
export const CODIGOS_REGLA = [
  "SCHEMA_INVALIDO", "SCHEMA_VERSION_NO_SOPORTADA", "FALTA_IDEMPOTENCIA", "IDEMPOTENCIA_CONFLICTO",
  "FALTA_ORIGEN", "FALTA_DESTINO", "COMUNA_DESCONOCIDA", "COMUNA_AMBIGUA", "COMUNA_NORMALIZADA",
  "REGION_AUTOCOMPLETADA", "REGION_NO_COINCIDE", "COMUNA_FUERA_CATALOGO", "COORDENADAS_FUERA_COMUNA",
  "MISMO_ORIGEN_DESTINO", "MISMA_COMUNA", "FALTA_TIPO_CARGA", "TIPO_CARGA_SUGERIDO", "FALTA_DESCRIPCION",
  "FALTA_CAMPO_EQUIPO", "OPCION_INVALIDA", "FALTA_PESO", "UNIDAD_DESCONOCIDA", "UNIDAD_CONVERTIDA",
  "PESO_FUERA_RANGO", "PESO_PROBABLE_KG", "CAPACIDAD_EXCEDIDA_TIPO_CAMION", "PESO_SOBRE_LIMITE_VIAL",
  "DIMENSIONES_INCOHERENTES", "DIMENSION_FUERA_RANGO", "SOBREDIMENSION", "DENSIDAD_IMPROBABLE",
  "FALTA_FECHA_RETIRO", "FECHA_INVALIDA", "FECHA_PASADA", "FECHA_MUY_LEJANA", "VENTANA_INVERTIDA",
  "ENTREGA_ANTES_RETIRO", "RETIRO_MUY_PRONTO", "PLAZO_TRANSITO_INSUFICIENTE", "PLAZO_OFERTAS_FUERA_RANGO",
  "PRESUPUESTO_INVALIDO", "PELIGROSA_SIN_CLASE", "PELIGROSA_CLASE_INVALIDA", "PELIGROSA_SIN_ONU",
  "ONU_FORMATO_INVALIDO", "PELIGROSA_SIN_HDS", "PELIGROSA_EQUIPO_INCOHERENTE", "REFRIGERADA_SIN_RANGO",
  "REFRIGERADA_RANGO_INVERTIDO", "REFRIGERADA_OBJETIVO_AUTOCOMPLETADO", "TEMPERATURA_FUERA_RANGO",
  "MINERA_DETECTADA", "MINERA_SIN_FAENA", "MINERA_SIN_INDUCCION", "SIN_ACREDITACION", "CONTACTO_INVALIDO",
  "CONTACTO_DE_CUENTA", "TELEFONO_INVALIDO", "TELEFONO_NORMALIZADO", "EMAIL_INVALIDO",
  "SUGERIDO_REVALIDADO", "SUGERIDO_REQUIERE_CONFIRMACION", "POSIBLE_DUPLICADO", "OPCIONAL_AUSENTE",
  // v1.1 · códigos vigentes del PLAYBOOK_OPS_DISPATCH.md (§3.2, §3.3, §10.4; decisión P-02)
  "FALTA_DIRECCION_RETIRO", "FALTA_DIRECCION_ENTREGA", "FALTA_DIMENSIONES", "FALTA_VENTANA_ENTREGA", "CAPACIDAD_VOLUMEN_EXCEDIDA",
  "NIVEL3_PRECIO", "NIVEL3_PAGO", "NIVEL3_BORRADO", "NIVEL3_SEGURIDAD", "DATOS_REALES_NO_AUTORIZADOS", "CUENTA_NO_HABILITADA",
  "PELIGROSA_SIN_AUTORIZACION", "SOBREDIMENSION_SIN_PERMISO", "FAENA_SIN_ACREDITACION", "FUERA_DE_COBERTURA",
] as const;
/** Los 15 códigos que agrega el playbook en v1.1 (los 63 de VALIDACION §3.2 + OPCIONAL_AUSENTE son los anteriores). */
export const CODIGOS_PLAYBOOK_V11 = CODIGOS_REGLA.slice(64);
export const CodigoRegla = z.enum(CODIGOS_REGLA);
export type CodigoRegla = z.infer<typeof CodigoRegla>;

/** Errores estándar de las herramientas (primer nivel de la respuesta). */
export const CODIGOS_ERROR_HERRAMIENTA = [
  "VALIDACION_FALLIDA", "NO_AUTORIZADO", "POLICY_RECHAZA", "REQUIERE_APROBACION",
  "IDEMPOTENCIA_CONFLICTO", "SERVICIO_NO_DISPONIBLE",
] as const;
export const CodigoErrorHerramienta = z.enum(CODIGOS_ERROR_HERRAMIENTA);

/**
 * SOLO PRUEBAS. Códigos que usan los sets de prueba (CASOS_PRUEBA_DISPATCH.md) para nombrar un rechazo.
 * NO forman parte de ningún enum de producción (CODIGOS_REGLA, CODIGOS_ERROR_HERRAMIENTA, CODIGOS_ERROR_ORQUESTADOR):
 * en producción una transición inválida es POLICY_RECHAZA con regla_policy = "transicion_no_permitida".
 */
export const CODIGOS_SOLO_PRUEBA = ["TRANSICION_INVALIDA"] as const;

/** Nivel de la acción (VALIDACION_DATOS.md §5): 1 lectura; 2 escritura operativa (2a propia, 2b afecta a terceros); 3 con aprobación previa. */
export const NivelAccion = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const SubnivelAccion = z.enum(["1", "2a", "2b", "3"]);

export const VERSION_REGLAS = "val-v1.1" as const;
/** v1.1 agrega meta.testData (PLAYBOOK §2.1, P-07). 1.0.0 se sigue aceptando en la entrada. */
export const VERSION_SCHEMA_SOLICITUD = "1.1.0" as const;
export const VERSIONES_SCHEMA_SOPORTADAS = ["1.0.0", "1.1.0"] as const;
export const VERSION_TERRITORIO = "cut-2018.v1" as const;

// Formatos
const RE_ISO_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_E164_CL = /^\+56\d{9}$/;
const RE_CUT_COMUNA = /^\d{5}$/;
const RE_CUT_REGION = /^\d{2}$/;
const RE_SHA256 = /^[a-f0-9]{64}$/;
/** Subconjunto estricto del regex de Core (operacion.ts: empieza alfanumérico, 8 a 128). D-14. */
const RE_IDEMPOTENCIA = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const RE_JSON_POINTER = /^(\/[^/]+)+$|^$/;

/**
 * ID público de operación: 360-YYMM-NNNN (FLUJO_E2E_V1.md §2).
 * Desde el PR #52 (fusionado el 17-11 07:48) y el #58 (YYMM en America/Santiago, 08:20) el formato existe en src/lib/ops/operacion.ts
 * (codigoOperacion, MAX_CORRELATIVO = 9999). El contrato v1.1 sigue al PLAYBOOK §4 (5 dígitos sobre 9999); Core debe subir su tope (D-14). No se confunde con el lead `C360-XXXXXX`
 * (src/lib/agent/store.ts), el seguimiento `SEG-XXXXXX` (src/lib/agent/tracking.ts) ni el folio `C360-YYYYMMDD-XXXXXXXX` (src/lib/registration-pdf.ts).
 */
/** D-14 (v1.1, PLAYBOOK §4): 4 dígitos y, sobre 9999, 5 (360-2611-10000). Core hoy topa en 9999 (MAX_CORRELATIVO): se sube en el PR ops-operacion-estados. */
export const RE_OPERACION_ID = /^360-\d{2}(0[1-9]|1[0-2])-\d{4,5}$/;
export const OperacionId = z.string().regex(RE_OPERACION_ID, "Formato 360-YYMM-NNNN");

// ─────────────────────────────────────────────────────────────────────────────
// 2. Solicitud de entrada (espejo zod del JSON Schema v1, VALIDACION_DATOS.md §2.2)
// ─────────────────────────────────────────────────────────────────────────────

const Coords = z.object({
  lat: z.number().min(-56.6).max(-17.4),
  lng: z.number().min(-109.5).max(-66.0),
  source: z.enum(["usuario", "gps", "geocodificador", "catalogo"]).optional(),
}).strict();

const Place = z.object({
  address: z.string().max(200).optional(),
  comuna: z.string().min(2).max(80).optional(),
  comunaCut: z.string().regex(RE_CUT_COMUNA).optional(),
  region: z.string().max(80).optional(),
  regionCut: z.string().regex(RE_CUT_REGION).optional(),
  coords: Coords.optional(),
  siteType: z.enum(["bodega", "puerto", "faena_minera", "planta", "obra", "domicilio", "otro"]).optional(),
  reference: z.string().max(200).optional(),
}).strict().refine((p) => Boolean(p.comuna || p.comunaCut), { message: "Indica comuna o comunaCut." });

const Window = z.object({
  date: z.string().regex(RE_DIA).optional(),
  from: z.string().regex(RE_ISO_OFFSET).optional(),
  to: z.string().regex(RE_ISO_OFFSET).optional(),
  flexible: z.boolean().optional(),
}).strict().refine((w) => Boolean(w.date || w.from), { message: "Indica date o from." });

const Accreditation = z.object({
  id: z.enum([
    "licencia", "cedula", "hoja_vida", "antecedentes", "manejo_defensivo", "induccion", "padron", "revision",
    "permiso", "soap", "seguro_carga", "gases", "acred_ingreso", "res_sanitaria", "aut_peligrosa",
    "permiso_sobredim", "acreditacion_minera", "induccion_faena", "otra",
  ]),
  detail: z.string().max(120).optional(),
}).strict();

const SuggestedField = z.object({
  path: z.string().regex(RE_JSON_POINTER),
  source: z.enum(["ia", "regla", "cuenta", "historial"]),
  model: z.string().max(80).optional(),
  confidence: z.number().min(0).max(1).optional(),
  confirmedByUser: z.boolean().default(false),
}).strict();

const Quantity = <U extends [string, ...string[]]>(units: U) =>
  z.object({ value: z.number().positive(), unit: z.enum(units) }).strict();

export const SolicitudV1 = z.object({
  meta: z.object({
    schemaVersion: z.enum(VERSIONES_SCHEMA_SOPORTADAS),
    channel: Canal,
    /** v1.1 (PLAYBOOK §2.1). Se usa además de la llave EJEMPLO- y de notes con EJEMPLO. Solo con schemaVersion 1.1.0. */
    testData: z.boolean().optional(),
    idempotencyKey: z.string().regex(RE_IDEMPOTENCIA),
    submittedAt: z.string().regex(RE_ISO_OFFSET).optional(),
    locale: z.literal("es-CL").optional(),
    botId: z.string().max(80).optional(),
    conversationId: z.string().max(80).optional(),
    draftLeadCode: z.string().regex(/^C360-[A-Z0-9]{6}$/).optional(),
    suggestedFields: z.array(SuggestedField).max(50).optional(),
  }).strict(),
  origin: Place,
  destination: Place,
  equipment: EquipmentId,
  cargo: z.object({
    description: z.string().min(3).max(500),
    cargoType: z.enum(["general", "pallets", "granel_solido", "granel_liquido", "contenedor", "maquinaria", "vehiculos", "refrigerada", "peligrosa", "mudanza", "otro"]).optional(),
    weight: Quantity(["kg", "t"]),
    dimensions: z.object({
      length: z.number().positive(), width: z.number().positive(), height: z.number().positive(), unit: z.enum(["cm", "m"]),
    }).strict().optional(),
    volume: Quantity(["m3", "l"]).optional(),
    pallets: z.number().int().min(0).max(100).optional(),
    packages: z.number().int().min(0).max(100000).optional(),
    indivisible: z.boolean().optional(),
    specs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }).strict(),
  pickupWindow: Window,
  deliveryWindow: Window.optional(),
  requirements: z.object({
    dangerous: z.object({
      unNumber: z.string().regex(/^(UN|ONU)? ?[0-9]{4}$/).optional(),
      class: z.string().regex(/^[1-9](\.[1-6])?$/).optional(),
      packingGroup: z.enum(["I", "II", "III"]).optional(),
      properShippingName: z.string().max(200).optional(),
      sdsAvailable: z.boolean().optional(),
    }).strict().optional(),
    refrigerated: z.object({
      targetC: z.number().min(-80).max(60).optional(),
      minC: z.number().min(-80).max(60).optional(),
      maxC: z.number().min(-80).max(60).optional(),
    }).strict().optional(),
    mining: z.object({
      enabled: z.boolean().optional(),
      faena: z.string().max(120).optional(),
      mandanteMinero: z.string().max(120).optional(),
      inductionRequired: z.boolean().optional(),
      accreditations: z.array(Accreditation).max(20).optional(),
    }).strict().optional(),
    accreditations: z.array(Accreditation).max(20).optional(),
  }).strict().optional(),
  contact: z.object({
    name: z.string().min(2).max(120).optional(),
    phone: z.string().max(30).optional(),
    email: z.string().email().max(160).optional(),
    preferredChannel: z.enum(["whatsapp", "telefono", "email"]).optional(),
    useAccountContact: z.boolean().optional(),
  }).strict().refine((c) => Boolean(c.phone || c.email || c.useAccountContact === true), { message: "Indica teléfono, correo o useAccountContact." }).optional(),
  commercial: z.object({
    budgetClp: z.number().int().min(0).nullable().optional(),
    offerHours: z.number().int().min(1).max(720).nullable().optional(),
    allowImprove: z.boolean().nullable().optional(),
    soloVerificados: z.boolean().optional(),
    inmediata: z.boolean().optional(),
  }).strict().optional(),
  notes: z.string().max(2000).nullable().optional(),
}).strict().refine((x) => x.meta.testData === undefined || x.meta.schemaVersion === "1.1.0", { message: "meta.testData exige schemaVersion 1.1.0.", path: ["meta", "testData"] });
export type SolicitudV1 = z.infer<typeof SolicitudV1>;

// ─────────────────────────────────────────────────────────────────────────────
// 3. Solicitud normalizada (salida de validar_solicitud y entrada de crear_operacion)
//    Comuna y región con CUT. Unidades SI: kg, m, m³ y °C. Fechas ISO 8601 con offset
//    (America/Santiago, o America/Punta_Arenas en Magallanes y Pacific/Easter en Isla de Pascua). Teléfono E.164.
// ─────────────────────────────────────────────────────────────────────────────

const LugarNormalizado = z.object({
  comuna: z.object({ cut: z.string().regex(RE_CUT_COMUNA), nombre: z.string().min(2) }).strict(),
  region: z.object({ cut: z.string().regex(RE_CUT_REGION), nombre: z.string().min(2), slugCatalogo: z.string().min(2) }).strict(),
  /** Nombre de CITIES (src/lib/catalog.ts) que usa match.ts. */
  ciudadCatalogo: z.string().min(2),
  zonaHoraria: z.enum(["America/Santiago", "America/Punta_Arenas", "Pacific/Easter"]),
  direccion: z.string().max(200).nullable(),
  coords: Coords.nullable(),
  tipoSitio: z.enum(["bodega", "puerto", "faena_minera", "planta", "obra", "domicilio", "otro"]).nullable(),
}).strict();

const VentanaNormalizada = z.object({
  /** Día en hora local (compatibilidad con loads.pickup_date). */
  dia: z.string().regex(RE_DIA),
  desde: z.string().regex(RE_ISO_OFFSET).nullable(),
  hasta: z.string().regex(RE_ISO_OFFSET).nullable(),
  flexible: z.boolean(),
}).strict();

export const SolicitudNormalizada = z.object({
  schemaVersion: z.literal(VERSION_SCHEMA_SOLICITUD),
  /** v1.1: true si la solicitud lleva las marcas de prueba (esSolicitudDePrueba). */
  testData: z.boolean(),
  versionTerritorio: z.literal(VERSION_TERRITORIO),
  canal: Canal,
  origen: LugarNormalizado,
  destino: LugarNormalizado,
  equipo: EquipmentId,
  carga: z.object({
    descripcion: z.string().min(3).max(500),
    tipo: z.string().nullable(),
    pesoKg: z.number().positive(),
    /** Derivado para Core (loads.weight_t = pesoKg / 1000, con 3 decimales). */
    pesoT: z.number().positive(),
    dimensionesM: z.object({ largo: z.number().positive(), ancho: z.number().positive(), alto: z.number().positive() }).strict().nullable(),
    volumenM3: z.number().positive().nullable(),
    pallets: z.number().int().min(0).nullable(),
    bultos: z.number().int().min(0).nullable(),
    indivisible: z.boolean(),
    specs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  }).strict(),
  retiro: VentanaNormalizada,
  entrega: VentanaNormalizada.nullable(),
  requisitos: z.object({
    peligrosa: z.object({ numeroOnu: z.string().regex(/^UN\d{4}$/).nullable(), clase: z.string().regex(/^[1-9](\.[1-6])?$/), grupoEmbalaje: z.enum(["I", "II", "III"]).nullable(), hds: z.boolean() }).strict().nullable(),
    refrigerada: z.object({ objetivoC: z.number(), minC: z.number().nullable(), maxC: z.number().nullable() }).strict().nullable(),
    minera: z.object({ faena: z.string().nullable(), induccion: z.boolean().nullable(), acreditaciones: z.array(Accreditation) }).strict().nullable(),
    acreditaciones: z.array(Accreditation),
  }).strict(),
  contacto: z.object({
    nombre: z.string().nullable(),
    telefonoE164: z.string().regex(RE_E164_CL).nullable(),
    email: z.string().email().nullable(),
    canalPreferido: z.enum(["whatsapp", "telefono", "email"]).nullable(),
    usaContactoCuenta: z.boolean(),
  }).strict(),
  comercial: z.object({
    presupuestoClp: z.number().int().min(0).nullable(),
    horasOfertas: z.number().int().min(1).max(720).nullable(),
    permiteMejorar: z.boolean().nullable(),
    soloVerificados: z.boolean(),
    inmediata: z.boolean(),
  }).strict(),
  notas: z.string().max(2000).nullable(),
  sugeridos: z.array(SuggestedField),
}).strict();
export type SolicitudNormalizada = z.infer<typeof SolicitudNormalizada>;

// ─────────────────────────────────────────────────────────────────────────────
// 4. Herramienta 1: validar_solicitud (solo lectura, sin efectos secundarios)
// ─────────────────────────────────────────────────────────────────────────────

export const ValidarSolicitudInput = z.object({
  solicitud: SolicitudV1,
  canal: Canal,
  modo: z.enum(["solo_validar", "validar_y_normalizar"]).default("validar_y_normalizar"),
}).strict();
export type ValidarSolicitudInput = z.input<typeof ValidarSolicitudInput>;

export const Hallazgo = z.object({
  codigo: CodigoRegla,
  severidad: Severidad,
  /** JSON Pointer (RFC 6901) al campo de la solicitud de entrada. "" = la solicitud completa. */
  campo: z.string().regex(RE_JSON_POINTER),
  mensaje: z.string().min(1).max(300),
  /** Qué hacer, en palabras simples. Una sugerencia nunca se aplica sola. */
  sugerencia: z.string().max(300).nullable(),
  params: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type Hallazgo = z.infer<typeof Hallazgo>;

export const Autocompletado = z.object({
  codigo: CodigoRegla,
  campo: z.string().regex(RE_JSON_POINTER),
  valorOrigen: z.unknown(),
  valorDestino: z.unknown(),
}).strict();

export const ValidarSolicitudOutput = z.object({
  /** true solo si no hay ningún BLOQUEA. */
  valido: z.boolean(),
  /** Hallazgos BLOQUEA. */
  errores: z.array(Hallazgo.extend({ severidad: z.literal("BLOQUEA") })),
  /** Hallazgos AVISA (y AUTOCOMPLETA con mensaje al usuario). */
  avisos: z.array(Hallazgo.extend({ severidad: z.enum(["AVISA", "AUTOCOMPLETA"]) })),
  /** null si modo = solo_validar o si valido = false. */
  normalizada: SolicitudNormalizada.nullable(),
  autocompletados: z.array(Autocompletado),
  /** Nivel que tendría la acción siguiente (crear la operación). Lo calcula la policy del servidor. */
  nivel_accion: NivelAccion,
  subnivel_accion: SubnivelAccion,
  version_reglas: z.literal(VERSION_REGLAS),
  /** sha256 del JSON canónico de `normalizada` (o de la entrada si no hay normalizada) + version_reglas. Es una referencia, no una autorización. */
  validacion_hash: z.string().regex(RE_SHA256),
  /** Puente al contrato de FLUJO_E2E_V1.md §4. */
  resultado: z.enum(["validada", "validada_con_avisos", "incompleta"]),
}).strict().superRefine((o, ctx) => {
  if (o.valido !== (o.errores.length === 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "valido debe ser igual a (errores.length === 0)." });
  if (!o.valido && o.normalizada !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sin validez no se entrega normalizada." });
});
export type ValidarSolicitudOutput = z.infer<typeof ValidarSolicitudOutput>;

// ─────────────────────────────────────────────────────────────────────────────
// 5. Herramienta 2: crear_operacion (escritura Nivel 2a, idempotente por clave)
// ─────────────────────────────────────────────────────────────────────────────

export const Actor = z.object({
  tipo: z.enum(["bot", "usuario"]),
  /** Bot que llama (ej. "operaciones"). Obligatorio si tipo = bot. */
  bot_id: z.string().min(2).max(80).nullable(),
  /** Persona en cuyo nombre se actúa (sesión X-C360-Session). Siempre obligatorio: un bot no actúa sin un usuario responsable. */
  usuario_id: z.string().uuid(),
  canal: Canal,
}).strict().refine((a) => a.tipo !== "bot" || Boolean(a.bot_id), { message: "bot_id es obligatorio para tipo = bot." });

export const CrearOperacionInput = z.object({
  solicitud: SolicitudNormalizada,
  idempotency_key: z.string().regex(RE_IDEMPOTENCIA),
  actor: Actor,
  /** Id del informe de validación (validation_reports.id) o de la solicitud OPS (ops_requests.id). */
  validacion_ref: z.string().min(8).max(80).optional(),
  /** Hash que devolvió validar_solicitud. */
  validacion_hash: z.string().regex(RE_SHA256).optional(),
  lead_code: z.string().regex(/^C360-[A-Z0-9]{6}$/).nullable().optional(),
}).strict().refine((i) => Boolean(i.validacion_ref || i.validacion_hash), { message: "Indica validacion_ref o validacion_hash." });
export type CrearOperacionInput = z.input<typeof CrearOperacionInput>;

/** Estados v1.1: FLUJO_E2E_V1.md §3 ampliado por PLAYBOOK_OPS_DISPATCH.md §6 (en_asignacion, asignada, entregada; bloqueada en la solicitud). */
export const ESTADOS_OPERACION = ["abierta", "documentacion_pendiente", "en_asignacion", "asignada", "en_curso", "entregada", "cerrada", "cancelada"] as const;
export const EstadoOperacion = z.enum(ESTADOS_OPERACION);
export const ESTADOS_SOLICITUD = ["recibida", "estructurada", "incompleta", "validada", "bloqueada", "convertida", "descartada"] as const;
export const EstadoSolicitud = z.enum(ESTADOS_SOLICITUD);
/** Subestados del viaje (src/lib/viaje.ts) dentro de en_curso. */
export const ESTADOS_VIAJE = ["asignado", "en_camino", "retirado", "en_transito", "entregado", "incidencia"] as const;
export const EstadoViaje = z.enum(ESTADOS_VIAJE);

type Transiciones<E extends string> = Readonly<Record<E, readonly E[]>>;
/** PLAYBOOK §6 (diagrama). Todo lo que no está aquí se rechaza. */
export const TRANSICIONES_SOLICITUD: Transiciones<(typeof ESTADOS_SOLICITUD)[number]> = {
  recibida: ["estructurada"],
  estructurada: ["incompleta", "validada", "bloqueada"],
  incompleta: ["estructurada", "descartada"],
  validada: ["convertida"],
  bloqueada: ["estructurada", "descartada"],
  convertida: [],
  descartada: [],
};
/**
 * PLAYBOOK §6. en_curso → cancelada sale del texto de §6 («cancelar una operación asignada o en_curso … Nivel 2b»),
 * aunque el diagrama no la dibuja. en_curso → entregada exige viaje «entregado» + POD aceptado (§7.7); lo valida Core.
 */
export const TRANSICIONES_OPERACION: Transiciones<(typeof ESTADOS_OPERACION)[number]> = {
  abierta: ["documentacion_pendiente", "en_asignacion", "cancelada"],
  documentacion_pendiente: ["abierta"],
  en_asignacion: ["asignada", "abierta", "cancelada"],
  asignada: ["en_curso", "cancelada"],
  en_curso: ["entregada", "cancelada"],
  entregada: ["cerrada"],
  cerrada: [],
  cancelada: [],
};
export const TRANSICIONES_VIAJE: Transiciones<(typeof ESTADOS_VIAJE)[number]> = {
  asignado: ["en_camino", "incidencia"],
  en_camino: ["retirado", "incidencia"],
  retirado: ["en_transito", "incidencia"],
  en_transito: ["entregado", "incidencia"],
  incidencia: ["en_camino", "retirado", "en_transito", "entregado"],
  entregado: [],
};
export type Maquina = "solicitud" | "operacion" | "viaje";
const TABLAS = { solicitud: TRANSICIONES_SOLICITUD, operacion: TRANSICIONES_OPERACION, viaje: TRANSICIONES_VIAJE } as const;

/** Función pura. En producción un rechazo se informa como POLICY_RECHAZA (regla_policy "transicion_no_permitida"); nunca con un código solo de pruebas. */
export function transicionPermitida(maquina: Maquina, desde: string, hacia: string): boolean {
  const t = TABLAS[maquina] as Readonly<Record<string, readonly string[]>>;
  return (t[desde] ?? []).includes(hacia);
}

/** PLAYBOOK §3.3: motivos que dejan la solicitud BLOQUEADA (no se resuelve completando un dato). */
export const MOTIVOS_BLOQUEADA = [
  "IDEMPOTENCIA_CONFLICTO", "SCHEMA_VERSION_NO_SOPORTADA", "NIVEL3_PRECIO", "NIVEL3_PAGO", "NIVEL3_BORRADO", "NIVEL3_SEGURIDAD",
  "DATOS_REALES_NO_AUTORIZADOS", "CUENTA_NO_HABILITADA", "PELIGROSA_SIN_AUTORIZACION", "SOBREDIMENSION_SIN_PERMISO",
  "FAENA_SIN_ACREDITACION", "FUERA_DE_COBERTURA",
] as const satisfies readonly CodigoRegla[];
/** PLAYBOOK §3.1: derivación determinista. Si hay códigos de ambas familias, gana BLOQUEADA. REQUIERE_APROBACION (de Core) también bloquea. */
export function derivarEstadoValidacion(hallazgos: readonly { codigo: string; severidad: "BLOQUEA" | "AVISA" | "AUTOCOMPLETA" }[], coreRequiereAprobacion = false): "VALIDA" | "INCOMPLETA" | "BLOQUEADA" {
  if (coreRequiereAprobacion || hallazgos.some((h) => (MOTIVOS_BLOQUEADA as readonly string[]).includes(h.codigo))) return "BLOQUEADA";
  if (hallazgos.some((h) => h.severidad === "BLOQUEA")) return "INCOMPLETA";
  return "VALIDA";
}

/** PLAYBOOK §2.1: llave EJEMPLO- + notes que empieza con EJEMPLO + (v1.1) meta.testData = true. Sin las marcas ⇒ BLOQUEADA DATOS_REALES_NO_AUTORIZADOS. */
export function esSolicitudDePrueba(meta: { idempotencyKey: string; testData?: boolean | undefined }, notes: string | null | undefined): boolean {
  return meta.idempotencyKey.startsWith("EJEMPLO-") && (notes ?? "").trimStart().startsWith("EJEMPLO") && meta.testData !== false;
}

/**
 * Niveles de acciones clave (PLAYBOOK §7.4, §8 y P-04; reemplaza a D-03 anterior).
 * confirmacion_humana_previa: la ejecuta una persona con el permiso indicado, antes; ningún agente ni el sistema la ejecuta.
 */
export const NIVEL_ACCIONES = {
  proponer_asignacion: { subnivel: "2a", confirmacion_humana_previa: false, aprobacion_previa: false, ejecuta: "agente", permiso_persona: null },
  confirmar_asignacion: { subnivel: "2b", confirmacion_humana_previa: true, aprobacion_previa: false, ejecuta: "persona", permiso_persona: "asignacion.ejecutar" },
  reasignar: { subnivel: "2b", confirmacion_humana_previa: true, aprobacion_previa: false, ejecuta: "persona", permiso_persona: "asignacion.ejecutar" },
  cancelar_operacion_asignada: { subnivel: "2b", confirmacion_humana_previa: false, aprobacion_previa: false, ejecuta: "persona", permiso_persona: "shipment.cancel" },
  cambiar_precio_o_tarifa: { subnivel: "3", confirmacion_humana_previa: true, aprobacion_previa: true, ejecuta: "persona", permiso_persona: "approval.approve" },
  confirmar_con_tarifa_modificada: { subnivel: "3", confirmacion_humana_previa: true, aprobacion_previa: true, ejecuta: "persona", permiso_persona: "approval.approve" },
  cobro_pago_reembolso: { subnivel: "3", confirmacion_humana_previa: true, aprobacion_previa: true, ejecuta: "persona", permiso_persona: "approval.approve" },
  borrar_datos: { subnivel: "3", confirmacion_humana_previa: true, aprobacion_previa: true, ejecuta: "persona", permiso_persona: "approval.approve" },
  encender_flag: { subnivel: "3", confirmacion_humana_previa: true, aprobacion_previa: true, ejecuta: "persona", permiso_persona: "approval.approve" },
} as const satisfies Record<string, { subnivel: z.infer<typeof SubnivelAccion>; confirmacion_humana_previa: boolean; aprobacion_previa: boolean; ejecuta: "agente" | "persona"; permiso_persona: string | null }>;

/** PLAYBOOK §7.4 + CP-130…CP-138: decisión de Core ante una confirmación de asignación. Función pura. */
export function decidirConfirmacionAsignacion(i: {
  actor: "persona" | "bot" | "sistema"; permiso: boolean; run: "propuesta" | "en_cascada" | "agotada"; candidato_vigente: boolean;
  tarifa_modificada: boolean; flag_auto: boolean; accion: "confirmar" | "autoconfirmar" | "encender_flag_auto";
}): { resultado: "confirmada" | "rechazada" | "frenada" | "escalada"; codigos: ("POLICY_RECHAZA" | "SIN_PERMISO" | "REQUIERE_APROBACION")[]; nivel: "2b" | "3"; alerta: boolean } {
  if (i.accion === "encender_flag_auto") return { resultado: "frenada", codigos: ["REQUIERE_APROBACION"], nivel: "3", alerta: true };
  if (i.accion === "autoconfirmar") return { resultado: "rechazada", codigos: ["POLICY_RECHAZA"], nivel: "2b", alerta: i.flag_auto };
  if (i.actor !== "persona") return { resultado: "rechazada", codigos: ["POLICY_RECHAZA"], nivel: "2b", alerta: false };
  if (!i.permiso) return { resultado: "rechazada", codigos: ["SIN_PERMISO"], nivel: "2b", alerta: false };
  if (i.run === "agotada") return { resultado: "escalada", codigos: [], nivel: "2b", alerta: true };
  if (i.tarifa_modificada) return { resultado: "frenada", codigos: ["REQUIERE_APROBACION"], nivel: "3", alerta: true };
  if (!i.candidato_vigente) return { resultado: "rechazada", codigos: ["POLICY_RECHAZA"], nivel: "2b", alerta: false };
  return { resultado: "confirmada", codigos: [], nivel: "2b", alerta: false };
}

export const CrearOperacionOk = z.object({
  ok: z.literal(true),
  operacion_id: OperacionId,
  /** UUID interno (ops_operations.id). Las llaves foráneas usan este. */
  operacion_uuid: z.string().uuid(),
  estado: EstadoOperacion,
  idempotente_reutilizada: z.boolean(),
  audit_id: z.string().uuid(),
  created_at: z.string().regex(RE_ISO_OFFSET),
  /** Avisos de la revalidación en el servidor. Se crea igual (se opera primero) y entran a la revisión posterior. */
  avisos: z.array(Hallazgo),
  nivel_accion: NivelAccion,
  version_reglas: z.literal(VERSION_REGLAS),
}).strict();

export const CrearOperacionError = z.discriminatedUnion("code", [
  z.object({ ok: z.literal(false), code: z.literal("VALIDACION_FALLIDA"), error: z.string(), errores: z.array(Hallazgo), version_reglas: z.literal(VERSION_REGLAS) }).strict(),
  z.object({ ok: z.literal(false), code: z.literal("NO_AUTORIZADO"), error: z.string(), http: z.union([z.literal(401), z.literal(403)]) }).strict(),
  z.object({ ok: z.literal(false), code: z.literal("POLICY_RECHAZA"), error: z.string(), regla_policy: z.string(), nivel_accion: NivelAccion }).strict(),
  z.object({ ok: z.literal(false), code: z.literal("REQUIERE_APROBACION"), error: z.string(), approval_request_id: z.string().uuid(), nivel_accion: z.literal(3) }).strict(),
  z.object({ ok: z.literal(false), code: z.literal("IDEMPOTENCIA_CONFLICTO"), error: z.string(), operacion_id_existente: OperacionId.nullable() }).strict(),
  z.object({ ok: z.literal(false), code: z.literal("SERVICIO_NO_DISPONIBLE"), error: z.string(), retry_after_s: z.number().int().min(1).max(3600) }).strict(),
]);

export const CrearOperacionOutput = z.union([CrearOperacionOk, CrearOperacionError]);
export type CrearOperacionOutput = z.infer<typeof CrearOperacionOutput>;

/** HTTP de cada error al pasar por la API de Core. */
export const HTTP_POR_ERROR: Record<z.infer<typeof CodigoErrorHerramienta>, number> = {
  VALIDACION_FALLIDA: 422,
  NO_AUTORIZADO: 403, // 401 si no hay sesión
  POLICY_RECHAZA: 403,
  REQUIERE_APROBACION: 403,
  IDEMPOTENCIA_CONFLICTO: 409,
  SERVICIO_NO_DISPONIBLE: 503, // también con el flag apagado se responde 404 "No encontrado." (opsGuard), sin delatar la ruta
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Registro de auditoría (quién, qué, cuándo, antes/después, hash y nivel)
//    Se escribe en audit_log (auditStrict, en la misma transacción) y el cuerpo completo en una tabla propia con hash encadenado,
//    igual que ops_events (eventHash en src/lib/ops/shipments.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const RegistroAuditoria = z.object({
  audit_id: z.string().uuid(),
  quien: z.object({
    actor_tipo: z.enum(["bot", "usuario", "sistema"]),
    usuario_id: z.string().uuid().nullable(),
    bot_id: z.string().nullable(),
    canal: Canal,
    /** IP o "mcp" si es servidor a servidor. */
    origen: z.string().max(64).nullable(),
  }).strict(),
  que: z.object({
    accion: z.enum(["ops.solicitud_validada", "ops.solicitud_incompleta", "ops.operacion_creada", "ops.operacion_reutilizada", "ops.operacion_rechazada", "aprobacion.solicitada"]),
    herramienta: z.enum(["validar_solicitud", "crear_operacion"]),
    target_type: z.enum(["ops_solicitud", "ops_operacion"]),
    target_id: z.string().nullable(),
    idempotency_key: z.string().nullable(),
  }).strict(),
  cuando: z.string().regex(RE_ISO_OFFSET),
  /** Estado anterior y posterior (JSON con datos personales enmascarados: teléfono +56 9 **** 4321). */
  antes: z.record(z.string(), z.unknown()).nullable(),
  despues: z.record(z.string(), z.unknown()).nullable(),
  nivel: NivelAccion,
  subnivel: SubnivelAccion,
  version_reglas: z.literal(VERSION_REGLAS),
  /** sha256 del JSON canónico [prev_hash, seq, accion, antes, despues, cuando]. */
  hash: z.string().regex(RE_SHA256),
  prev_hash: z.string().regex(RE_SHA256).or(z.literal("")),
  seq: z.number().int().min(1),
}).strict();
export type RegistroAuditoria = z.infer<typeof RegistroAuditoria>;

// ─────────────────────────────────────────────────────────────────────────────
// 7. Reglas del servidor: ID de operación, hash canónico e idempotencia (funciones puras)
// ─────────────────────────────────────────────────────────────────────────────

/** YYMM en la zona indicada (por defecto America/Santiago), igual que todayChile() en src/lib/format.ts. */
export function yymmChile(now: Date, timeZone: "America/Santiago" = "America/Santiago"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "2-digit", month: "2-digit" }).formatToParts(now);
  const yy = parts.find((p) => p.type === "year")?.value ?? "";
  const mm = parts.find((p) => p.type === "month")?.value ?? "";
  return `${yy}${mm}`;
}

/**
 * Regla de generación (solo en el servidor, dentro de la transacción de alta):
 *   1. periodo = yymmChile(now).
 *   2. UPSERT atómico en ops_operation_counters (periodo PK, ultimo INTEGER; migración 030 ya fusionada, PR #52), sumando 1 → n. Es por mes y parte en 1.
 *   3. id = `360-${periodo}-${n con relleno a 4 dígitos}`. Sobre 9999 crece a 5 dígitos (PLAYBOOK §4, D-14 v1.1); tope 99999.
 *      No se recicla ni se rellenan huecos, aunque la operación se cancele.
 * El cliente MCP nunca propone el id.
 */
export function formatOperacionId(periodoYYMM: string, correlativo: number): string {
  if (!/^\d{2}(0[1-9]|1[0-2])$/.test(periodoYYMM)) throw new Error("Periodo YYMM inválido.");
  if (!Number.isInteger(correlativo) || correlativo < 1 || correlativo > 99999) throw new Error("Correlativo fuera de rango.");
  const id = `360-${periodoYYMM}-${String(correlativo).padStart(4, "0")}`;
  if (!RE_OPERACION_ID.test(id)) throw new Error("ID de operación inválido.");
  return id;
}

/**
 * D-14 · Adaptador MCP → Core. POST /api/ops/operaciones (src/lib/ops/operacion.ts, createSchema .strict()) recibe un cuerpo plano.
 * La herramienta crear_operacion recibe la SolicitudNormalizada, la valida y la traduce aquí. `cliente` sale de la organización
 * de la sesión (nunca del texto del usuario). origen y destino llevan la dirección para que el reparto dentro de una misma comuna
 * (D-17) no choque con la regla «origen distinto de destino» de Core.
 */
export type CuerpoCoreOperacion = { cliente: string; origen: string; destino: string; tipoCarga: string; pesoKg: number; idempotencyKey: string };
export function aCuerpoCoreOperacion(s: SolicitudNormalizada, idempotencyKey: string, clienteSesion: string): CuerpoCoreOperacion {
  const lugar = (l: SolicitudNormalizada["origen"]) => (l.direccion ? `${l.comuna.nombre}, ${l.direccion}` : l.comuna.nombre).slice(0, 120);
  const tipo = (s.carga.tipo ?? s.carga.descripcion).trim().slice(0, 80);
  return { cliente: clienteSesion.trim().slice(0, 160), origen: lugar(s.origen), destino: lugar(s.destino), tipoCarga: tipo.length >= 2 ? tipo : s.equipo, pesoKg: s.carga.pesoKg, idempotencyKey };
}

/** JSON canónico (claves ordenadas), como stableStringify/canonicalize en src/lib/ops/shipments.ts. */
export function canonicalJson(value: unknown): string {
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return JSON.stringify(canon(value === undefined ? {} : value));
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Hash del cuerpo para la idempotencia: sólo `solicitud` + `actor.usuario_id` (no el bot ni la hora). */
export function idempotencyBodyHash(input: z.infer<typeof CrearOperacionInput>): string {
  return sha256Hex(canonicalJson({ solicitud: input.solicitud, usuario_id: input.actor.usuario_id }));
}

/** Semántica: misma clave + mismo hash ⇒ misma respuesta (idempotente_reutilizada = true). Misma clave + otro hash ⇒ IDEMPOTENCIA_CONFLICTO. */
export type IdempotencyRecord = { key: string; bodyHash: string; response: z.infer<typeof CrearOperacionOk> };
export function resolveIdempotency(
  existing: IdempotencyRecord | null,
  key: string,
  bodyHash: string,
): { kind: "nueva" } | { kind: "reutilizada"; response: z.infer<typeof CrearOperacionOk> } | { kind: "conflicto"; operacionId: string } {
  if (!existing || existing.key !== key) return { kind: "nueva" };
  if (existing.bodyHash === bodyHash) return { kind: "reutilizada", response: { ...existing.response, idempotente_reutilizada: true } };
  return { kind: "conflicto", operacionId: existing.response.operacion_id };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Conexión con la API de Carga360 Core (la herramienta MCP solo llama a la API)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cliente HTTP hacia Core. Lo implementa el servidor MCP con fetch.
 *  - validar → POST /api/ops/solicitudes/validar (dry-run, sin escritura; ruta propuesta en VALIDACION_DATOS.md §5.2).
 *  - crear   → POST /api/ops/operaciones (FLUJO_E2E_V1.md §6.3), con el header Idempotency-Key.
 * Credenciales: token de servicio del cliente MCP (estilo MCP_TOKEN, cargado por Gerencia en el entorno, nunca por chat)
 * más X-C360-Session con la sesión de la persona (igual que src/app/api/mcp/route.ts). Las dos rutas van detrás de
 * OPS_FEATURE_ENABLED + OPS_ORCHESTRATION_ENABLED (opsGuard ⇒ 404 si están apagados).
 */
export interface CoreApiClient {
  post(path: "/api/ops/solicitudes/validar", body: z.infer<typeof ValidarSolicitudInput>, headers: CoreHeaders): Promise<CoreResponse>;
  post(path: "/api/ops/operaciones", body: z.infer<typeof CrearOperacionInput>, headers: CoreHeaders & { "Idempotency-Key": string }): Promise<CoreResponse>;
}
export type CoreHeaders = { Authorization: `Bearer ${string}`; "X-C360-Session": string; "X-C360-Bot"?: string };
export type CoreResponse = { status: number; json: unknown };

/** Handler MCP: valida la forma, llama a Core y valida la respuesta. No hay lógica de negocio aquí: Core revalida todo. */
export async function handleValidarSolicitud(raw: unknown, core: CoreApiClient, headers: CoreHeaders): Promise<ValidarSolicitudOutput> {
  const input = ValidarSolicitudInput.parse(raw);
  const res = await core.post("/api/ops/solicitudes/validar", input, headers);
  if (res.status >= 500) throw new Error("SERVICIO_NO_DISPONIBLE");
  return ValidarSolicitudOutput.parse(res.json);
}

export async function handleCrearOperacion(raw: unknown, core: CoreApiClient, headers: CoreHeaders): Promise<CrearOperacionOutput> {
  const input = CrearOperacionInput.parse(raw);
  const res = await core.post("/api/ops/operaciones", input, { ...headers, "Idempotency-Key": input.idempotency_key });
  if (res.status >= 500) {
    return { ok: false, code: "SERVICIO_NO_DISPONIBLE", error: "Carga360 Core no responde. Intenta de nuevo con la misma idempotency_key.", retry_after_s: 30 };
  }
  return CrearOperacionOutput.parse(res.json);
}

/**
 * Lo que hace Core en POST /api/ops/operaciones (orden obligatorio):
 *   1. opsGuard + flags → 2. sesión/token (NO_AUTORIZADO) → 3. permiso can(user, orgId, "operaciones.crear")
 *   4. Idempotencia (resolveIdempotency): reutilizada ⇒ devuelve la respuesta guardada; conflicto ⇒ IDEMPOTENCIA_CONFLICTO
 *   5. **Revalidación completa** con validateSolicitud() sobre `solicitud`. Nunca confía en validacion_hash: solo lo compara y,
 *      si difiere, lo anota en la auditoría. Si hay BLOQUEA ⇒ VALIDACION_FALLIDA.
 *   6. Policy → nivel. Nivel 3 (ej. clase ONU 1 o 7, explosivos o radiactivos, que tienen normas propias según DS 298 art. 1; propuesta)
 *      ⇒ crea la aprobación (ops_policy_decisions = espera_aprobacion) y responde REQUIERE_APROBACION con approval_request_id.
 *   7. Transacción: ops_requests (convertida) + ops_operations (id 360-YYMM-NNNN) + request_idempotency + validation_reports
 *      + auditStrict("ops.operacion_creada") + bus. Si algo falla, se revierte todo.
 */
export const ORDEN_SERVIDOR_CREAR_OPERACION = [
  "flag", "autenticacion", "permiso", "idempotencia", "revalidacion", "policy", "transaccion",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// 9. Permisos por actor
// ─────────────────────────────────────────────────────────────────────────────

export type ActorRol =
  | "bot_operaciones" | "bot_otros" | "mandante" | "transportista" | "admin"
  | "ops_org_admin" | "ops_trafico" | "ops_procurement" | "ops_finanzas" | "ops_auditor" | "ops_lectura";

/** true = permitido (sujeto a la policy y a que sea de su organización). Los permisos de organización vienen de FLUJO_E2E_V1.md §6. */
export const PERMISOS_HERRAMIENTAS: Record<ActorRol, { validar_solicitud: boolean; crear_operacion: boolean; nota: string }> = {
  bot_operaciones: { validar_solicitud: true, crear_operacion: true, nota: "Solo en nombre de un usuario con operaciones.crear (X-C360-Session). Nunca Nivel 3." },
  bot_otros: { validar_solicitud: true, crear_operacion: false, nota: "DOCUMENTACIÓN, SEGUIMIENTO e INTELIGENCIA solo validan o leen." },
  mandante: { validar_solicitud: true, crear_operacion: true, nota: "Sus propias solicitudes, con cuenta acreditada (assertCanPublish) y sin solo lectura manual." },
  transportista: { validar_solicitud: false, crear_operacion: false, nota: "No crea solicitudes de transporte." },
  admin: { validar_solicitud: true, crear_operacion: true, nota: "Admin de plataforma; queda auditado." },
  ops_org_admin: { validar_solicitud: true, crear_operacion: true, nota: "En su organización." },
  ops_trafico: { validar_solicitud: true, crear_operacion: true, nota: "En su organización (propuesta: otorgar operaciones.crear)." },
  ops_procurement: { validar_solicitud: true, crear_operacion: false, nota: "Solo valida." },
  ops_finanzas: { validar_solicitud: false, crear_operacion: false, nota: "Fuera de alcance." },
  ops_auditor: { validar_solicitud: true, crear_operacion: false, nota: "Solo lectura y auditoría." },
  ops_lectura: { validar_solicitud: false, crear_operacion: false, nota: "Solo lectura." },
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. Descriptores MCP (tools/list)
//     Campos según la especificación MCP 2025-06-18 (name, title, description, inputSchema, outputSchema, annotations).
//     Resultado de tools/call: structuredContent = salida validada por zod, más el mismo JSON en un TextContent.
//     Los errores de negocio (ok: false o valido: false) van con isError: true. Los argumentos inválidos van como error JSON-RPC -32602.
//     Ojo: zod-to-json-schema no es dependencia del repo; zod 3.25 también trae zod/v4 con z.toJSONSchema (decisión de Cursor/Bastián).
// ─────────────────────────────────────────────────────────────────────────────

export type McpToolDescriptor = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
};

/** Firma simple a propósito: evita el TS2589 ("excessively deep") que aparece con moduleResolution node10. */
const zodToJsonSchemaSimple = zodToJsonSchema as unknown as (schema: z.ZodTypeAny, options: { target: "jsonSchema7"; $refStrategy: "none" }) => unknown;
const toJson = (schema: z.ZodTypeAny): Record<string, unknown> =>
  zodToJsonSchemaSimple(schema, { target: "jsonSchema7", $refStrategy: "none" }) as Record<string, unknown>;

export const MCP_TOOLS: readonly McpToolDescriptor[] = [
  {
    name: "validar_solicitud",
    title: "Validar solicitud de transporte",
    description:
      "Valida y normaliza una solicitud de transporte de Carga360go (schema v1.1, reglas val-v1.1). Es de solo lectura: no crea ni modifica nada. " +
      "Devuelve errores (BLOQUEA), avisos, la solicitud normalizada (CUT, SI, ISO 8601 con offset y E.164), autocompletados, nivel de acción y versión de reglas. " +
      "Si valido = false, pide a la persona los datos marcados; no inventes valores.",
    inputSchema: toJson(ValidarSolicitudInput),
    outputSchema: toJson(ValidarSolicitudOutput),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "crear_operacion",
    title: "Crear operación desde una solicitud validada",
    description:
      "Crea en Carga360 Core una operación 360-YYMM-NNNN desde una solicitud normalizada. El servidor revalida todo y aplica la policy. " +
      "Requiere una idempotency_key única por intento: si reintentas, usa la misma clave y el mismo contenido. " +
      "No crea nada si hay errores, si falta permiso o si la acción es de Nivel 3 (en ese caso devuelve approval_request_id y espera la aprobación de una persona).",
    inputSchema: toJson(CrearOperacionInput),
    outputSchema: toJson(CrearOperacionOutput),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// 11. EJEMPLOS (datos ficticios, chequeados por tipos)
// ─────────────────────────────────────────────────────────────────────────────

/** EJEMPLO · request validar_solicitud. */
export const EJEMPLO_VALIDAR_REQUEST = {
  canal: "whatsapp",
  modo: "validar_y_normalizar",
  solicitud: {
    meta: { schemaVersion: "1.1.0", channel: "whatsapp", testData: true, idempotencyKey: "EJEMPLO-wa-3f9c2a7e-20261117-0001", submittedAt: "2026-11-17T10:15:00-03:00", botId: "operaciones" },
    origin: { address: "Av. Vicuña Mackenna 1000", comuna: "Stgo", siteType: "bodega" },
    destination: { address: "Concha y Toro 3000", comuna: "puente alto" },
    equipment: "camion_34",
    cargo: { description: "Electrodomésticos embalados, 20 bultos", weight: { value: 800, unit: "kg" }, packages: 20 },
    pickupWindow: { from: "2026-11-18T09:00:00-03:00", to: "2026-11-18T12:00:00-03:00" },
    deliveryWindow: { from: "2026-11-18T13:00:00-03:00", to: "2026-11-18T18:00:00-03:00" },
    contact: { name: "María Soto", phone: "9 8765 4321" },
    notes: "EJEMPLO · datos ficticios",
  },
} satisfies ValidarSolicitudInput;

const EJEMPLO_NORMALIZADA: SolicitudNormalizada = {
  schemaVersion: "1.1.0",
  testData: true,
  versionTerritorio: "cut-2018.v1",
  canal: "whatsapp",
  origen: { comuna: { cut: "13101", nombre: "Santiago" }, region: { cut: "13", nombre: "Metropolitana de Santiago", slugCatalogo: "metropolitana" }, ciudadCatalogo: "Santiago", zonaHoraria: "America/Santiago", direccion: "Av. Vicuña Mackenna 1000", coords: null, tipoSitio: "bodega" },
  destino: { comuna: { cut: "13201", nombre: "Puente Alto" }, region: { cut: "13", nombre: "Metropolitana de Santiago", slugCatalogo: "metropolitana" }, ciudadCatalogo: "Santiago", zonaHoraria: "America/Santiago", direccion: "Concha y Toro 3000", coords: null, tipoSitio: null },
  equipo: "camion_34",
  carga: { descripcion: "Electrodomésticos embalados, 20 bultos", tipo: null, pesoKg: 800, pesoT: 0.8, dimensionesM: null, volumenM3: null, pallets: null, bultos: 20, indivisible: false, specs: { bultos: 20 } },
  retiro: { dia: "2026-11-18", desde: "2026-11-18T09:00:00-03:00", hasta: "2026-11-18T12:00:00-03:00", flexible: false },
  entrega: { dia: "2026-11-18", desde: "2026-11-18T13:00:00-03:00", hasta: "2026-11-18T18:00:00-03:00", flexible: false },
  requisitos: { peligrosa: null, refrigerada: null, minera: null, acreditaciones: [] },
  contacto: { nombre: "María Soto", telefonoE164: "+56987654321", email: null, canalPreferido: null, usaContactoCuenta: false },
  comercial: { presupuestoClp: null, horasOfertas: null, permiteMejorar: null, soloVerificados: false, inmediata: false },
  notas: "EJEMPLO · datos ficticios",
  sugeridos: [],
};

/** EJEMPLO · response validar_solicitud (válida, con autocompletados y un aviso). */
export const EJEMPLO_VALIDAR_RESPONSE: ValidarSolicitudOutput = {
  valido: true,
  errores: [],
  avisos: [
    { codigo: "COMUNA_FUERA_CATALOGO", severidad: "AVISA", campo: "/destination/comuna", mensaje: "El calce de camiones usará la ciudad más cercana: «Santiago».", sugerencia: null },
    { codigo: "COMUNA_NORMALIZADA", severidad: "AUTOCOMPLETA", campo: "/origin/comuna", mensaje: "Usamos «Santiago» para «Stgo».", sugerencia: null },
  ],
  normalizada: EJEMPLO_NORMALIZADA,
  autocompletados: [
    { codigo: "COMUNA_NORMALIZADA", campo: "/origin/comuna", valorOrigen: "Stgo", valorDestino: { cut: "13101", nombre: "Santiago" } },
    { codigo: "UNIDAD_CONVERTIDA", campo: "/cargo/weight", valorOrigen: { value: 800, unit: "kg" }, valorDestino: { pesoKg: 800, pesoT: 0.8 } },
    { codigo: "TELEFONO_NORMALIZADO", campo: "/contact/phone", valorOrigen: "9 8765 4321", valorDestino: "+56987654321" },
  ],
  nivel_accion: 2,
  subnivel_accion: "2a",
  version_reglas: "val-v1.1",
  validacion_hash: "4f2a0c1e9b7d6a5f3e2c1b0a99887766554433221100ffeeddccbbaa00112233",
  resultado: "validada_con_avisos",
};

/** EJEMPLO · request crear_operacion. */
export const EJEMPLO_CREAR_REQUEST = {
  solicitud: EJEMPLO_NORMALIZADA,
  idempotency_key: "EJEMPLO-op-wa-3f9c2a7e-20261117-0001",
  actor: { tipo: "bot", bot_id: "operaciones", usuario_id: "7b0c2f9e-1d2a-4c3b-9e8f-112233445566", canal: "whatsapp" },
  validacion_hash: "4f2a0c1e9b7d6a5f3e2c1b0a99887766554433221100ffeeddccbbaa00112233",
} satisfies CrearOperacionInput;

/** EJEMPLO · response crear_operacion (primera vez). Con la misma clave y el mismo contenido: igual, con idempotente_reutilizada = true. */
export const EJEMPLO_CREAR_RESPONSE_OK: CrearOperacionOutput = {
  ok: true,
  operacion_id: "360-2611-0001",
  operacion_uuid: "0f1e2d3c-4b5a-4968-8776-655443322110",
  estado: "abierta",
  idempotente_reutilizada: false,
  audit_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  created_at: "2026-11-17T10:16:02-03:00",
  avisos: [],
  nivel_accion: 2,
  version_reglas: "val-v1.1",
};

/** EJEMPLO · misma clave con otro payload. */
export const EJEMPLO_CREAR_RESPONSE_CONFLICTO: CrearOperacionOutput = {
  ok: false,
  code: "IDEMPOTENCIA_CONFLICTO",
  error: "Esta clave ya se usó con otros datos. Usa una clave nueva si es otra solicitud.",
  operacion_id_existente: "360-2611-0001",
};

/** EJEMPLO · Nivel 3 (propuesta de policy: clase ONU 1, explosivos). */
export const EJEMPLO_CREAR_RESPONSE_APROBACION: CrearOperacionOutput = {
  ok: false,
  code: "REQUIERE_APROBACION",
  error: "Esta operación requiere aprobación de una persona autorizada antes de crearse.",
  approval_request_id: "9c8b7a6f-5e4d-4c3b-8a29-18f7e6d5c4b3",
  nivel_accion: 3,
};

/** EJEMPLO · registro de auditoría de la creación. */
export const EJEMPLO_AUDITORIA: RegistroAuditoria = {
  audit_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  quien: { actor_tipo: "bot", usuario_id: "7b0c2f9e-1d2a-4c3b-9e8f-112233445566", bot_id: "operaciones", canal: "whatsapp", origen: "mcp" },
  que: { accion: "ops.operacion_creada", herramienta: "crear_operacion", target_type: "ops_operacion", target_id: "360-2611-0001", idempotency_key: "EJEMPLO-op-wa-3f9c2a7e-20261117-0001" },
  cuando: "2026-11-17T10:16:02-03:00",
  antes: { solicitud_estado: "validada" },
  despues: { solicitud_estado: "convertida", operacion_estado: "abierta", contacto: "+56 9 **** 4321" },
  nivel: 2,
  subnivel: "2a",
  version_reglas: "val-v1.1",
  hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  prev_hash: "",
  seq: 1,
};
