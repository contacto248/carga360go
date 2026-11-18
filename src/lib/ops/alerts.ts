import { randomUUID } from "crypto";
import { z } from "zod";
import { auditStrict } from "../audit";
import { haversineM } from "../costos/geometry";
import { getDb } from "../db";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import type { EtaView, GeofenceHit } from "./eta-types";
import { atrasoMinDefault, detencionMinDefault, sinSenalMinDefault } from "./alert-config";
import { appendEvent, canReadShipment, type OpsShipment, type ShipmentStage } from "./shipments";

export const ALERT_KINDS = ["atraso", "detencion", "sin_senal"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_SEVERITIES = ["baja", "media", "alta"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/** No agrega kinds. La severidad solo clasifica los tres que ya existen. */
const KIND_SEVERITY: Record<AlertKind, AlertSeverity> = {
  atraso: "media",
  detencion: "alta",
  sin_senal: "alta",
};

const STOP_RADIUS_M = 200;

function defaultMinutes(): Record<AlertKind, number> {
  return { atraso: atrasoMinDefault(), detencion: detencionMinDefault(), sin_senal: sinSenalMinDefault() };
}

export type AlertView = {
  id: string;
  shipmentId: string;
  kind: AlertKind;
  severity: AlertSeverity;
  status: "abierta" | "cerrada";
  evidence: Record<string, unknown>;
  openedAt: string;
  updatedAt: string;
};

type Actor = Pick<PublicUser, "id" | "email"> | null | undefined;

type ShipmentRow = {
  id: string;
  load_id: string | null;
  shipper_org_id: string | null;
  carrier_org_id: string | null;
  planned_delivery_at: string | null;
  stage: string;
  rate_card_id: string | null;
  lane_id: string | null;
  assigned_offer_id: string | null;
  planned_pickup_at: string | null;
  created_at: string;
  updated_at: string;
};

const rulesSchema = z
  .object({
    atrasoMin: z.number().int().positive().max(10_080).optional(),
    detencionMin: z.number().int().positive().max(10_080).optional(),
    sinSenalMin: z.number().int().positive().max(10_080).optional(),
  })
  .refine((value) => value.atrasoMin != null || value.detencionMin != null || value.sinSenalMin != null, { message: "vacio" });

function mapShipment(row: ShipmentRow): OpsShipment {
  return {
    id: row.id,
    loadId: row.load_id,
    shipperOrgId: row.shipper_org_id,
    carrierOrgId: row.carrier_org_id,
    rateCardId: row.rate_card_id,
    laneId: row.lane_id,
    assignedOfferId: row.assigned_offer_id,
    stage: row.stage as ShipmentStage,
    plannedPickupAt: row.planned_pickup_at,
    plannedDeliveryAt: row.planned_delivery_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function shipmentOf(id: string): ShipmentRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, load_id, shipper_org_id, carrier_org_id, rate_card_id, lane_id, assigned_offer_id,
              stage, planned_pickup_at, planned_delivery_at, created_at, updated_at
       FROM ops_shipments WHERE id = ?`,
    )
    .get(id) as ShipmentRow | undefined;
  return row ?? null;
}

export function shipmentByLoad(loadId: string): ShipmentRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, load_id, shipper_org_id, carrier_org_id, rate_card_id, lane_id, assigned_offer_id,
              stage, planned_pickup_at, planned_delivery_at, created_at, updated_at
       FROM ops_shipments WHERE load_id = ?`,
    )
    .get(loadId) as ShipmentRow | undefined;
  return row ?? null;
}

function requireShipment(user: PublicUser, shipmentId: string): ShipmentRow {
  if (!z.string().uuid().safeParse(shipmentId).success) throw new AppError("Envío no encontrado.", 404);
  const row = shipmentOf(shipmentId);
  if (!row) throw new AppError("Envío no encontrado.", 404);
  if (!canReadShipment(user, mapShipment(row))) throw new AppError("No tienes permiso para ver este envío.", 403);
  return row;
}

function thresholds(shipmentId: string): Record<AlertKind, number> {
  const rows = getDb().prepare(`SELECT kind, threshold_min AS minutes FROM ops_alert_rules WHERE shipment_id = ?`).all(shipmentId) as {
    kind: AlertKind;
    minutes: number;
  }[];
  const out = defaultMinutes();
  for (const row of rows) if (ALERT_KINDS.includes(row.kind)) out[row.kind] = row.minutes;
  return out;
}

function asSeverity(value: string): AlertSeverity {
  return (ALERT_SEVERITIES as readonly string[]).includes(value) ? (value as AlertSeverity) : "media";
}

function parseEvidence(json: string): Record<string, unknown> {
  try {
    const value = JSON.parse(json) as Record<string, unknown>;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function setAlert(shipmentId: string, kind: AlertKind, open: boolean, evidence: Record<string, unknown>, actor: Actor) {
  const db = getDb();
  const now = new Date().toISOString();
  const current = db
    .prepare(`SELECT id, status FROM ops_alerts WHERE shipment_id = ? AND kind = ? AND status = 'abierta'`)
    .get(shipmentId, kind) as { id: string; status: string } | undefined;
  const payload = JSON.stringify(evidence);
  if (!open) {
    if (!current) return;
    db.prepare(`UPDATE ops_alerts SET status = 'cerrada', evidence_json = ?, updated_at = ? WHERE id = ?`).run(payload, now, current.id);
    return;
  }
  if (current) {
    db.prepare(`UPDATE ops_alerts SET evidence_json = ?, updated_at = ? WHERE id = ?`).run(payload, now, current.id);
    return;
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO ops_alerts (id, shipment_id, kind, status, severity, evidence_json, opened_at, updated_at) VALUES (?, ?, ?, 'abierta', ?, ?, ?, ?)`,
  ).run(id, shipmentId, kind, KIND_SEVERITY[kind], payload, now, now);
  auditStrict(actor ?? null, "ops.alerta_abierta", { type: "envio", id: shipmentId }, { kind, alertaId: id });
  appendEvent({ shipmentId, kind: "alerta.abierta", payload: { kind, alertaId: id }, actor });
}

function gpsPair(loadId: string): { id: string; lat: number; lng: number; recordedAt: string }[] {
  const exists = getDb().prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'trip_gps_points'`).get();
  if (!exists) return [];
  return getDb()
    .prepare(
      `SELECT id, lat, lng, recorded_at AS recordedAt FROM trip_gps_points
       WHERE load_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 2`,
    )
    .all(loadId) as { id: string; lat: number; lng: number; recordedAt: string }[];
}

function insideDestino(hits: GeofenceHit[] | undefined): boolean {
  return Boolean(hits?.find((hit) => hit.point === "destino" && hit.inside));
}

function latestGps(loadId: string): { id: string; recordedAt: string } | undefined {
  return gpsPair(loadId)[0];
}

function reviewSilent(shipmentId: string, loadId: string, actor: Actor, now: Date) {
  const latest = latestGps(loadId);
  if (!latest) return;
  const limits = thresholds(shipmentId);
  const silentMin = (now.getTime() - Date.parse(latest.recordedAt)) / 60_000;
  setAlert(
    shipmentId,
    "sin_senal",
    silentMin >= limits.sin_senal,
    { gpsPointId: latest.id, recordedAt: latest.recordedAt, minutos: Math.round(silentMin), umbralMin: limits.sin_senal },
    actor,
  );
}

/**
 * Abre o cierra sin_senal en envíos que ya tienen un punto GPS.
 * No se ejecuta solo. Lo invoca POST /api/ops/alertas/senal.
 * No hay cron en el servidor: quien opere decide cuándo llamarlo.
 * No recalcula detención ni atraso.
 */
export function evaluateSilentSignals(now = new Date()): { reviewed: number; opened: number; closed: number } {
  const db = getDb();
  const gpsReady = Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'trip_gps_points'`).get());
  if (!gpsReady) return { reviewed: 0, opened: 0, closed: 0 };
  const rows = db
    .prepare(
      `SELECT s.id AS shipmentId, s.load_id AS loadId
       FROM ops_shipments s
       WHERE s.load_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM trip_gps_points p WHERE p.load_id = s.load_id)`,
    )
    .all() as { shipmentId: string; loadId: string }[];
  let opened = 0;
  let closed = 0;
  for (const row of rows) {
    const wasOpen = Boolean(
      db.prepare(`SELECT 1 FROM ops_alerts WHERE shipment_id = ? AND kind = 'sin_senal' AND status = 'abierta'`).get(row.shipmentId),
    );
    reviewSilent(row.shipmentId, row.loadId, null, now);
    const isOpen = Boolean(
      db.prepare(`SELECT 1 FROM ops_alerts WHERE shipment_id = ? AND kind = 'sin_senal' AND status = 'abierta'`).get(row.shipmentId),
    );
    if (!wasOpen && isOpen) opened += 1;
    if (wasOpen && !isOpen) closed += 1;
  }
  return { reviewed: rows.length, opened, closed };
}

/** Abre o cierra alertas según la última posición, el ETA y los umbrales. sin_senal también la revisa evaluateSilentSignals. */
export function reviewAlerts(loadId: string, eta: EtaView | null, actor: Actor, now = new Date()): void {
  const shipment = shipmentByLoad(loadId);
  if (!shipment) return;
  const limits = thresholds(shipment.id);
  const points = gpsPair(loadId);
  const latest = points[0];
  const previous = points[1];

  if (latest && previous) {
    const distanceM = Math.round(haversineM({ lat: latest.lat, lon: latest.lng }, { lat: previous.lat, lon: previous.lng }));
    const minutes = (Date.parse(latest.recordedAt) - Date.parse(previous.recordedAt)) / 60_000;
    const stopped = distanceM <= STOP_RADIUS_M && minutes >= limits.detencion && !insideDestino(eta?.evaluacion);
    setAlert(
      shipment.id,
      "detencion",
      stopped,
      { gpsPointId: latest.id, distanciaM: distanceM, minutos: Math.round(minutes), umbralMin: limits.detencion, radioM: STOP_RADIUS_M },
      actor,
    );
  }

  if (eta) {
    const planned = shipment.planned_delivery_at ? Date.parse(shipment.planned_delivery_at) : Number.NaN;
    const etaMs = Date.parse(eta.etaAt);
    const late = Number.isFinite(planned) && Number.isFinite(etaMs) && etaMs > planned + limits.atraso * 60_000;
    setAlert(
      shipment.id,
      "atraso",
      late,
      { etaAt: eta.etaAt, plannedDeliveryAt: shipment.planned_delivery_at, umbralMin: limits.atraso, gpsPointId: eta.gpsPointId, truckAware: false },
      actor,
    );
  }

  if (latest) reviewSilent(shipment.id, loadId, actor, now);
}

export function listAlerts(user: PublicUser, shipmentId: string, now = new Date()): { alerts: AlertView[]; thresholds: Record<AlertKind, number> } {
  const shipment = requireShipment(user, shipmentId);
  if (shipment.load_id) reviewAlerts(shipment.load_id, null, user, now);
  const rows = getDb()
    .prepare(
      `SELECT id, shipment_id, kind, severity, status, evidence_json, opened_at, updated_at
       FROM ops_alerts WHERE shipment_id = ? ORDER BY opened_at ASC`,
    )
    .all(shipment.id) as {
    id: string;
    shipment_id: string;
    kind: AlertKind;
    severity: string;
    status: "abierta" | "cerrada";
    evidence_json: string;
    opened_at: string;
    updated_at: string;
  }[];
  return {
    thresholds: thresholds(shipment.id),
    alerts: rows.map((row) => ({
      id: row.id,
      shipmentId: row.shipment_id,
      kind: row.kind,
      severity: asSeverity(row.severity),
      status: row.status,
      evidence: parseEvidence(row.evidence_json),
      openedAt: row.opened_at,
      updatedAt: row.updated_at,
    })),
  };
}

const KIND_FIELD: Record<AlertKind, "atrasoMin" | "detencionMin" | "sinSenalMin"> = {
  atraso: "atrasoMin",
  detencion: "detencionMin",
  sin_senal: "sinSenalMin",
};

export function saveThresholds(user: PublicUser, shipmentId: string, body: unknown): Record<AlertKind, number> {
  const shipment = requireShipment(user, shipmentId);
  const parsed = rulesSchema.safeParse(body);
  if (!parsed.success) throw new AppError("Revisa los datos enviados.");
  const now = new Date().toISOString();
  const db = getDb();
  db.transaction(() => {
    for (const kind of ALERT_KINDS) {
      const minutes = parsed.data[KIND_FIELD[kind]];
      if (minutes == null) continue;
      const id = randomUUID();
      db.prepare(
        `INSERT INTO ops_alert_rules (id, shipment_id, kind, threshold_min, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(shipment_id, kind) DO UPDATE SET threshold_min = excluded.threshold_min, updated_at = excluded.updated_at`,
      ).run(id, shipment.id, kind, minutes, now, now);
    }
    auditStrict(user, "ops.alerta_umbral", { type: "envio", id: shipment.id }, parsed.data);
  })();
  return thresholds(shipment.id);
}
