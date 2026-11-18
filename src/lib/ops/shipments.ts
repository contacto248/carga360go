import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import { auditStrict } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import type { PublicUser } from "../types";

export const SHIPMENT_STAGES = [
  "negociacion",
  "asignacion",
  "ejecucion",
  "pod",
  "auditoria",
  "facturacion",
  "pago",
  "cerrado",
  "cancelado",
] as const;

export type ShipmentStage = (typeof SHIPMENT_STAGES)[number];

export type OpsShipment = {
  id: string;
  loadId: string | null;
  shipperOrgId: string | null;
  carrierOrgId: string | null;
  rateCardId: string | null;
  laneId: string | null;
  assignedOfferId: string | null;
  stage: ShipmentStage;
  plannedPickupAt: string | null;
  plannedDeliveryAt: string | null;
  operationId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OpsEvent = {
  id: string;
  shipmentId: string;
  seq: number;
  actorId: string | null;
  kind: string;
  payloadJson: string;
  prevHash: string;
  hash: string;
  createdAt: string;
};

export type ChainResult =
  | { ok: true; events: number }
  | { ok: false; events: number; seq: number; reason: string };

const uuidSchema = z.string().uuid();
const kindSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_.]*$/);
const payloadSchema = z.record(z.string(), z.unknown());

type Actor = Pick<PublicUser, "id" | "email"> | null | undefined;

type LoadSnap = {
  id: string;
  status: string | null;
  trip_status: string | null;
  pickup_date: string;
  awarded_offer_id: string | null;
};

type ShipmentRow = {
  id: string;
  load_id: string | null;
  shipper_org_id: string | null;
  carrier_org_id: string | null;
  rate_card_id: string | null;
  lane_id: string | null;
  assigned_offer_id: string | null;
  stage: string;
  planned_pickup_at: string | null;
  planned_delivery_at: string | null;
  operation_id: string | null;
  created_at: string;
  updated_at: string;
};

const SHIPMENT_SELECT = `SELECT id, load_id, shipper_org_id, carrier_org_id, rate_card_id, lane_id, assigned_offer_id,
  stage, planned_pickup_at, planned_delivery_at, operation_id, created_at, updated_at FROM ops_shipments`;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) out[key] = canonicalize(record[key]);
    return out;
  }
  return value;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "{}";
  return JSON.stringify(canonicalize(value));
}

/**
 * Hash encadenado. El material es un JSON con los cinco campos en este orden,
 * para que no se puedan deslizar caracteres de un campo al siguiente:
 * sha256(prev_hash || seq || kind || payload_json || created_at).
 */
export function eventHash(prevHash: string, seq: number, kind: string, payloadJson: string, createdAt: string): string {
  const material = JSON.stringify([prevHash, seq, kind, payloadJson, createdAt]);
  return createHash("sha256").update(material, "utf8").digest("hex");
}

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
    operationId: row.operation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getShipmentRow(id: string): ShipmentRow | null {
  const row = getDb().prepare(`${SHIPMENT_SELECT} WHERE id = ?`).get(id) as ShipmentRow | undefined;
  return row ?? null;
}

function stageForLoad(load: LoadSnap): ShipmentStage {
  const status = load.status ?? "abierta";
  if (status === "cerrada") return "cerrado";
  const trip = load.trip_status;
  if (trip === "entregado") return "pod";
  if (trip === "en_camino" || trip === "retirado" || trip === "en_transito" || trip === "incidencia") return "ejecucion";
  if (status === "adjudicada") return "asignacion";
  return "negociacion";
}

function insertEvent(
  shipmentId: string,
  kind: string,
  payload: Record<string, unknown>,
  actorId: string | null,
  createdAt: string,
): OpsEvent {
  const db = getDb();
  const last = db.prepare(`SELECT seq, hash FROM ops_events WHERE shipment_id = ? ORDER BY seq DESC LIMIT 1`).get(shipmentId) as
    | { seq: number; hash: string }
    | undefined;
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? "";
  const payloadJson = stableStringify(payload);
  const hash = eventHash(prevHash, seq, kind, payloadJson, createdAt);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO ops_events (id, shipment_id, seq, actor_id, kind, payload_json, prev_hash, hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, shipmentId, seq, actorId, kind, payloadJson, prevHash, hash, createdAt);
  return { id, shipmentId, seq, actorId, kind, payloadJson, prevHash, hash, createdAt };
}

/** Crea el envío de una carga si no existe. Lee loads; no lo modifica. */
export function ensureShipmentForLoad(loadId: string, actor?: Actor): OpsShipment {
  if (!uuidSchema.safeParse(loadId).success) throw new AppError("Carga no encontrada.", 404);
  const db = getDb();
  const already = db.prepare(`${SHIPMENT_SELECT} WHERE load_id = ?`).get(loadId) as ShipmentRow | undefined;
  if (already) return mapShipment(already);

  const load = db
    .prepare(`SELECT id, status, trip_status, pickup_date, awarded_offer_id FROM loads WHERE id = ?`)
    .get(loadId) as LoadSnap | undefined;
  if (!load) throw new AppError("Carga no encontrada.", 404);

  const id = randomUUID();
  const now = new Date().toISOString();
  const stage = stageForLoad(load);
  const run = db.transaction(() => {
    const raced = db.prepare(`${SHIPMENT_SELECT} WHERE load_id = ?`).get(loadId) as ShipmentRow | undefined;
    if (raced) return raced.id;
    db.prepare(
      `INSERT INTO ops_shipments (
        id, load_id, shipper_org_id, carrier_org_id, rate_card_id, lane_id, assigned_offer_id,
        stage, planned_pickup_at, planned_delivery_at, created_at, updated_at
      ) VALUES (?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, ?, ?)`,
    ).run(id, load.id, load.awarded_offer_id, stage, load.pickup_date, now, now);
    insertEvent(id, "envio.creado", { loadId: load.id, etapa: stage }, actor?.id ?? null, now);
    auditStrict(actor ?? null, "ops.envio_creado", { type: "envio", id }, { loadId: load.id, etapa: stage });
    return id;
  });

  let shipmentId: string;
  try {
    shipmentId = run();
  } catch (error) {
    const raced = db.prepare(`${SHIPMENT_SELECT} WHERE load_id = ?`).get(loadId) as ShipmentRow | undefined;
    if (raced) return mapShipment(raced);
    throw error;
  }
  const row = getShipmentRow(shipmentId);
  if (!row) throw new AppError("No se pudo crear el envío.", 500);
  return mapShipment(row);
}

/** Agrega un evento y encadena su hash con el anterior. No escribe en loads, offers ni trip_events. */
export function appendEvent(input: { shipmentId: string; kind: string; payload?: Record<string, unknown>; actor?: Actor }): OpsEvent {
  if (!uuidSchema.safeParse(input.shipmentId).success) throw new AppError("Envío no encontrado.", 404);
  const kind = kindSchema.safeParse(input.kind);
  if (!kind.success) throw new AppError("El tipo de evento no es válido.", 400);
  const payload = payloadSchema.safeParse(input.payload ?? {});
  if (!payload.success) throw new AppError("El detalle del evento no es válido.", 400);
  const db = getDb();
  if (!db.prepare(`SELECT 1 FROM ops_shipments WHERE id = ?`).get(input.shipmentId)) {
    throw new AppError("Envío no encontrado.", 404);
  }
  const createdAt = new Date().toISOString();
  const actor = input.actor ?? null;
  const run = db.transaction(() => {
    const event = insertEvent(input.shipmentId, kind.data, payload.data, actor?.id ?? null, createdAt);
    db.prepare(`UPDATE ops_shipments SET updated_at = ? WHERE id = ?`).run(createdAt, input.shipmentId);
    auditStrict(actor, "ops.evento", { type: "envio", id: input.shipmentId }, { seq: event.seq, kind: event.kind });
    return event;
  });
  return run();
}

/** Recalcula la cadena. Alterar payload_json, el orden o un hash intermedio la deja inválida. */
export function verifyChain(shipmentId: string): ChainResult {
  if (!uuidSchema.safeParse(shipmentId).success) {
    return { ok: false, events: 0, seq: 0, reason: "Envío no encontrado." };
  }
  const db = getDb();
  if (!db.prepare(`SELECT 1 FROM ops_shipments WHERE id = ?`).get(shipmentId)) {
    return { ok: false, events: 0, seq: 0, reason: "Envío no encontrado." };
  }
  const rows = db
    .prepare(
      `SELECT seq, kind, payload_json AS payloadJson, prev_hash AS prevHash, hash, created_at AS createdAt
       FROM ops_events WHERE shipment_id = ? ORDER BY seq ASC`,
    )
    .all(shipmentId) as { seq: number; kind: string; payloadJson: string; prevHash: string; hash: string; createdAt: string }[];

  let prev = "";
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const expectedSeq = index + 1;
    if (row.seq !== expectedSeq) {
      return { ok: false, events: rows.length, seq: row.seq, reason: "La secuencia está rota." };
    }
    if (row.prevHash !== prev) {
      return { ok: false, events: rows.length, seq: row.seq, reason: "El eslabón anterior no coincide." };
    }
    const expected = eventHash(row.prevHash, row.seq, row.kind, row.payloadJson, row.createdAt);
    if (row.hash !== expected) {
      return { ok: false, events: rows.length, seq: row.seq, reason: "El hash no coincide con el contenido." };
    }
    prev = row.hash;
  }
  return { ok: true, events: rows.length };
}

function orgMembersTable(): boolean {
  return Boolean(getDb().prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ops_org_members'`).get());
}

/** Admin de plataforma, u org_admin/trafico activo de una organización del envío. */
export function canReadShipment(user: PublicUser, shipment: OpsShipment): boolean {
  if (user.role === "admin") return true;
  const orgs = [shipment.shipperOrgId, shipment.carrierOrgId].filter((id): id is string => Boolean(id));
  if (orgs.length === 0 || !orgMembersTable()) return false;
  const placeholders = orgs.map(() => "?").join(", ");
  const row = getDb()
    .prepare(
      `SELECT 1 FROM ops_org_members
       WHERE user_id = ? AND status = 'activo' AND ops_role IN ('org_admin', 'trafico')
         AND org_id IN (${placeholders})
       LIMIT 1`,
    )
    .get(user.id, ...orgs);
  return Boolean(row);
}

function assertReadable(user: PublicUser, shipmentId: string): OpsShipment {
  if (!uuidSchema.safeParse(shipmentId).success) throw new AppError("Envío no encontrado.", 404);
  const row = getShipmentRow(shipmentId);
  if (!row) throw new AppError("Envío no encontrado.", 404);
  const shipment = mapShipment(row);
  if (!canReadShipment(user, shipment)) throw new AppError("No tienes permiso para ver este envío.", 403);
  return shipment;
}

function listEvents(shipmentId: string) {
  const rows = getDb()
    .prepare(
      `SELECT id, seq, actor_id AS actorId, kind, payload_json AS payloadJson, prev_hash AS prevHash, hash, created_at AS createdAt
       FROM ops_events WHERE shipment_id = ? ORDER BY seq ASC`,
    )
    .all(shipmentId) as {
    id: string;
    seq: number;
    actorId: string | null;
    kind: string;
    payloadJson: string;
    prevHash: string;
    hash: string;
    createdAt: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    seq: row.seq,
    actorId: row.actorId,
    kind: row.kind,
    payload: parsePayload(row.payloadJson),
    prevHash: row.prevHash,
    hash: row.hash,
    createdAt: row.createdAt,
  }));
}

function parsePayload(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return json;
  }
}

/** Lectura de trip_events y offers. No copia ni mueve filas. */
function derivedForLoad(loadId: string | null) {
  if (!loadId) return { tripEvents: [], offers: [] };
  const db = getDb();
  const tripEvents = db
    .prepare(
      `SELECT id, status, note, actor_id AS actorId, created_at AS createdAt
       FROM trip_events WHERE load_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(loadId);
  const offers = db
    .prepare(
      `SELECT id, status, price_clp AS priceClp, pickup_date AS pickupDate, created_at AS createdAt
       FROM offers WHERE load_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(loadId);
  return { tripEvents, offers };
}

export function readShipment(shipmentId: string, user: PublicUser) {
  const shipment = assertReadable(user, shipmentId);
  return {
    shipment,
    events: listEvents(shipment.id),
    derived: derivedForLoad(shipment.loadId),
    chain: verifyChain(shipment.id),
  };
}

const OPERATION_CODE = /^360-\d{4}-\d{4}$/;

/**
 * Vincula el envío con una operación ya creada. El id público es 360-YYMM-NNNN.
 * No crea tablas. Audita ops.envio_operacion y deja el evento envio.operacion_vinculada.
 */
export function linkShipmentToOperation(user: PublicUser, shipmentId: string, operationId: string): OpsShipment {
  const shipment = assertReadable(user, shipmentId);
  if (!OPERATION_CODE.test(operationId)) throw new AppError("Revisa los datos enviados.");
  const db = getDb();
  const operation = db.prepare(`SELECT id FROM ops_operations WHERE id = ?`).get(operationId) as { id: string } | undefined;
  if (!operation) throw new AppError("Operación no encontrada.", 404);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`UPDATE ops_shipments SET operation_id = ?, updated_at = ? WHERE id = ?`).run(operation.id, now, shipment.id);
    insertEvent(shipment.id, "envio.operacion_vinculada", { operationId: operation.id }, user.id, now);
    auditStrict(user, "ops.envio_operacion", { type: "envio", id: shipment.id }, { operationId: operation.id });
  })();
  const row = getShipmentRow(shipment.id);
  if (!row) throw new AppError("Envío no encontrado.", 404);
  return mapShipment(row);
}

/** Listado del panel de administración. Quien no es admin de plataforma recibe 404. */
export function listShipments(user: PublicUser): OpsShipment[] {
  if (user.role !== "admin") throw new AppError("No encontrado.", 404);
  const rows = getDb().prepare(`${SHIPMENT_SELECT} ORDER BY updated_at DESC, id LIMIT 200`).all() as ShipmentRow[];
  return rows.map(mapShipment);
}

export function readShipmentVerification(shipmentId: string, user: PublicUser) {
  const shipment = assertReadable(user, shipmentId);
  return { shipmentId: shipment.id, ...verifyChain(shipment.id) };
}
