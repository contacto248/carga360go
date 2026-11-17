import { randomUUID } from "crypto";
import { listGps, saveTripGpsPoint } from "../../bassam/ops";
import { getDb } from "../../db";
import { AppError } from "../../errors";
import { cityCoords } from "../../geo";
import type { PublicUser } from "../../types";
import { assertEnabled } from "../flags";
import { driverGps, simulatedGps, type GpsProvider } from "./connector";

export type OpsGpsPoint = {
  lat: number;
  lng: number;
  recordedAt: string;
  provider: GpsProvider | null;
};

const LABELS: Record<GpsProvider, string> = {
  simulado: "Recorrido simulado",
  conductor: "Teléfono del conductor",
};

function stepsOf(value: unknown): number {
  if (value == null) return 4;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 2 || value > 8) {
    throw new AppError("El recorrido simulado usa entre 2 y 8 puntos.");
  }
  return value;
}

function sourceId(provider: GpsProvider): string {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM ops_telematics_sources WHERE provider = ?`).get(provider) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO ops_telematics_sources (id, provider, label, credential_ref, created_at) VALUES (?, ?, ?, NULL, ?)`,
  ).run(id, provider, LABELS[provider], new Date().toISOString());
  return id;
}

function linkPoint(provider: GpsProvider, loadId: string, gpsPointId: string) {
  getDb()
    .prepare(`INSERT INTO ops_gps_receipts (id, source_id, load_id, gps_point_id, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(randomUUID(), sourceId(provider), loadId, gpsPointId, new Date().toISOString());
}

function routeOf(loadId: string): { origin: string; destination: string } {
  const row = getDb().prepare(`SELECT origin, destination, status FROM loads WHERE id = ?`).get(loadId) as
    | { origin: string; destination: string; status: string }
    | undefined;
  if (!row || row.status !== "adjudicada") {
    throw new AppError("El seguimiento empieza cuando la carga está adjudicada.", 409);
  }
  return row;
}

/** Recorrido simulado entre las ciudades de la carga. Solo administración. Sin red ni claves. */
export function ingestSimulatedTrack(user: PublicUser, loadId: string, stepsValue: unknown): { provider: "simulado"; points: OpsGpsPoint[] } {
  assertEnabled("OPS_FEATURE_ENABLED");
  if (user.role !== "admin") throw new AppError("Solo administración puede cargar un recorrido simulado.", 403);
  const steps = stepsOf(stepsValue);
  const route = routeOf(loadId);
  const origin = cityCoords(route.origin);
  const destination = cityCoords(route.destination);
  if (!origin || !destination) throw new AppError("No hay coordenadas de catálogo para simular ese origen o destino.");
  const fixes = simulatedGps.collect({
    origin: { lat: origin[0], lng: origin[1] },
    destination: { lat: destination[0], lng: destination[1] },
    steps,
    endedAt: new Date(),
  });
  const points: OpsGpsPoint[] = [];
  for (const fix of fixes) {
    const point = saveTripGpsPoint(user, loadId, fix.lat, fix.lng, fix.recordedAt);
    linkPoint("simulado", loadId, point.id);
    points.push({ lat: point.lat, lng: point.lng, recordedAt: point.recordedAt, provider: "simulado" });
  }
  return { provider: "simulado", points };
}

/** Un punto del conductor (app o web). Ignora cualquier hora enviada por el cliente. */
export function ingestDriverFix(user: PublicUser, loadId: string, lat: unknown, lng: unknown): { provider: "conductor"; point: OpsGpsPoint } {
  assertEnabled("OPS_FEATURE_ENABLED");
  const [fix] = driverGps.collect({
    lat: typeof lat === "number" ? lat : Number.NaN,
    lng: typeof lng === "number" ? lng : Number.NaN,
    recordedAt: new Date().toISOString(),
  });
  const saved = saveTripGpsPoint(user, loadId, fix.lat, fix.lng);
  linkPoint("conductor", loadId, saved.id);
  return { provider: "conductor", point: { lat: saved.lat, lng: saved.lng, recordedAt: saved.recordedAt, provider: "conductor" } };
}

export function listOpsGps(user: PublicUser, loadId: string): { points: OpsGpsPoint[] } {
  assertEnabled("OPS_FEATURE_ENABLED");
  listGps(user, loadId);
  const rows = getDb()
    .prepare(
      `SELECT p.lat AS lat, p.lng AS lng, p.recorded_at AS recordedAt, s.provider AS provider
       FROM trip_gps_points p
       LEFT JOIN ops_gps_receipts r ON r.gps_point_id = p.id
       LEFT JOIN ops_telematics_sources s ON s.id = r.source_id
       WHERE p.load_id = ?
       ORDER BY p.recorded_at ASC`,
    )
    .all(loadId) as OpsGpsPoint[];
  return { points: rows };
}
