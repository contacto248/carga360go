import { randomBytes, randomUUID } from "crypto";
import { equipmentById } from "./catalog";
import { getDb } from "./db";
import { AppError } from "./errors";
import { formatDateCL } from "./format";
import { allListings, equipmentList, loadPassesFilters, truckPassesFilters } from "./listings";
import { appUrl } from "./mail";
import { matchLoadToTruck } from "./match";
import { type Delivery, sendEmail } from "./notify";
import type { LoadFilters, LoadPublic, PublicUser, TruckFilters, TruckPublic } from "./types";

/** Máximo de correos de alerta por usuario en 24 horas. */
export const MAX_ALERTS_PER_DAY = 6;
/** Puntaje mínimo de calce para avisar por correo. */
export const MIN_ALERT_SCORE = 60;
export const MAX_SAVED_SEARCHES = 10;

const FILTER_KEYS = {
  cargas: ["equipo", "regionOrigen", "origen", "regionDestino", "destino", "desde", "pesoMin", "q", "verificados"],
  camiones: ["equipo", "regionOrigen", "origen", "regionDestino", "destino", "dia", "capacidadMin", "verificados"],
} as const;

export type SearchKind = keyof typeof FILTER_KEYS;

export type SavedSearch = { id: string; kind: SearchKind; filters: Record<string, string>; label: string; createdAt: string };

type Recipient = { id: string; email: string; contact_name: string; role: string; verification_status: string; alerts_opt_out: number };

export function cleanFilters(kind: SearchKind, input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of FILTER_KEYS[kind]) {
    const value = input[key];
    if (typeof value === "string" && value.trim() && value.length <= 200) out[key] = value.trim();
  }
  return out;
}

function describe(kind: SearchKind, filters: Record<string, string>): string {
  const parts: string[] = [kind === "cargas" ? "Cargas" : "Camiones"];
  const equipos = equipmentList(filters.equipo);
  if (equipos.length) parts.push(equipos.map((id) => equipmentById(id).label).join(" o "));
  const from = filters.origen || filters.regionOrigen;
  const to = filters.destino || filters.regionDestino;
  if (from || to) parts.push(`${from || "cualquier origen"} → ${to || "cualquier destino"}`);
  if (filters.verificados === "1") parts.push("solo verificados");
  return parts.join(" · ");
}

export function saveSearch(user: PublicUser, kind: string, input: Record<string, unknown>): SavedSearch {
  if (kind !== "cargas" && kind !== "camiones") throw new AppError("Tipo de búsqueda no válido.");
  const filters = cleanFilters(kind, input);
  if (Object.keys(filters).length === 0) throw new AppError("Elige al menos un filtro (región, ciudad o equipo) para crear la alerta.");
  const db = getDb();
  const count = (db.prepare(`SELECT COUNT(*) AS n FROM saved_searches WHERE user_id = ?`).get(user.id) as { n: number }).n;
  if (count >= MAX_SAVED_SEARCHES) throw new AppError(`Puedes tener hasta ${MAX_SAVED_SEARCHES} alertas. Borra una para crear otra.`);
  const json = JSON.stringify(filters);
  const dup = db.prepare(`SELECT id FROM saved_searches WHERE user_id = ? AND kind = ? AND filters_json = ?`).get(user.id, kind, json);
  if (dup) throw new AppError("Ya tienes una alerta con esos filtros.");
  const search: SavedSearch = { id: randomUUID(), kind, filters, label: describe(kind, filters), createdAt: new Date().toISOString() };
  db.prepare(`INSERT INTO saved_searches (id, user_id, kind, filters_json, label, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    search.id,
    user.id,
    kind,
    json,
    search.label,
    search.createdAt,
  );
  db.prepare(`UPDATE users SET alerts_opt_out = 0 WHERE id = ?`).run(user.id);
  return search;
}

export function listSavedSearches(userId: string): SavedSearch[] {
  const rows = getDb()
    .prepare(`SELECT id, kind, filters_json, label, created_at FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as { id: string; kind: SearchKind; filters_json: string; label: string; created_at: string }[];
  return rows.map((row) => ({ id: row.id, kind: row.kind, filters: JSON.parse(row.filters_json), label: row.label, createdAt: row.created_at }));
}

export function deleteSavedSearch(user: PublicUser, id: string) {
  const result = getDb().prepare(`DELETE FROM saved_searches WHERE id = ? AND user_id = ?`).run(id, user.id);
  if (result.changes === 0) throw new AppError("Alerta no encontrada.", 404);
}

export function alertsEnabled(userId: string): boolean {
  const row = getDb().prepare(`SELECT alerts_opt_out FROM users WHERE id = ?`).get(userId) as { alerts_opt_out: number } | undefined;
  return row ? row.alerts_opt_out === 0 : false;
}

export function setAlertsEnabled(userId: string, enabled: boolean) {
  getDb().prepare(`UPDATE users SET alerts_opt_out = ? WHERE id = ?`).run(enabled ? 0 : 1, userId);
}

/** Token estable para el enlace de baja (se crea la primera vez). */
export function unsubscribeToken(userId: string): string {
  const db = getDb();
  const row = db.prepare(`SELECT alert_token FROM users WHERE id = ?`).get(userId) as { alert_token: string | null } | undefined;
  if (row?.alert_token) return row.alert_token;
  const token = randomBytes(24).toString("base64url");
  db.prepare(`UPDATE users SET alert_token = ? WHERE id = ?`).run(token, userId);
  return token;
}

export function unsubscribeByToken(token: string): boolean {
  if (!token || token.length < 20 || token.length > 100) return false;
  const result = getDb().prepare(`UPDATE users SET alerts_opt_out = 1 WHERE alert_token = ?`).run(token);
  return result.changes > 0;
}

function recipient(userId: string): Recipient | undefined {
  return getDb()
    .prepare(`SELECT id, email, contact_name, role, verification_status, alerts_opt_out FROM users WHERE id = ?`)
    .get(userId) as Recipient | undefined;
}

function canReceive(user: Recipient | undefined): user is Recipient {
  if (!user || user.alerts_opt_out === 1) return false;
  // Un transportista sin aprobar no ve el marketplace: no se le envían alertas.
  if (user.role === "transportista" && user.verification_status !== "verificado") return false;
  return true;
}

function sentInLastDay(userId: string): number {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM alert_log WHERE user_id = ? AND sent_at > ?`).get(userId, since) as { n: number }).n;
}

function alreadySent(userId: string, kind: "carga" | "camion", listingId: string): boolean {
  return Boolean(getDb().prepare(`SELECT 1 FROM alert_log WHERE user_id = ? AND listing_kind = ? AND listing_id = ?`).get(userId, kind, listingId));
}

export type AlertOutcome = { userId: string; status: "enviado" | "limite" | "duplicado"; delivery?: Delivery };

async function deliver(
  user: Recipient,
  kind: "carga" | "camion",
  listingId: string,
  reason: string,
  subject: string,
  lines: string[],
): Promise<AlertOutcome> {
  if (alreadySent(user.id, kind, listingId)) return { userId: user.id, status: "duplicado" };
  if (sentInLastDay(user.id) >= MAX_ALERTS_PER_DAY) return { userId: user.id, status: "limite" };
  const db = getDb();
  const id = randomUUID();
  // Se registra antes de enviar para que dos procesos simultáneos no dupliquen el correo.
  try {
    db.prepare(
      `INSERT INTO alert_log (id, user_id, listing_kind, listing_id, reason, delivery, sent_at) VALUES (?, ?, ?, ?, ?, 'pendiente', ?)`,
    ).run(id, user.id, kind, listingId, reason, new Date().toISOString());
  } catch {
    return { userId: user.id, status: "duplicado" };
  }
  const base = appUrl();
  const text = [
    `Hola ${user.contact_name},`,
    "",
    ...lines,
    "",
    `Ver la publicación: ${base}/${kind === "carga" ? "cargas" : "camiones"}/${listingId}`,
    `Administrar mis alertas: ${base}/panel#alertas`,
    "",
    "Recibes este aviso porque tienes una publicación o una alerta guardada en Carga360go.",
    `Para dejar de recibir estos avisos: ${base}/alertas/baja?t=${unsubscribeToken(user.id)}`,
    "",
    "Carga360go",
  ].join("\n");
  const delivery = await sendEmail(user.email, subject, text);
  db.prepare(`UPDATE alert_log SET delivery = ? WHERE id = ?`).run(delivery, id);
  return { userId: user.id, status: "enviado", delivery };
}

function loadSummary(load: LoadPublic) {
  return `${load.origin} → ${load.destination} · ${equipmentById(load.equipment).label} · ${load.weightT} t · retiro ${formatDateCL(load.pickupDate)}`;
}

function truckSummary(truck: TruckPublic) {
  return `${truck.origin} → ${truck.destination} · ${equipmentById(truck.equipment).label} · ${truck.tonnage} t · disponible ${formatDateCL(
    truck.availableFrom,
  )} al ${formatDateCL(truck.availableTo)}`;
}

function savedSearchOwners(kind: SearchKind, passes: (filters: Record<string, string>) => boolean, exclude: string): Map<string, string> {
  const rows = getDb().prepare(`SELECT user_id, filters_json, label FROM saved_searches WHERE kind = ?`).all(kind) as {
    user_id: string;
    filters_json: string;
    label: string;
  }[];
  const out = new Map<string, string>();
  for (const row of rows) {
    if (row.user_id === exclude || out.has(row.user_id)) continue;
    try {
      if (passes(JSON.parse(row.filters_json))) out.set(row.user_id, row.label);
    } catch {
      /* filtro corrupto: se ignora */
    }
  }
  return out;
}

/** Avisa por correo a transportistas con camiones compatibles y a quienes guardaron una búsqueda que calza. */
export async function alertForNewLoad(loadId: string): Promise<AlertOutcome[]> {
  const { loads, trucks } = allListings();
  const load = loads.find((item) => item.id === loadId);
  if (!load || load.isDemo) return [];
  const reasons = new Map<string, { reason: string; line: string }>();
  for (const truck of trucks) {
    if (truck.ownerId === load.ownerId || truck.isDemo) continue;
    if (load.soloVerificados && truck.ownerVerification !== "verificado") continue;
    const match = matchLoadToTruck(load, truck);
    if (!match || match.score < MIN_ALERT_SCORE || reasons.has(truck.ownerId)) continue;
    reasons.set(truck.ownerId, {
      reason: `match ${match.score}%`,
      line: `Tu camión ${truck.origin} → ${truck.destination} calza en un ${match.score}% con esta carga nueva.`,
    });
  }
  for (const [userId, label] of savedSearchOwners("cargas", (filters) => loadPassesFilters(load, filters as LoadFilters), load.ownerId)) {
    if (!reasons.has(userId)) reasons.set(userId, { reason: "alerta guardada", line: `Coincide con tu alerta guardada: ${label}.` });
  }
  const outcomes: AlertOutcome[] = [];
  for (const [userId, info] of reasons) {
    const user = recipient(userId);
    if (!canReceive(user)) continue;
    outcomes.push(
      await deliver(user, "carga", load.id, info.reason, `Nueva carga que calza: ${load.origin} → ${load.destination}`, [
        "Se publicó una carga que puede interesarte:",
        loadSummary(load),
        info.line,
      ]),
    );
  }
  return outcomes;
}

/** Avisa a mandantes con cargas compatibles y a quienes guardaron una búsqueda de camiones que calza. */
export async function alertForNewTruck(truckId: string): Promise<AlertOutcome[]> {
  const { loads, trucks } = allListings();
  const truck = trucks.find((item) => item.id === truckId);
  if (!truck || truck.isDemo) return [];
  const reasons = new Map<string, { reason: string; line: string }>();
  for (const load of loads) {
    if (load.ownerId === truck.ownerId || load.isDemo) continue;
    if (load.soloVerificados && truck.ownerVerification !== "verificado") continue;
    const match = matchLoadToTruck(load, truck);
    if (!match || match.score < MIN_ALERT_SCORE || reasons.has(load.ownerId)) continue;
    reasons.set(load.ownerId, {
      reason: `match ${match.score}%`,
      line: `Calza en un ${match.score}% con tu carga ${load.origin} → ${load.destination}.`,
    });
  }
  for (const [userId, label] of savedSearchOwners("camiones", (filters) => truckPassesFilters(truck, filters as TruckFilters), truck.ownerId)) {
    if (!reasons.has(userId)) reasons.set(userId, { reason: "alerta guardada", line: `Coincide con tu alerta guardada: ${label}.` });
  }
  const outcomes: AlertOutcome[] = [];
  for (const [userId, info] of reasons) {
    const user = recipient(userId);
    if (!canReceive(user)) continue;
    outcomes.push(
      await deliver(user, "camion", truck.id, info.reason, `Camión disponible que calza: ${truck.origin} → ${truck.destination}`, [
        "Se publicó un camión disponible que puede servirte:",
        truckSummary(truck),
        info.line,
      ]),
    );
  }
  return outcomes;
}

/** Ejecuta la alerta sin bloquear la respuesta HTTP. */
export function queueAlert(kind: "carga" | "camion", id: string) {
  const task = kind === "carga" ? alertForNewLoad(id) : alertForNewTruck(id);
  task.catch((error) => console.error(`[carga360go] Error enviando alertas de ${kind} ${id}`, error));
}
