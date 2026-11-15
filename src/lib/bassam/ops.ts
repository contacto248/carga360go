import { randomBytes, randomUUID } from "crypto";
import QRCode from "qrcode";
import { auditStrict } from "../audit";
import { stripContacts } from "../contact-filter";
import { getDb } from "../db";
import { AppError } from "../errors";
import { appUrl } from "../mail";
import type { PublicUser } from "../types";
import { TRIP_LABEL, isTripStatus } from "../viaje";
import { latestQualityMap, qualityHistory, runQualityAgent } from "./quality";
import { AUTH_ACTIONS, GPS_CLASIFICACION, type AuthAction, type BassamSnapshot, type GpsPointView, type PublicCheckpoint, type QrSide, type TorreViaje } from "./types";

export { GPS_CLASIFICACION };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trip_gps_points (
  id TEXT PRIMARY KEY,
  load_id TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trip_gps_load ON trip_gps_points(load_id, recorded_at);
CREATE TABLE IF NOT EXISTS trip_qr_tokens (
  token TEXT PRIMARY KEY,
  load_id TEXT NOT NULL,
  point TEXT NOT NULL CHECK (point IN ('origen', 'destino')),
  created_at TEXT NOT NULL,
  UNIQUE (load_id, point)
);
CREATE TABLE IF NOT EXISTS trip_authorizations (
  load_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('autorizada', 'rechazada', 'en_revision')),
  note TEXT,
  updated_at TEXT NOT NULL
);
`;

type LoadRow = {
  id: string;
  ownerId: string;
  carrierId: string | null;
  status: string;
  tripStatus: string | null;
  origin: string;
  destination: string;
  isDemo: number;
};

type AuthStatus = "autorizada" | "rechazada" | "en_revision";

export function ensureBassamOps() {
  getDb().exec(SCHEMA);
}

export function countText(n: number): string {
  if (!Number.isInteger(n) || n <= 0) return "sin datos";
  return String(n);
}

function assertAdmin(user: PublicUser | null | undefined): asserts user is PublicUser {
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  if (user.role !== "admin") throw new AppError("Acceso exclusivo de administración.", 403);
}

function loadOf(loadId: string): LoadRow | null {
  const row = getDb()
    .prepare(
      `SELECT l.id, l.owner_id AS ownerId, o.carrier_id AS carrierId, l.status AS status,
              l.trip_status AS tripStatus, l.origin AS origin, l.destination AS destination, l.is_demo AS isDemo
       FROM loads l LEFT JOIN offers o ON o.id = l.awarded_offer_id WHERE l.id = ?`,
    )
    .get(loadId) as LoadRow | undefined;
  return row ?? null;
}

function assertAwardedParty(user: PublicUser, load: LoadRow | null): asserts load is LoadRow {
  if (!load || load.status !== "adjudicada" || load.isDemo) {
    throw new AppError("El seguimiento empieza cuando la carga está adjudicada.", 409);
  }
  if (user.role !== "admin" && user.id !== load.ownerId && user.id !== load.carrierId) {
    throw new AppError("Solo las partes del viaje pueden hacer esto.", 403);
  }
}

function authorLabel(role: string | null): string {
  if (role === "mandante") return "Mandante";
  if (role === "transportista") return "Transportista";
  if (role === "admin") return "Administrador";
  return "Autor no disponible";
}

function tripLabel(status: string | null): string {
  return isTripStatus(status) ? TRIP_LABEL[status] : TRIP_LABEL.asignado;
}

function statusFor(action: AuthAction): AuthStatus {
  switch (action) {
    case "autorizar":
      return "autorizada";
    case "rechazar":
      return "rechazada";
    case "solicitar_revision":
      return "en_revision";
    default: {
      const unexpected: never = action;
      throw new AppError(`Acción no válida: ${String(unexpected)}.`);
    }
  }
}

function auditAction(action: AuthAction): string {
  switch (action) {
    case "autorizar":
      return "bassam.autorizar";
    case "rechazar":
      return "bassam.rechazar";
    case "solicitar_revision":
      return "bassam.solicitar_revision";
    default: {
      const unexpected: never = action;
      throw new AppError(`Acción no válida: ${String(unexpected)}.`);
    }
  }
}

export function parseAuthAction(value: unknown): AuthAction {
  if (typeof value === "string" && (AUTH_ACTIONS as readonly string[]).includes(value)) return value as AuthAction;
  throw new AppError("Acción no válida. Use autorizar, rechazar o solicitar revisión.");
}

export function decideAuthorization(user: PublicUser, loadId: string, action: AuthAction, note?: string | null) {
  assertAdmin(user);
  ensureBassamOps();
  const load = loadOf(loadId);
  if (!load || load.status !== "adjudicada" || load.isDemo) {
    throw new AppError("Solo se autoriza un viaje adjudicado.", 409);
  }
  const status = statusFor(action);
  const clean = note?.trim() ? stripContacts(note.trim()).slice(0, 500) : null;
  const stamp = new Date().toISOString();
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO trip_authorizations (load_id, status, note, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(load_id) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at`,
    ).run(loadId, status, clean, stamp);
    auditStrict(user, auditAction(action), { type: "viaje", id: loadId }, { status, note: clean });
  })();
  return { loadId, status, updatedAt: stamp };
}

function authorizationOf(loadId: string): AuthStatus | null {
  ensureBassamOps();
  const row = getDb().prepare(`SELECT status FROM trip_authorizations WHERE load_id = ?`).get(loadId) as { status: AuthStatus } | undefined;
  return row?.status ?? null;
}

function coordinate(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new AppError(`${name} no es una coordenada.`);
  return Math.round(value * 1e6) / 1e6;
}

/** Guarda lat, lng y la hora del servidor. Solo el viaje autorizado y sus partes. */
export function recordGps(user: PublicUser, loadId: string, latValue: unknown, lngValue: unknown): GpsPointView & { clasificacion: typeof GPS_CLASIFICACION } {
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  ensureBassamOps();
  const load = loadOf(loadId);
  assertAwardedParty(user, load);
  if (authorizationOf(loadId) !== "autorizada") {
    throw new AppError("El GPS solo se guarda en un viaje autorizado.", 403);
  }
  const lat = coordinate(latValue, "Latitud");
  const lng = coordinate(lngValue, "Longitud");
  if (lat < -56 || lat > -17 || lng < -109.5 || lng > -66) {
    throw new AppError("La coordenada queda fuera del área de operación.");
  }
  const recordedAt = new Date().toISOString();
  const db = getDb();
  db.transaction(() => {
    db.prepare(`INSERT INTO trip_gps_points (id, load_id, lat, lng, recorded_at) VALUES (?, ?, ?, ?, ?)`).run(randomUUID(), loadId, lat, lng, recordedAt);
    auditStrict(user, "bassam.gps", { type: "viaje", id: loadId }, { lat, lng, recordedAt });
  })();
  return { lat, lng, recordedAt, clasificacion: GPS_CLASIFICACION };
}

export function listGps(user: PublicUser, loadId: string): { points: GpsPointView[]; clasificacion: typeof GPS_CLASIFICACION; texto?: "sin datos" } {
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  const load = loadOf(loadId);
  assertAwardedParty(user, load);
  ensureBassamOps();
  const points = getDb()
    .prepare(`SELECT lat, lng, recorded_at AS recordedAt FROM trip_gps_points WHERE load_id = ? ORDER BY recorded_at ASC`)
    .all(loadId) as GpsPointView[];
  if (!points.length) return { points: [], clasificacion: GPS_CLASIFICACION, texto: "sin datos" };
  return { points, clasificacion: GPS_CLASIFICACION };
}

function token(): string {
  return randomBytes(16).toString("base64url");
}

async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 180 });
}

export async function tripQr(user: PublicUser, loadId: string): Promise<{ origen: QrSide; destino: QrSide }> {
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  ensureBassamOps();
  const load = loadOf(loadId);
  assertAwardedParty(user, load);
  const db = getDb();
  const existing = db.prepare(`SELECT token, point FROM trip_qr_tokens WHERE load_id = ?`).all(loadId) as { token: string; point: "origen" | "destino" }[];
  const byPoint = new Map(existing.map((row) => [row.point, row.token]));
  const stamp = new Date().toISOString();
  let created = false;
  for (const point of ["origen", "destino"] as const) {
    if (byPoint.has(point)) continue;
    const value = token();
    db.prepare(`INSERT INTO trip_qr_tokens (token, load_id, point, created_at) VALUES (?, ?, ?, ?)`).run(value, loadId, point, stamp);
    byPoint.set(point, value);
    created = true;
  }
  if (created) auditStrict(user, "bassam.qr", { type: "viaje", id: loadId }, { points: ["origen", "destino"] });
  const side = async (point: "origen" | "destino"): Promise<QrSide> => {
    const url = `${appUrl()}/v/${byPoint.get(point)}`;
    return { point, url, svg: await qrSvg(url) };
  };
  return { origen: await side("origen"), destino: await side("destino") };
}

export function publicCheckpoint(tokenValue: string): PublicCheckpoint | null {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(tokenValue)) return null;
  ensureBassamOps();
  const row = getDb()
    .prepare(
      `SELECT q.point AS point, l.origin AS origin, l.destination AS destination, l.trip_status AS tripStatus
       FROM trip_qr_tokens q JOIN loads l ON l.id = q.load_id WHERE q.token = ?`,
    )
    .get(tokenValue) as { point: "origen" | "destino"; origin: string; destination: string; tripStatus: string | null } | undefined;
  if (!row) return null;
  return {
    point: row.point,
    pointLabel: row.point === "origen" ? "Origen" : "Destino",
    origin: row.origin,
    destination: row.destination,
    tripLabel: tripLabel(row.tripStatus),
  };
}

function viajeRows(): TorreViaje[] {
  ensureBassamOps();
  const qualityByLoad = latestQualityMap();
  const loads = getDb()
    .prepare(
      `SELECT l.id, l.origin AS origin, l.destination AS destination, l.trip_status AS tripStatus
       FROM loads l WHERE l.status = 'adjudicada' AND l.is_demo = 0
       ORDER BY l.updated_at DESC LIMIT 40`,
    )
    .all() as { id: string; origin: string; destination: string; tripStatus: string | null }[];
  return loads.map((load) => {
    const events = getDb()
      .prepare(
        `SELECT e.status AS status, e.created_at AS createdAt, u.role AS actorRole
         FROM trip_events e LEFT JOIN users u ON u.id = e.actor_id
         WHERE e.load_id = ? ORDER BY e.created_at ASC`,
      )
      .all(load.id) as { status: string; createdAt: string; actorRole: string | null }[];
    const gps = getDb()
      .prepare(`SELECT lat, lng, recorded_at AS recordedAt FROM trip_gps_points WHERE load_id = ? ORDER BY recorded_at ASC`)
      .all(load.id) as GpsPointView[];
    const auth = authorizationOf(load.id);
    const quality = qualityByLoad.get(load.id);
    return {
      id: load.id,
      origin: load.origin,
      destination: load.destination,
      tripLabel: tripLabel(load.tripStatus),
      autorizacion: auth ?? "pendiente",
      severidad: quality?.severity ?? "sin datos",
      regla: quality?.ruleId ?? "sin datos",
      necesitaGerente: quality?.needsManager ?? false,
      historial: events.map((event) => ({
        status: event.status,
        label: isTripStatus(event.status) ? TRIP_LABEL[event.status] : event.status,
        at: event.createdAt,
        authorLabel: authorLabel(event.actorRole),
      })),
      gps,
    };
  });
}

export function bassamSnapshot(user: PublicUser): BassamSnapshot {
  assertAdmin(user);
  ensureBassamOps();
  runQualityAgent(user);
  const db = getDb();
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const torre = viajeRows();
  const calidad = qualityHistory();
  return {
    marca: "CARGA360GO",
    titulo: "BASSAM 360",
    generado: new Date().toISOString(),
    conteos: {
      viajes: countText(count(`SELECT COUNT(*) n FROM loads WHERE status = 'adjudicada' AND is_demo = 0`)),
      eventos: countText(count(`SELECT COUNT(*) n FROM trip_events e JOIN loads l ON l.id = e.load_id WHERE l.status = 'adjudicada' AND l.is_demo = 0`)),
      gps: countText(count(`SELECT COUNT(*) n FROM trip_gps_points g JOIN loads l ON l.id = g.load_id WHERE l.is_demo = 0`)),
      autorizaciones: countText(count(`SELECT COUNT(*) n FROM trip_authorizations a JOIN loads l ON l.id = a.load_id WHERE l.is_demo = 0`)),
      revisiones: countText(calidad.length),
    },
    torre,
    informe: torre.length ? { texto: "datos reales", viajes: torre } : { texto: "sin datos" },
    calidad: calidad.length ? calidad : "sin datos",
    gpsClasificacion: GPS_CLASIFICACION,
  };
}
