import { randomUUID } from "crypto";
import { z } from "zod";
import { auditStrict } from "../audit";
import { haversineM } from "../costos/geometry";
import { getDb } from "../db";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import {
  cierreMinDefault,
  desvioMinDefault,
  desvioPuntosDefault,
  diferenciaCostoPct,
  esperaDestinoMinDefault,
  evidenciaMinDefault,
  retiroMinDefault,
  sinAsignarMinDefault,
  sinContactoIntentosDefault,
  temperaturaMinDefault,
} from "./alert-config";
import { appendEvent, canReadShipment, type OpsShipment, type ShipmentStage } from "./shipments";

/** Los 16 kinds nuevos. Los 3 de la torre quedan en el CHECK y no se escriben aquí. */
export const OPERATION_ALERT_KINDS = [
  "desvio_geocerca",
  "espera_destino",
  "siniestro",
  "rechazo_entrega",
  "entrega_con_reparos",
  "documento_vencido",
  "documento_faltante",
  "sin_asignar",
  "retiro_no_iniciado",
  "cambio_no_verificado",
  "sin_contacto",
  "evidencia_faltante",
  "cierre_pendiente",
  "diferencia_costo",
  "temperatura_fuera_rango",
  "incidente_seguridad",
] as const;

export type OperationAlertKind = (typeof OPERATION_ALERT_KINDS)[number];

const MANUAL_KINDS = ["siniestro", "rechazo_entrega", "entrega_con_reparos", "sin_contacto"] as const;
type ManualKind = (typeof MANUAL_KINDS)[number];
type P1Kind = "retiro_no_iniciado" | "espera_destino" | "desvio_geocerca" | "evidencia_faltante" | "sin_asignar" | "documento_vencido";

export const OPERATION_KIND_SEVERITY: Record<OperationAlertKind, "baja" | "media" | "alta"> = {
  desvio_geocerca: "alta",
  siniestro: "alta",
  rechazo_entrega: "alta",
  entrega_con_reparos: "alta",
  documento_vencido: "alta",
  documento_faltante: "alta",
  retiro_no_iniciado: "alta",
  cambio_no_verificado: "alta",
  sin_contacto: "alta",
  diferencia_costo: "alta",
  temperatura_fuera_rango: "alta",
  incidente_seguridad: "alta",
  espera_destino: "media",
  sin_asignar: "media",
  evidencia_faltante: "media",
  cierre_pendiente: "baja",
};

const HUMAN_REASONS = ["resuelta_manual", "descartada", "duplicada"] as const;
export type CloseReason = "condicion_resuelta" | (typeof HUMAN_REASONS)[number];

const POD_FIELDS = ["fotos", "receptor", "rut_receptor", "firma", "fecha_hora"] as const;

const RUT = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{1,3}\)?[\s-]?)?\d(?:[\s-]?\d){7,}/g;

type Actor = Pick<PublicUser, "id" | "email"> | null | undefined;

type ShipmentRow = {
  id: string;
  load_id: string | null;
  shipper_org_id: string | null;
  carrier_org_id: string | null;
  assigned_offer_id: string | null;
  stage: string;
  planned_pickup_at: string | null;
  planned_delivery_at: string | null;
  operation_id: string | null;
  updated_at: string;
};

type Fence = { point: "origen" | "destino"; lat: number; lng: number; radius_m: number };
type Gps = { id: string; lat: number; lng: number; recordedAt: string };
type OpenRow = { id: string; evidence_json: string; opened_at: string };

export type OperationAlertView = {
  id: string;
  shipmentId: string;
  operationId: string | null;
  kind: string;
  severity: "baja" | "media" | "alta";
  status: "abierta" | "cerrada";
  source: "automatica" | "manual";
  evidence: Record<string, unknown>;
  openedBy: string | null;
  openedAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedBy: string | null;
  closeReason: string | null;
};

const manualSchema = z
  .object({
    kind: z.enum(MANUAL_KINDS).optional(),
    reporte: z
      .object({
        reportadoPor: z.string().max(200).optional(),
        reportado_por: z.string().max(200).optional(),
        hora: z.string().max(40).optional(),
        descripcion: z.string().max(2000).optional(),
        tipo: z.string().max(80).optional(),
        motivo: z.string().max(500).optional(),
      })
      .optional(),
    pod: z.object({ observaciones: z.string().max(2000).optional() }).optional(),
    podEvidence: z.record(z.string(), z.unknown()).optional(),
    intentosSinRespuesta: z.number().int().nonnegative().max(99).optional(),
    intentos_sin_respuesta: z.number().int().nonnegative().max(99).optional(),
    respuesta: z.boolean().optional(),
    reclamoMonto: z.unknown().optional(),
    reclamo_monto_clp: z.unknown().optional(),
  })
  .passthrough();

/** Umbrales de incidencias. cierre, temperatura y diferencia de costo se leen y no se aplican en este PR. */
export function operationThresholds() {
  return {
    retiro: retiroMinDefault(),
    esperaDestino: esperaDestinoMinDefault(),
    desvio: desvioMinDefault(),
    desvioPuntos: desvioPuntosDefault(),
    sinAsignar: sinAsignarMinDefault(),
    evidencia: evidenciaMinDefault(),
    cierre: cierreMinDefault(),
    temperatura: temperaturaMinDefault(),
    sinContacto: sinContactoIntentosDefault(),
    diferenciaCostoPct: diferenciaCostoPct(),
  };
}

export function redactPersonal(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(RUT, "[dato personal omitido]").replace(EMAIL, "[dato personal omitido]").replace(PHONE, "[dato personal omitido]");
  }
  if (Array.isArray(value)) return value.map((item) => redactPersonal(item));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = redactPersonal(item);
    return out;
  }
  return value;
}

function parseEvidence(json: string): Record<string, unknown> {
  try {
    const value = JSON.parse(json) as Record<string, unknown>;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function mapShipment(row: ShipmentRow): OpsShipment {
  return {
    id: row.id,
    loadId: row.load_id,
    shipperOrgId: row.shipper_org_id,
    carrierOrgId: row.carrier_org_id,
    rateCardId: null,
    laneId: null,
    assignedOfferId: row.assigned_offer_id,
    stage: row.stage as ShipmentStage,
    plannedPickupAt: row.planned_pickup_at,
    plannedDeliveryAt: row.planned_delivery_at,
    operationId: row.operation_id,
    createdAt: row.updated_at,
    updatedAt: row.updated_at,
  };
}

function requireReadable(user: PublicUser, shipmentId: string): ShipmentRow {
  if (!z.string().uuid().safeParse(shipmentId).success) throw new AppError("Envío no encontrado.", 404);
  const row = getDb()
    .prepare(
      `SELECT id, load_id, shipper_org_id, carrier_org_id, assigned_offer_id, stage,
              planned_pickup_at, planned_delivery_at, operation_id, updated_at
       FROM ops_shipments WHERE id = ?`,
    )
    .get(shipmentId) as ShipmentRow | undefined;
  if (!row) throw new AppError("Envío no encontrado.", 404);
  if (!canReadShipment(user, mapShipment(row))) throw new AppError("No tienes permiso para ver este envío.", 403);
  return row;
}

function tableExists(name: string): boolean {
  return Boolean(getDb().prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));
}

function gpsOf(loadId: string | null): Gps[] {
  if (!loadId || !tableExists("trip_gps_points")) return [];
  return getDb()
    .prepare(
      `SELECT id, lat, lng, recorded_at AS recordedAt FROM trip_gps_points
       WHERE load_id = ? ORDER BY recorded_at ASC, id ASC`,
    )
    .all(loadId) as Gps[];
}

function fencesOf(shipmentId: string): Fence[] {
  if (!tableExists("ops_geofences")) return [];
  return getDb()
    .prepare(`SELECT point, lat, lng, radius_m FROM ops_geofences WHERE shipment_id = ?`)
    .all(shipmentId) as Fence[];
}

function meters(point: { lat: number; lng: number }, fence: Fence): number {
  return haversineM({ lat: point.lat, lon: point.lng }, { lat: fence.lat, lon: fence.lng });
}

function isInside(point: { lat: number; lng: number }, fence: Fence): boolean {
  return meters(point, fence) <= fence.radius_m;
}

function podRows(loadId: string | null): { kind: string; notes: string | null }[] {
  if (!loadId || !tableExists("pod_evidence") || !tableExists("freight_payments")) return [];
  return getDb()
    .prepare(
      `SELECT pe.kind AS kind, pe.notes AS notes
       FROM pod_evidence pe
       JOIN freight_payments fp ON fp.id = pe.freight_payment_id
       WHERE fp.load_id = ?`,
    )
    .all(loadId) as { kind: string; notes: string | null }[];
}

function checklistFrom(rows: { notes: string | null }[]): Record<string, unknown> | null {
  for (const row of rows) {
    if (!row.notes) continue;
    try {
      const value = JSON.parse(row.notes) as Record<string, unknown>;
      if (value && typeof value === "object" && POD_FIELDS.some((field) => field in value)) return value;
    } catch {
      continue;
    }
  }
  return null;
}

function missingFields(checklist: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (typeof checklist.fotos !== "number" || checklist.fotos <= 0) missing.push("fotos");
  if (typeof checklist.receptor !== "string" || checklist.receptor.trim() === "") missing.push("receptor");
  if (typeof checklist.rut_receptor !== "string" || checklist.rut_receptor.trim() === "") missing.push("rut_receptor");
  if (checklist.firma !== true) missing.push("firma");
  if (typeof checklist.fecha_hora !== "string" || checklist.fecha_hora.trim() === "") missing.push("fecha_hora");
  return missing;
}

function podState(loadId: string | null): { exists: boolean; missing: string[] } {
  const rows = podRows(loadId);
  if (rows.length === 0) return { exists: false, missing: [...POD_FIELDS] };
  const checklist = checklistFrom(rows);
  if (checklist) return { exists: true, missing: missingFields(checklist) };
  const kinds = new Set(rows.map((row) => row.kind));
  const missing: string[] = [];
  if (!kinds.has("foto_documento")) missing.push("fotos");
  if (!kinds.has("firma")) missing.push("firma");
  return { exists: true, missing };
}

function openRow(shipmentId: string, kind: string): OpenRow | undefined {
  return getDb()
    .prepare(
      `SELECT id, evidence_json, opened_at FROM ops_operation_alerts
       WHERE shipment_id = ? AND kind = ? AND status = 'abierta'`,
    )
    .get(shipmentId, kind) as OpenRow | undefined;
}

function setOperationAlert(
  shipment: ShipmentRow,
  kind: OperationAlertKind,
  open: boolean,
  evidence: Record<string, unknown>,
  actor: Actor,
  source: "automatica" | "manual",
): "opened" | "closed" | "refreshed" | "unchanged" {
  const db = getDb();
  const now = new Date().toISOString();
  const current = openRow(shipment.id, kind);
  const safe = redactPersonal(evidence) as Record<string, unknown>;
  const payload = JSON.stringify(safe);
  if (!open) {
    if (!current) return "unchanged";
    db.prepare(
      `UPDATE ops_operation_alerts
       SET status = 'cerrada', evidence_json = ?, updated_at = ?, closed_at = ?, closed_by = NULL, close_reason = 'condicion_resuelta'
       WHERE id = ?`,
    ).run(payload, now, now, current.id);
    auditStrict(actor ?? null, "ops.incidencia_cerrada", { type: "envio", id: shipment.id }, {
      kind,
      alertaId: current.id,
      closeReason: "condicion_resuelta",
    });
    appendEvent({ shipmentId: shipment.id, kind: "incidencia.cerrada", payload: { kind, alertaId: current.id, closeReason: "condicion_resuelta" }, actor });
    return "closed";
  }
  if (current) {
    db.prepare(`UPDATE ops_operation_alerts SET evidence_json = ?, updated_at = ? WHERE id = ?`).run(payload, now, current.id);
    return "refreshed";
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO ops_operation_alerts (
      id, shipment_id, operation_id, kind, severity, status, source, evidence_json, opened_by, opened_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'abierta', ?, ?, ?, ?, ?)`,
  ).run(id, shipment.id, shipment.operation_id, kind, OPERATION_KIND_SEVERITY[kind], source, payload, actor?.id ?? null, now, now);
  auditStrict(actor ?? null, "ops.incidencia_abierta", { type: "envio", id: shipment.id }, { kind, alertaId: id });
  appendEvent({ shipmentId: shipment.id, kind: "incidencia.abierta", payload: { kind, alertaId: id }, actor });
  return "opened";
}

function apply(shipment: ShipmentRow, kind: P1Kind, open: boolean, evidence: Record<string, unknown>, tally: { opened: number; closed: number }) {
  const result = setOperationAlert(shipment, kind, open, evidence, null, "automatica");
  if (result === "opened") tally.opened += 1;
  if (result === "closed") tally.closed += 1;
}

function hasRetiroEvent(shipmentId: string): boolean {
  return Boolean(
    getDb().prepare(`SELECT 1 FROM ops_events WHERE shipment_id = ? AND kind LIKE '%retiro%' LIMIT 1`).get(shipmentId),
  );
}

function sinSenalAbierta(shipmentId: string): boolean {
  if (!tableExists("ops_alerts")) return false;
  return Boolean(
    getDb().prepare(`SELECT 1 FROM ops_alerts WHERE shipment_id = ? AND kind = 'sin_senal' AND status = 'abierta'`).get(shipmentId),
  );
}

function reviewP1(shipment: ShipmentRow, now: Date, tally: { opened: number; closed: number }) {
  const limits = operationThresholds();
  const points = gpsOf(shipment.load_id);
  const fences = fencesOf(shipment.id);
  const origen = fences.find((fence) => fence.point === "origen");
  const destino = fences.find((fence) => fence.point === "destino");
  const pod = podState(shipment.load_id);
  const nowMs = now.getTime();

  const pickupMs = shipment.planned_pickup_at ? Date.parse(shipment.planned_pickup_at) : Number.NaN;
  const assigned = Boolean(shipment.assigned_offer_id);
  const retiroLate =
    (shipment.stage === "asignacion" || shipment.stage === "ejecucion") &&
    assigned &&
    Boolean(origen) &&
    Number.isFinite(pickupMs) &&
    nowMs >= pickupMs + limits.retiro * 60_000 &&
    !points.some((point) => origen && isInside(point, origen));
  apply(
    shipment,
    "retiro_no_iniciado",
    retiroLate,
    {
      plannedPickupAt: shipment.planned_pickup_at,
      minutos: Number.isFinite(pickupMs) ? Math.round((nowMs - pickupMs) / 60_000) : null,
      umbralMin: limits.retiro,
      dentroOrigen: false,
    },
    tally,
  );

  const insideDest = destino ? points.filter((point) => isInside(point, destino)) : [];
  const esperaMin =
    insideDest.length >= 2 ? (Date.parse(insideDest[insideDest.length - 1].recordedAt) - Date.parse(insideDest[0].recordedAt)) / 60_000 : 0;
  const espera =
    shipment.stage === "ejecucion" && Boolean(destino) && !pod.exists && insideDest.length >= 2 && esperaMin >= limits.esperaDestino;
  apply(
    shipment,
    "espera_destino",
    espera,
    {
      minutos: Math.round(esperaMin),
      umbralMin: limits.esperaDestino,
      desde: insideDest[0]?.recordedAt ?? null,
      hasta: insideDest[insideDest.length - 1]?.recordedAt ?? null,
    },
    tally,
  );

  let desvio = false;
  const desvioEvidence: Record<string, unknown> = { umbralMin: limits.desvio, puntos: limits.desvioPuntos };
  if (shipment.stage === "ejecucion" && destino && points.length >= limits.desvioPuntos) {
    const tail = points.slice(-limits.desvioPuntos);
    const distances = tail.map((point) => Math.round(meters(point, destino)));
    const growing = distances.every((distance, index) => index === 0 || distance > distances[index - 1]);
    if (growing) {
      desvio = true;
      desvioEvidence.variante = "b";
      desvioEvidence.distancias = distances;
    }
  }
  if (!desvio && shipment.stage === "ejecucion" && destino && points.length >= 2 && !pod.exists) {
    const previous = points[points.length - 2];
    const latest = points[points.length - 1];
    if (isInside(previous, destino) && !isInside(latest, destino)) {
      desvio = true;
      desvioEvidence.variante = "c";
      desvioEvidence.distanciaUltimaM = Math.round(meters(latest, destino));
      desvioEvidence.radioM = destino.radius_m;
    }
  }
  if (!desvio && shipment.stage === "ejecucion" && origen && points.length >= 2 && !hasRetiroEvent(shipment.id)) {
    let lastInside = -1;
    points.forEach((point, index) => {
      if (isInside(point, origen)) lastInside = index;
    });
    if (lastInside >= 0 && lastInside < points.length - 1 && !isInside(points[points.length - 1], origen)) {
      const outsideAt = Date.parse(points[lastInside + 1].recordedAt);
      const outsideMin = (nowMs - outsideAt) / 60_000;
      if (outsideMin >= limits.desvio) {
        desvio = true;
        desvioEvidence.variante = "a";
        desvioEvidence.minutos = Math.round(outsideMin);
      }
    }
  }
  apply(shipment, "desvio_geocerca", desvio, desvioEvidence, tally);

  const currentEvidence = parseEvidence(openRow(shipment.id, "evidencia_faltante")?.evidence_json ?? "{}");
  const desde = typeof currentEvidence.desde === "string" ? currentEvidence.desde : shipment.updated_at;
  const evidenciaMin = (nowMs - Date.parse(desde)) / 60_000;
  const evidencia =
    shipment.stage === "pod" && Number.isFinite(Date.parse(desde)) && evidenciaMin >= limits.evidencia && pod.missing.length > 0;
  apply(
    shipment,
    "evidencia_faltante",
    evidencia,
    { desde, minutos: Math.round(evidenciaMin), umbralMin: limits.evidencia, camposFaltantes: pod.missing },
    tally,
  );

  const hastaRetiro = Number.isFinite(pickupMs) ? (pickupMs - nowMs) / 60_000 : Number.POSITIVE_INFINITY;
  const sinAsignar = shipment.stage === "asignacion" && !shipment.assigned_offer_id && Number.isFinite(pickupMs) && hastaRetiro <= limits.sinAsignar;
  apply(
    shipment,
    "sin_asignar",
    sinAsignar,
    { plannedPickupAt: shipment.planned_pickup_at, minutosHastaRetiro: Math.round(hastaRetiro), umbralMin: limits.sinAsignar },
    tally,
  );

  const documento = documentoVencido(shipment);
  apply(shipment, "documento_vencido", documento.open, documento.evidence, tally);
}

function documentoVencido(shipment: ShipmentRow): { open: boolean; evidence: Record<string, unknown> } {
  const empty = { open: false, evidence: { vinculo: "sin_transportista_unico" } };
  if (shipment.stage !== "asignacion" || !shipment.assigned_offer_id || !shipment.planned_pickup_at) return empty;
  if (!tableExists("offers") || !tableExists("transportistas") || !tableExists("documentos_acreditacion")) return empty;
  const offer = getDb()
    .prepare(`SELECT carrier_id FROM offers WHERE id = ? AND status = 'aceptada'`)
    .get(shipment.assigned_offer_id) as { carrier_id: string } | undefined;
  if (!offer) return empty;
  const carriers = getDb().prepare(`SELECT id FROM transportistas WHERE user_id = ?`).all(offer.carrier_id) as { id: string }[];
  if (carriers.length !== 1) return { open: false, evidence: { vinculo: "sin_transportista_unico" } };
  const pickupDay = shipment.planned_pickup_at.slice(0, 10);
  const docs = getDb()
    .prepare(`SELECT tipo, vencimiento, estado_admin FROM documentos_acreditacion WHERE transportista_id = ?`)
    .all(carriers[0].id) as { tipo: string; vencimiento: string | null; estado_admin: string }[];
  const vencidos = docs.filter(
    (doc) => doc.estado_admin === "rechazado" || doc.estado_admin === "renovacion" || (doc.vencimiento != null && doc.vencimiento < pickupDay),
  );
  if (vencidos.length === 0) return { open: false, evidence: { plannedPickupAt: shipment.planned_pickup_at } };
  return {
    open: true,
    evidence: {
      plannedPickupAt: shipment.planned_pickup_at,
      documentos: vencidos.map((doc) => ({ tipo: doc.tipo, vencimiento: doc.vencimiento, estadoAdmin: doc.estado_admin })),
      accion: "no_asignar",
    },
  };
}

/**
 * Evaluador de las 6 incidencias P1. No abre P2 automáticas, P3 ni los kinds de la torre.
 * No se ejecuta solo. Lo invoca POST /api/ops/alertas/evaluar.
 */
export function evaluateOperationAlerts(now = new Date()): { reviewed: number; opened: number; closed: number } {
  const rows = getDb()
    .prepare(
      `SELECT id, load_id, shipper_org_id, carrier_org_id, assigned_offer_id, stage,
              planned_pickup_at, planned_delivery_at, operation_id, updated_at
       FROM ops_shipments
       WHERE stage NOT IN ('cancelado', 'cerrado')`,
    )
    .all() as ShipmentRow[];
  const tally = { opened: 0, closed: 0 };
  for (const row of rows) reviewP1(row, now, tally);
  return { reviewed: rows.length, opened: tally.opened, closed: tally.closed };
}

function textOf(body: z.infer<typeof manualSchema>): string {
  return [body.reporte?.descripcion, body.reporte?.motivo, body.pod?.observaciones, body.reporte?.tipo].filter(Boolean).join(" ");
}

function hasMonto(body: z.infer<typeof manualSchema>): boolean {
  return body.reclamoMonto != null || body.reclamo_monto_clp != null;
}

/**
 * Registro manual de siniestro, rechazo, entrega con reparos y sin contacto.
 * No abre documento_faltante, cierre_pendiente ni P3.
 */
export function registerManualIncident(user: PublicUser, shipmentId: string, body: unknown): { alert: OperationAlertView | null } {
  const shipment = requireReadable(user, shipmentId);
  const parsed = manualSchema.safeParse(body);
  if (!parsed.success) throw new AppError("Revisa los datos enviados.");
  const data = parsed.data;
  const asked = typeof (body as { kind?: unknown })?.kind === "string" ? (body as { kind: string }).kind : data.kind;
  if (asked && !(MANUAL_KINDS as readonly string[]).includes(asked)) {
    throw new AppError("Ese tipo de incidencia no se registra en este paso.");
  }
  const notes = textOf(data).toLowerCase();
  const intentos = data.intentosSinRespuesta ?? data.intentos_sin_respuesta;
  let kind: ManualKind | null = null;
  const evidence: Record<string, unknown> = {};

  if (data.kind === "sin_contacto" || (intentos != null && !data.kind)) {
    const needed = operationThresholds().sinContacto;
    if (data.respuesta === true || (intentos ?? 0) < needed) return { alert: null };
    kind = "sin_contacto";
    evidence.intentosSinRespuesta = intentos;
    evidence.umbralIntentos = needed;
    evidence.escalamiento = sinSenalAbierta(shipment.id) ? "inmediato" : "plazo";
  } else if (notes.includes("con reparos") || data.kind === "entrega_con_reparos") {
    if (notes.includes("conforme") && !notes.includes("con reparos") && data.kind !== "entrega_con_reparos") return { alert: null };
    kind = "entrega_con_reparos";
    evidence.escalar_a_jefe_bastian = hasMonto(data);
    evidence.observaciones = data.pod?.observaciones ?? data.reporte?.motivo ?? null;
  } else if (data.kind === "rechazo_entrega" || data.reporte?.tipo === "rechazo_total") {
    kind = "rechazo_entrega";
    evidence.motivo = data.reporte?.motivo ?? null;
    evidence.tipo = data.reporte?.tipo ?? "rechazo_total";
  } else if (data.kind === "siniestro" || data.reporte?.descripcion) {
    if (notes.includes("conforme")) return { alert: null };
    kind = "siniestro";
    evidence.reportadoPor = data.reporte?.reportadoPor ?? data.reporte?.reportado_por ?? null;
    evidence.horaReporte = data.reporte?.hora ?? null;
    evidence.descripcion = data.reporte?.descripcion ?? null;
    evidence.escalar_a_jefe_bastian = true;
  } else if (notes.includes("conforme")) {
    return { alert: null };
  } else {
    return { alert: null };
  }

  setOperationAlert(shipment, kind, true, evidence, user, "manual");
  const row = openRow(shipment.id, kind);
  return { alert: row ? viewById(row.id) : null };
}

const closeSchema = z.object({
  id: z.string().uuid(),
  reason: z.enum(HUMAN_REASONS),
});

/** Cierre humano. condicion_resuelta queda reservada al evaluador. */
export function closeAlert(user: PublicUser, shipmentId: string, body: unknown): OperationAlertView {
  const shipment = requireReadable(user, shipmentId);
  const parsed = closeSchema.safeParse(body);
  if (!parsed.success) throw new AppError("Revisa los datos enviados.");
  const db = getDb();
  const current = db
    .prepare(`SELECT id, kind, status FROM ops_operation_alerts WHERE id = ? AND shipment_id = ?`)
    .get(parsed.data.id, shipment.id) as { id: string; kind: string; status: string } | undefined;
  if (!current || current.status !== "abierta") throw new AppError("Incidencia no encontrada.", 404);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE ops_operation_alerts
     SET status = 'cerrada', updated_at = ?, closed_at = ?, closed_by = ?, close_reason = ?
     WHERE id = ?`,
  ).run(now, now, user.id, parsed.data.reason, current.id);
  auditStrict(user, "ops.incidencia_cerrada", { type: "envio", id: shipment.id }, {
    kind: current.kind,
    alertaId: current.id,
    closeReason: parsed.data.reason,
  });
  appendEvent({
    shipmentId: shipment.id,
    kind: "incidencia.cerrada",
    payload: { kind: current.kind, alertaId: current.id, closeReason: parsed.data.reason },
    actor: user,
  });
  return viewById(current.id);
}

function viewById(id: string): OperationAlertView {
  const row = getDb()
    .prepare(
      `SELECT id, shipment_id, operation_id, kind, severity, status, source, evidence_json,
              opened_by, opened_at, updated_at, closed_at, closed_by, close_reason
       FROM ops_operation_alerts WHERE id = ?`,
    )
    .get(id) as {
    id: string;
    shipment_id: string;
    operation_id: string | null;
    kind: string;
    severity: "baja" | "media" | "alta";
    status: "abierta" | "cerrada";
    source: "automatica" | "manual";
    evidence_json: string;
    opened_by: string | null;
    opened_at: string;
    updated_at: string;
    closed_at: string | null;
    closed_by: string | null;
    close_reason: string | null;
  };
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    operationId: row.operation_id,
    kind: row.kind,
    severity: row.severity,
    status: row.status,
    source: row.source,
    evidence: parseEvidence(row.evidence_json),
    openedBy: row.opened_by,
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    closeReason: row.close_reason,
  };
}

export function listOperationAlerts(user: PublicUser, filter: { shipmentId?: string; operationId?: string }): { alerts: OperationAlertView[] } {
  if (!filter.shipmentId && !filter.operationId) throw new AppError("Envío no encontrado.", 404);
  if (filter.shipmentId) requireReadable(user, filter.shipmentId);
  const clauses: string[] = [];
  const args: string[] = [];
  if (filter.shipmentId) {
    clauses.push("shipment_id = ?");
    args.push(filter.shipmentId);
  }
  if (filter.operationId) {
    clauses.push("operation_id = ?");
    args.push(filter.operationId);
  }
  const rows = getDb()
    .prepare(
      `SELECT id FROM ops_operation_alerts WHERE ${clauses.join(" AND ")} ORDER BY opened_at ASC`,
    )
    .all(...args) as { id: string }[];
  const alerts = rows.map((row) => viewById(row.id)).filter((alert) => {
    if (user.role === "admin") return true;
    if (!filter.shipmentId) {
      try {
        requireReadable(user, alert.shipmentId);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  });
  return { alerts };
}
