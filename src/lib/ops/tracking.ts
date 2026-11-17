import { randomBytes } from "crypto";
import { z } from "zod";
import { auditStrict } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import { reviewAlerts } from "./alerts";
import { latestPublicEta } from "./eta";
import { canReadShipment, type OpsShipment, type ShipmentStage } from "./shipments";

export type TrackingView = {
  token: string;
  stage: string;
  origin: string | null;
  destination: string | null;
  position: { lat: number; lng: number; recordedAt: string } | null;
  etaAt: string | null;
  truckAware: false;
  alerts: { kind: "atraso" | "detencion" | "sin_senal" }[];
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
  created_at: string;
  updated_at: string;
};

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

function requireShipment(user: PublicUser, shipmentId: string): ShipmentRow {
  if (!z.string().uuid().safeParse(shipmentId).success) throw new AppError("Envío no encontrado.", 404);
  const row = getDb()
    .prepare(
      `SELECT id, load_id, shipper_org_id, carrier_org_id, rate_card_id, lane_id, assigned_offer_id,
              stage, planned_pickup_at, planned_delivery_at, created_at, updated_at
       FROM ops_shipments WHERE id = ?`,
    )
    .get(shipmentId) as ShipmentRow | undefined;
  if (!row) throw new AppError("Envío no encontrado.", 404);
  if (!canReadShipment(user, mapShipment(row))) throw new AppError("No tienes permiso para ver este envío.", 403);
  return row;
}

function viewFor(shipmentId: string, token: string): TrackingView {
  const row = getDb()
    .prepare(
      `SELECT s.stage AS stage, l.origin AS origin, l.destination AS destination, s.load_id AS loadId
       FROM ops_shipments s LEFT JOIN loads l ON l.id = s.load_id WHERE s.id = ?`,
    )
    .get(shipmentId) as { stage: string; origin: string | null; destination: string | null; loadId: string | null } | undefined;
  if (!row) throw new AppError("No encontrado.", 404);
  if (row.loadId) reviewAlerts(row.loadId, latestPublicEta(shipmentId), null);
  const gpsReady = Boolean(getDb().prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'trip_gps_points'`).get());
  const position =
    row.loadId && gpsReady
      ? (getDb()
          .prepare(
            `SELECT lat, lng, recorded_at AS recordedAt FROM trip_gps_points
             WHERE load_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1`,
          )
          .get(row.loadId) as { lat: number; lng: number; recordedAt: string } | undefined)
      : undefined;
  const eta = latestPublicEta(shipmentId);
  const alerts = getDb()
    .prepare(`SELECT kind FROM ops_alerts WHERE shipment_id = ? AND status = 'abierta' ORDER BY kind`)
    .all(shipmentId) as { kind: TrackingView["alerts"][number]["kind"] }[];
  return {
    token,
    stage: row.stage,
    origin: row.origin,
    destination: row.destination,
    position: position ?? null,
    etaAt: eta?.etaAt ?? null,
    truckAware: false,
    alerts,
  };
}

/** Un token por envío. No incluye correo, teléfono ni nombre. */
export function issueTrackingLink(user: PublicUser, shipmentId: string): { token: string; path: string; created: boolean } {
  const shipment = requireShipment(user, shipmentId);
  const db = getDb();
  const existing = db.prepare(`SELECT token FROM ops_tracking_links WHERE shipment_id = ?`).get(shipment.id) as { token: string } | undefined;
  if (existing) return { token: existing.token, path: `/seguimiento/${existing.token}`, created: false };
  const token = randomBytes(24).toString("base64url");
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`INSERT INTO ops_tracking_links (token, shipment_id, created_at) VALUES (?, ?, ?)`).run(token, shipment.id, now);
    auditStrict(user, "ops.seguimiento_emitido", { type: "envio", id: shipment.id }, { token });
  })();
  return { token, path: `/seguimiento/${token}`, created: true };
}

export function readTracking(token: string): TrackingView {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) throw new AppError("No encontrado.", 404);
  const row = getDb().prepare(`SELECT shipment_id AS shipmentId FROM ops_tracking_links WHERE token = ?`).get(token) as
    | { shipmentId: string }
    | undefined;
  if (!row) throw new AppError("No encontrado.", 404);
  return viewFor(row.shipmentId, token);
}
