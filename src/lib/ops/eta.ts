import { randomUUID } from "crypto";
import { z } from "zod";
import { auditStrict } from "../audit";
import { haversineM } from "../costos/geometry";
import { getParams } from "../costos/params";
import { osrmProvider } from "../costos/routing";
import { getDb } from "../db";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import { reviewAlerts, shipmentByLoad } from "./alerts";
import type { EtaView, GeofenceHit, GeofencePoint } from "./eta-types";
import { isEnabled } from "./flags";
import { appendEvent, canReadShipment, type OpsShipment, type ShipmentStage } from "./shipments";

export type { EtaView, GeofenceHit, GeofencePoint };

const AVISO_PERFIL_AUTO =
  "OSRM público usa perfil de auto: no conoce restricciones de camión. La hora estimada multiplica esa duración por el factor de camión.";

const geofenceSchema = z.object({
  point: z.enum(["origen", "destino"]),
  lat: z.number().finite().gte(-56).lte(-17),
  lng: z.number().finite().gte(-109.5).lte(-66),
  radiusM: z.number().finite().gt(0).lte(50_000),
});

export type OpsGeofence = {
  id: string;
  shipmentId: string;
  point: GeofencePoint;
  lat: number;
  lng: number;
  radiusM: number;
  createdAt: string;
  updatedAt: string;
};

type Actor = Pick<PublicUser, "id" | "email"> | null | undefined;

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
  created_at: string;
  updated_at: string;
};

type GeofenceRow = {
  id: string;
  shipment_id: string;
  point: GeofencePoint;
  lat: number;
  lng: number;
  radius_m: number;
  created_at: string;
  updated_at: string;
};

type EtaRow = {
  id: string;
  shipment_id: string;
  gps_point_id: string | null;
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  recorded_at: string;
  distance_m: number;
  duration_s: number;
  duration_truck_s: number;
  factor: number;
  eta_at: string;
  profile: string;
  truck_aware: number;
  evaluacion_json: string;
  created_at: string;
};

type GpsPoint = { id: string; lat: number; lng: number; recordedAt: string };

const SHIPMENT_SELECT = `SELECT id, load_id, shipper_org_id, carrier_org_id, rate_card_id, lane_id, assigned_offer_id,
  stage, planned_pickup_at, planned_delivery_at, created_at, updated_at FROM ops_shipments`;

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGeofence(row: GeofenceRow): OpsGeofence {
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    point: row.point,
    lat: row.lat,
    lng: row.lng,
    radiusM: row.radius_m,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseHits(json: string): GeofenceHit[] {
  try {
    const value = JSON.parse(json) as GeofenceHit[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function mapEta(row: EtaRow, recalculado: boolean): EtaView {
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    gpsPointId: row.gps_point_id,
    from: { lat: row.from_lat, lng: row.from_lng },
    to: { lat: row.to_lat, lng: row.to_lng },
    recordedAt: row.recorded_at,
    distanceM: row.distance_m,
    durationS: row.duration_s,
    durationTruckS: row.duration_truck_s,
    factorDuracionCamion: row.factor,
    etaAt: row.eta_at,
    provider: "osrm",
    profile: row.profile,
    truckAware: false,
    aviso: row.truck_aware === 0 ? AVISO_PERFIL_AUTO : "",
    evaluacion: parseHits(row.evaluacion_json),
    createdAt: row.created_at,
    recalculado,
  };
}

function requireShipment(user: PublicUser, shipmentId: string): ShipmentRow {
  if (!z.string().uuid().safeParse(shipmentId).success) throw new AppError("Envío no encontrado.", 404);
  const row = getDb().prepare(`${SHIPMENT_SELECT} WHERE id = ?`).get(shipmentId) as ShipmentRow | undefined;
  if (!row) throw new AppError("Envío no encontrado.", 404);
  if (!canReadShipment(user, mapShipment(row))) throw new AppError("No tienes permiso para ver este envío.", 403);
  return row;
}

function loadShipment(shipmentId: string): ShipmentRow | null {
  const row = getDb().prepare(`${SHIPMENT_SELECT} WHERE id = ?`).get(shipmentId) as ShipmentRow | undefined;
  return row ?? null;
}

function geofenceRows(shipmentId: string): GeofenceRow[] {
  return getDb()
    .prepare(
      `SELECT id, shipment_id, point, lat, lng, radius_m, created_at, updated_at
       FROM ops_geofences WHERE shipment_id = ? ORDER BY CASE point WHEN 'origen' THEN 0 ELSE 1 END`,
    )
    .all(shipmentId) as GeofenceRow[];
}

function latestGps(loadId: string): GpsPoint | null {
  const exists = getDb().prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'trip_gps_points'`).get();
  if (!exists) return null;
  const row = getDb()
    .prepare(
      `SELECT id, lat, lng, recorded_at AS recordedAt FROM trip_gps_points
       WHERE load_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1`,
    )
    .get(loadId) as GpsPoint | undefined;
  return row ?? null;
}

export function evaluatePosition(position: { lat: number; lng: number }, fences: OpsGeofence[]): GeofenceHit[] {
  return fences.map((fence) => {
    const distanceM = haversineM({ lat: position.lat, lon: position.lng }, { lat: fence.lat, lon: fence.lng });
    return { point: fence.point, inside: distanceM <= fence.radiusM, distanceM: Math.round(distanceM), radiusM: fence.radiusM };
  });
}

export function listGeofences(user: PublicUser, shipmentId: string): OpsGeofence[] {
  const shipment = requireShipment(user, shipmentId);
  return geofenceRows(shipment.id).map(mapGeofence);
}

export function saveGeofence(user: PublicUser, shipmentId: string, body: unknown): { geofence: OpsGeofence; created: boolean } {
  const shipment = requireShipment(user, shipmentId);
  const parsed = geofenceSchema.safeParse(body);
  if (!parsed.success) throw new AppError("Revisa los datos enviados.");
  const lat = round6(parsed.data.lat);
  const lng = round6(parsed.data.lng);
  const now = new Date().toISOString();
  const db = getDb();
  const existing = db.prepare(`SELECT id, created_at FROM ops_geofences WHERE shipment_id = ? AND point = ?`).get(shipment.id, parsed.data.point) as
    | { id: string; created_at: string }
    | undefined;
  const created = !existing;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO ops_geofences (id, shipment_id, point, lat, lng, radius_m, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(shipment_id, point) DO UPDATE SET
         lat = excluded.lat, lng = excluded.lng, radius_m = excluded.radius_m, updated_at = excluded.updated_at`,
    ).run(existing?.id ?? randomUUID(), shipment.id, parsed.data.point, lat, lng, parsed.data.radiusM, existing?.created_at ?? now, now);
    auditStrict(user, created ? "ops.geocerca_alta" : "ops.geocerca_actualizada", { type: "envio", id: shipment.id }, {
      point: parsed.data.point,
      lat,
      lng,
      radiusM: parsed.data.radiusM,
    });
    appendEvent({
      shipmentId: shipment.id,
      kind: created ? "geocerca.alta" : "geocerca.actualizada",
      payload: { point: parsed.data.point, lat, lng, radiusM: parsed.data.radiusM },
      actor: user,
    });
  })();
  const row = db
    .prepare(`SELECT id, shipment_id, point, lat, lng, radius_m, created_at, updated_at FROM ops_geofences WHERE shipment_id = ? AND point = ?`)
    .get(shipment.id, parsed.data.point) as GeofenceRow;
  return { geofence: mapGeofence(row), created };
}

export function evaluateLatest(user: PublicUser, shipmentId: string): { position: GpsPoint; evaluacion: GeofenceHit[] } {
  const shipment = requireShipment(user, shipmentId);
  if (!shipment.load_id) throw new AppError("El envío no tiene una carga asociada.", 409);
  const position = latestGps(shipment.load_id);
  if (!position) throw new AppError("Todavía no hay una posición GPS para este envío.", 409);
  return { position, evaluacion: evaluatePosition(position, geofenceRows(shipment.id).map(mapGeofence)) };
}

function storedFor(shipmentId: string, gpsPointId: string, lat: number, lng: number): EtaRow | null {
  const rows = getDb()
    .prepare(
      `SELECT id, shipment_id, gps_point_id, from_lat, from_lng, to_lat, to_lng, recorded_at, distance_m, duration_s,
              duration_truck_s, factor, eta_at, profile, truck_aware, evaluacion_json, created_at
       FROM ops_eta_snapshots WHERE shipment_id = ? AND gps_point_id = ? ORDER BY created_at DESC`,
    )
    .all(shipmentId, gpsPointId) as EtaRow[];
  return rows.find((row) => Math.abs(row.to_lat - lat) < 5e-7 && Math.abs(row.to_lng - lng) < 5e-7) ?? null;
}

function mapRow(shipmentId: string): EtaView | null {
  const row = getDb()
    .prepare(
      `SELECT id, shipment_id, gps_point_id, from_lat, from_lng, to_lat, to_lng, recorded_at, distance_m, duration_s,
              duration_truck_s, factor, eta_at, profile, truck_aware, evaluacion_json, created_at
       FROM ops_eta_snapshots WHERE shipment_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(shipmentId) as EtaRow | undefined;
  return row ? mapEta(row, false) : null;
}

export function latestEta(user: PublicUser, shipmentId: string): EtaView | null {
  const shipment = requireShipment(user, shipmentId);
  return mapRow(shipment.id);
}

async function computeEta(shipment: ShipmentRow, actor: Actor, missing: "error" | "skip"): Promise<EtaView | null> {
  if (!shipment.load_id) {
    if (missing === "skip") return null;
    throw new AppError("El envío no tiene una carga asociada.", 409);
  }
  const position = latestGps(shipment.load_id);
  if (!position) {
    if (missing === "skip") return null;
    throw new AppError("Todavía no hay una posición GPS para este envío.", 409);
  }
  const fences = geofenceRows(shipment.id).map(mapGeofence);
  const destino = fences.find((fence) => fence.point === "destino");
  if (!destino) {
    if (missing === "skip") return null;
    throw new AppError("Falta la geocerca de destino.", 409);
  }
  const toLat = round6(destino.lat);
  const toLng = round6(destino.lng);
  const cached = storedFor(shipment.id, position.id, toLat, toLng);
  if (cached) return mapEta(cached, false);

  let routed;
  try {
    routed = await osrmProvider.route([
      { lat: position.lat, lon: position.lng },
      { lat: toLat, lon: toLng },
    ]);
  } catch (error) {
    if (missing === "skip") {
      console.error("ops.eta", error);
      return null;
    }
    const detail = error instanceof Error ? error.message : "OSRM no respondió";
    throw new AppError(`No se pudo calcular el ETA. ${detail}`, 502);
  }
  const factor = routed.truckAware ? 1 : getParams().factorDuracionCamion;
  const durationTruckS = routed.durationS * factor;
  const recordedMs = Date.parse(position.recordedAt);
  if (!Number.isFinite(recordedMs)) throw new AppError("La posición GPS no tiene una hora válida.", 409);
  const etaAt = new Date(recordedMs + durationTruckS * 1000).toISOString();
  const evaluacion = evaluatePosition(position, fences);
  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const db = getDb();
  const savedId = db.transaction(() => {
    const again = storedFor(shipment.id, position.id, toLat, toLng);
    if (again) return again.id;
    db.prepare(
      `INSERT INTO ops_eta_snapshots (
        id, shipment_id, gps_point_id, from_lat, from_lng, to_lat, to_lng, recorded_at,
        distance_m, duration_s, duration_truck_s, factor, eta_at, provider, profile, truck_aware, evaluacion_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'osrm', ?, ?, ?, ?)`,
    ).run(
      id,
      shipment.id,
      position.id,
      position.lat,
      position.lng,
      toLat,
      toLng,
      position.recordedAt,
      routed.distanceM,
      routed.durationS,
      durationTruckS,
      factor,
      etaAt,
      routed.profile,
      routed.truckAware ? 1 : 0,
      JSON.stringify(evaluacion),
      createdAt,
    );
    auditStrict(actor ?? null, "ops.eta_calculado", { type: "envio", id: shipment.id }, {
      gpsPointId: position.id,
      etaAt,
      distanceM: routed.distanceM,
      durationS: routed.durationS,
      durationTruckS,
      truckAware: false,
      provider: "osrm",
    });
    appendEvent({
      shipmentId: shipment.id,
      kind: "eta.calculado",
      payload: {
        gpsPointId: position.id,
        etaAt,
        distanceM: routed.distanceM,
        durationS: routed.durationS,
        durationTruckS,
        truckAware: false,
        provider: "osrm",
      },
      actor,
    });
    return id;
  })();
  const row = db
    .prepare(
      `SELECT id, shipment_id, gps_point_id, from_lat, from_lng, to_lat, to_lng, recorded_at, distance_m, duration_s,
              duration_truck_s, factor, eta_at, profile, truck_aware, evaluacion_json, created_at
       FROM ops_eta_snapshots WHERE id = ?`,
    )
    .get(savedId) as EtaRow;
  return mapEta(row, savedId === id);
}

export async function recalculateEta(user: PublicUser, shipmentId: string): Promise<EtaView> {
  const shipment = requireShipment(user, shipmentId);
  const eta = await computeEta(shipment, user, "error");
  if (!eta) throw new AppError("No se pudo calcular el ETA.", 502);
  if (shipment.load_id) reviewAlerts(shipment.load_id, eta, user);
  return eta;
}

async function refreshEtaForLoad(loadId: string, actor: Actor): Promise<EtaView | null> {
  const brief = shipmentByLoad(loadId);
  if (!brief) return null;
  const shipment = loadShipment(brief.id);
  if (!shipment) return null;
  return computeEta(shipment, actor, "skip");
}

/** Lo llama el conector justo después de guardar el punto en trip_gps_points. */
export async function onConnectorPoint(loadId: string, actor: Actor): Promise<void> {
  if (!isEnabled("OPS_FEATURE_ENABLED")) return;
  try {
    const eta = await refreshEtaForLoad(loadId, actor);
    reviewAlerts(loadId, eta, actor);
  } catch (error) {
    console.error("ops.eta", error);
  }
}

export function latestPublicEta(shipmentId: string): EtaView | null {
  return mapRow(shipmentId);
}
