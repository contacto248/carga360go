import { randomUUID } from "crypto";
import { stripContacts } from "./contact-filter";
import { getDb } from "./db";
import { AppError } from "./errors";
import type { PublicUser } from "./types";

export const TRIP_STATUSES = ["asignado", "en_camino", "retirado", "en_transito", "incidencia", "entregado"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

const NEXT: Record<TripStatus, TripStatus[]> = {
  asignado: ["en_camino", "incidencia"],
  en_camino: ["retirado", "incidencia"],
  retirado: ["en_transito", "incidencia"],
  en_transito: ["entregado", "incidencia"],
  incidencia: ["en_camino", "retirado", "en_transito", "entregado"],
  entregado: [],
};

export const TRIP_LABEL: Record<TripStatus, string> = {
  asignado: "Asignado",
  en_camino: "En camino al retiro",
  retirado: "Carga retirada",
  en_transito: "En tránsito",
  incidencia: "Incidencia",
  entregado: "Entrega declarada",
};

function authorLabel(role: string | null): string {
  if (role === "mandante") return "Mandante";
  if (role === "transportista") return "Transportista";
  if (role === "admin") return "Administrador";
  return "Autor no disponible";
}

export function isTripStatus(value: string | null | undefined): value is TripStatus {
  return !!value && (TRIP_STATUSES as readonly string[]).includes(value);
}

type Party = { ownerId: string; carrierId: string | null; status: string | null; tripStatus: string | null };

function partyOf(loadId: string): Party | null {
  const row = getDb()
    .prepare(
      `SELECT l.owner_id AS ownerId, o.carrier_id AS carrierId, l.status AS status, l.trip_status AS tripStatus
       FROM loads l LEFT JOIN offers o ON o.id = l.awarded_offer_id WHERE l.id = ?`,
    )
    .get(loadId) as Party | undefined;
  return row ?? null;
}

export function isTripParty(loadId: string, user: PublicUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const row = partyOf(loadId);
  return !!row && (user.id === row.ownerId || user.id === row.carrierId);
}

export function tripView(loadId: string, user: PublicUser | null) {
  const row = partyOf(loadId);
  if (!row || row.status !== "adjudicada") return null;
  // Contactos, eventos y estado del viaje solo para dueño, transportista adjudicado o administrador.
  if (!isTripParty(loadId, user)) return null;
  const events = getDb()
    .prepare(
      `SELECT e.id, e.status, e.note, e.created_at AS createdAt, u.role AS actorRole
       FROM trip_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.load_id = ? ORDER BY e.created_at ASC`,
    )
    .all(loadId) as { id: string; status: string; note: string | null; createdAt: string; actorRole: string | null }[];
  const ratings = getDb().prepare(`SELECT stars FROM ratings WHERE load_id = ?`).all(loadId) as { stars: number }[];
  const mine = user
    ? (getDb().prepare(`SELECT stars, comment FROM ratings WHERE load_id = ? AND from_user_id = ?`).get(loadId, user.id) as
        | { stars: number; comment: string | null }
        | undefined)
    : undefined;
  const current = isTripStatus(row.tripStatus) ? row.tripStatus : "asignado";
  const average = ratings.length ? Math.round((ratings.reduce((sum, item) => sum + item.stars, 0) / ratings.length) * 10) / 10 : null;
  return {
    status: current,
    label: TRIP_LABEL[current],
    next: NEXT[current].map((status) => ({ status, label: TRIP_LABEL[status] })),
    canUpdate: current !== "entregado",
    canRate: user?.role !== "admin" && current === "entregado" && !mine,
    myRating: mine ?? null,
    average,
    ratingCount: ratings.length,
    events: events.flatMap((event) =>
      isTripStatus(event.status)
        ? [{ id: event.id, status: event.status, label: TRIP_LABEL[event.status], note: event.note, createdAt: event.createdAt, authorLabel: authorLabel(event.actorRole) }]
        : [],
    ),
  };
}

export function advanceTrip(user: PublicUser, loadId: string, status: string, note?: string | null) {
  if (!isTripStatus(status) || status === "asignado") throw new AppError("Ese estado de viaje no es válido.", 400);
  const row = partyOf(loadId);
  if (!row || row.status !== "adjudicada") throw new AppError("El seguimiento empieza cuando la carga está adjudicada.", 409);
  if (!isTripParty(loadId, user)) throw new AppError("Solo las dos partes pueden registrar el viaje.", 403);
  const current = isTripStatus(row.tripStatus) ? row.tripStatus : "asignado";
  if (!NEXT[current].includes(status)) throw new AppError("Ese paso no corresponde al estado actual del viaje.", 409);
  const clean = note?.trim() ? stripContacts(note.trim()).slice(0, 500) : null;
  const stamp = new Date().toISOString();
  const db = getDb();
  db.transaction(() => {
    db.prepare(`UPDATE loads SET trip_status = ?, updated_at = ? WHERE id = ?`).run(status, stamp, loadId);
    db.prepare(`INSERT INTO trip_events (id, load_id, actor_id, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      randomUUID(),
      loadId,
      user.id,
      status,
      clean,
      stamp,
    );
  })();
  return tripView(loadId, user);
}

export function rateLoad(user: PublicUser, loadId: string, stars: number, comment?: string | null) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new AppError("La calificación es de 1 a 5.", 400);
  const row = partyOf(loadId);
  if (!row || row.tripStatus !== "entregado") throw new AppError("La calificación se abre cuando el viaje está entregado.", 409);
  if (user.role === "admin" || (user.id !== row.ownerId && user.id !== row.carrierId)) {
    throw new AppError("Solo el mandante y el transportista del viaje pueden calificar.", 403);
  }
  const toUser = user.id === row.ownerId ? row.carrierId : row.ownerId;
  if (!toUser) throw new AppError("No hay contraparte para calificar.", 409);
  const clean = comment?.trim() ? stripContacts(comment.trim()).slice(0, 500) : null;
  const stamp = new Date().toISOString();
  const changed = getDb()
    .prepare(
      `INSERT INTO ratings (id, load_id, from_user_id, to_user_id, stars, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(load_id, from_user_id) DO NOTHING`,
    )
    .run(randomUUID(), loadId, user.id, toUser, stars, clean, stamp);
  if (changed.changes !== 1) throw new AppError("Ya calificaste este viaje.", 409);
  return tripView(loadId, user);
}
