import { randomUUID } from "crypto";
import { auditStrict } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import type { QuoteInput, QuoteResult } from "./engine";

/**
 * Flujo de revisión: toda cotización se guarda como "borrador". Un administrador la marca "revisada", luego
 * "enviada" (cuando se comunica al cliente por fuera de la plataforma) o "descartada". Nada se envía solo.
 */
export type QuoteStatus = "borrador" | "revisada" | "enviada" | "descartada";
export const QUOTE_STATUSES: QuoteStatus[] = ["borrador", "revisada", "enviada", "descartada"];
export type QuoteChannel = "web_cotizador" | "web_publicacion" | "api_agente_voz" | "api_match" | "api" | "admin";

const NEXT: Record<QuoteStatus, QuoteStatus[]> = {
  borrador: ["revisada", "descartada"],
  revisada: ["enviada", "descartada", "borrador"],
  enviada: ["descartada"],
  descartada: ["borrador"],
};

export type QuoteRow = {
  id: string;
  status: QuoteStatus;
  channel: QuoteChannel;
  origin_label: string;
  destination_label: string;
  vehicle: string;
  distance_km: number | null;
  base_cost: number;
  reference_price: number;
  complete: number;
  method: string;
  input: string;
  result: string;
  contact: string | null;
  created_by: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  updated_at: string;
};

export function saveQuote(input: QuoteInput, result: QuoteResult, channel: QuoteChannel, createdBy: string | null, contact: string | null = null): string {
  const id = randomUUID();
  const stamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO cost_quotes (id, status, channel, origin_label, destination_label, vehicle, distance_km, base_cost, reference_price, complete, method, input, result, contact, created_by, created_at, updated_at)
       VALUES (?, 'borrador', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      channel,
      result.origin.label.slice(0, 200),
      result.destination.label.slice(0, 200),
      result.vehicle.id,
      result.route?.km ?? null,
      result.totals.costoBase,
      result.totals.precioTotal,
      result.totals.complete ? 1 : 0,
      result.method,
      JSON.stringify(input),
      JSON.stringify(result),
      contact ? contact.slice(0, 200) : null,
      createdBy,
      stamp,
      stamp,
    );
  return id;
}

export function getQuote(id: string): (QuoteRow & { parsed: QuoteResult }) | null {
  const row = getDb().prepare(`SELECT * FROM cost_quotes WHERE id = ?`).get(id) as QuoteRow | undefined;
  return row ? { ...row, parsed: JSON.parse(row.result) as QuoteResult } : null;
}

export function listQuotes(status?: QuoteStatus, limit = 200): QuoteRow[] {
  const db = getDb();
  const sql = `SELECT id, status, channel, origin_label, destination_label, vehicle, distance_km, base_cost, reference_price, complete, method, '' AS input, '' AS result, contact, created_by, created_at, reviewed_by, reviewed_by_email, reviewed_at, review_note, updated_at FROM cost_quotes`;
  return (status
    ? db.prepare(`${sql} WHERE status = ? ORDER BY created_at DESC LIMIT ?`).all(status, limit)
    : db.prepare(`${sql} ORDER BY created_at DESC LIMIT ?`).all(limit)) as QuoteRow[];
}

export function setQuoteStatus(actor: Pick<PublicUser, "id" | "email">, id: string, status: unknown, note: unknown, ip?: string | null): QuoteRow {
  if (typeof status !== "string" || !QUOTE_STATUSES.includes(status as QuoteStatus)) throw new AppError("Estado no válido.");
  const db = getDb();
  const current = db.prepare(`SELECT * FROM cost_quotes WHERE id = ?`).get(id) as QuoteRow | undefined;
  if (!current) throw new AppError("Cotización no encontrada.", 404);
  const next = status as QuoteStatus;
  if (!NEXT[current.status].includes(next)) throw new AppError(`No se puede pasar de "${current.status}" a "${next}".`);
  const cleanNote = typeof note === "string" ? note.trim().slice(0, 500) : "";
  if (next === "enviada" && !current.complete) throw new AppError("La cotización tiene costos pendientes: complétala antes de marcarla como enviada.");
  const stamp = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`UPDATE cost_quotes SET status = ?, reviewed_by = ?, reviewed_by_email = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ?`).run(
      next,
      actor.id,
      actor.email,
      stamp,
      cleanNote || current.review_note,
      stamp,
      id,
    );
    auditStrict(actor, "costos.cotizacion_estado", { type: "cotizacion", id }, { anterior: current.status, nuevo: next, nota: cleanNote || null }, ip ?? null);
  })();
  return db.prepare(`SELECT * FROM cost_quotes WHERE id = ?`).get(id) as QuoteRow;
}
