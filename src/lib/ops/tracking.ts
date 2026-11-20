import { randomBytes, timingSafeEqual } from "crypto";
import { z } from "zod";
import { auditStrict } from "../audit";
import { tokenHash } from "../auth";
import { getDb } from "../db";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import { latestPublicEta } from "./eta";
import { canReadShipment, type OpsShipment, type ShipmentStage } from "./shipments";
import { ENLACE_YA_EMITIDO } from "./tracking-message";

export type TrackingView = {
  token: string;
  stage: string;
  origin: string | null;
  destination: string | null;
  position: { lat: number; lng: number; recordedAt: string } | null;
  etaAt: string | null;
  truckAware: false;
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
  return {
    token,
    stage: row.stage,
    origin: row.origin,
    destination: row.destination,
    position: position ?? null,
    etaAt: eta?.etaAt ?? null,
    truckAware: false,
  };
}

const DUMMY_TOKEN_HASH = "0".repeat(64);

export type IssuedTrackingLink = { token: string; path: string; created: true } | { created: false; mensaje: string };

/** Compara el hash guardado con el calculado. Siempre lee los dos buffers del mismo largo. */
function sameTokenHash(stored: string | undefined, computed: string): boolean {
  const right = Buffer.from(computed, "utf8");
  const candidate = stored != null && Buffer.byteLength(stored) === right.length ? stored : DUMMY_TOKEN_HASH;
  const left = Buffer.from(candidate, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right) && stored === candidate;
}

/**
 * Un token por envío. No incluye correo, teléfono, nombre ni alertas internas.
 * El secreto se devuelve solo al emitirlo. La base guarda el hash y la auditoría, un prefijo de 6 caracteres.
 */
export function issueTrackingLink(user: PublicUser, shipmentId: string): IssuedTrackingLink {
  const shipment = requireShipment(user, shipmentId);
  const db = getDb();
  const existing = db.prepare(`SELECT 1 AS ok FROM ops_tracking_links WHERE shipment_id = ?`).get(shipment.id);
  if (existing) return { created: false, mensaje: ENLACE_YA_EMITIDO };
  const token = randomBytes(24).toString("base64url");
  const hash = tokenHash(token);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`INSERT INTO ops_tracking_links (token, token_hash, shipment_id, created_at) VALUES (?, ?, ?, ?)`).run(hash, hash, shipment.id, now);
    auditStrict(user, "ops.seguimiento_emitido", { type: "envio", id: shipment.id }, { prefijo: token.slice(0, 6) });
  })();
  return { token, path: `/seguimiento/${token}`, created: true };
}

/** Estado, posición y ETA para el cliente. No lee ni devuelve ops_alerts. */
export function readTracking(token: string): TrackingView {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) throw new AppError("No encontrado.", 404);
  const hash = tokenHash(token);
  const row = getDb()
    .prepare(`SELECT token_hash AS tokenHash, shipment_id AS shipmentId FROM ops_tracking_links WHERE token_hash = ?`)
    .get(hash) as { tokenHash: string; shipmentId: string } | undefined;
  const matches = sameTokenHash(row?.tokenHash, hash);
  if (!row || !matches) throw new AppError("No encontrado.", 404);
  return viewFor(row.shipmentId, token);
}
