import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { audit } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import { formatDateCL } from "../format";
import { appUrl } from "../mail";
import { codigoOperacion, periodoOperacion } from "../ops/operacion";
import { sendEmail } from "../notify";
import type { PublicUser } from "../types";
import { prepararCadena, escribirEvento } from "./chain";
import { assertQrFase1, qrFase1Enabled } from "./flag";
import { hashOtp, newOtpCode } from "./token";

const CONFIRM_MS = 2 * 60 * 60 * 1000;
const MAX_CORRELATIVO = 9999;

export type DealStatus = "pendiente_confirmacion" | "cerrado" | "anulado" | "expirado";

type DealRow = {
  id: string;
  load_id: string;
  offer_id: string;
  public_ref: string;
  folio: string | null;
  terms_json: string | null;
  terms_hash: string | null;
  status: DealStatus;
  accepted_by: string;
  accepted_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  confirm_deadline: string;
  confirm_code_hash: string | null;
  confirm_attempts: number;
  confirm_code_expires: string | null;
  created_at: string;
};

export function nombreCorto(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Chofer";
  if (parts.length === 1) return parts[0].slice(0, 24);
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function tratoDeCarga(loadId: string): DealRow | null {
  if (!qrFase1Enabled()) return null;
  const row = getDb().prepare(`SELECT * FROM trip_deals WHERE load_id = ?`).get(loadId) as DealRow | undefined;
  return row ?? null;
}

export function tratoExigeQr(loadId: string): boolean {
  return tratoDeCarga(loadId)?.status === "cerrado";
}

export function retiroValidado(loadId: string): boolean {
  if (!qrFase1Enabled()) return false;
  const row = getDb()
    .prepare(`SELECT 1 FROM trip_handoffs WHERE load_id = ? AND kind = 'retiro' AND status = 'confirmado'`)
    .get(loadId);
  return Boolean(row);
}

function loadOffer(loadId: string) {
  return getDb()
    .prepare(
      `SELECT l.id, l.owner_id, l.origin, l.destination, l.equipment, l.weight_t, l.pickup_date, l.status,
              o.id AS offer_id, o.carrier_id, o.price_clp, o.pickup_date AS offer_pickup, o.status AS offer_status
       FROM loads l JOIN offers o ON o.id = l.awarded_offer_id WHERE l.id = ?`,
    )
    .get(loadId) as
    | {
        id: string;
        owner_id: string;
        origin: string;
        destination: string;
        equipment: string;
        weight_t: number;
        pickup_date: string;
        status: string;
        offer_id: string;
        carrier_id: string;
        price_clp: number;
        offer_pickup: string;
        offer_status: string;
      }
    | undefined;
}

/** Foto de los términos en el momento en que el mandante acepta. No se vuelve a leer la carga al confirmar. */
export function termsSnapshot(loadId: string): string {
  const row = loadOffer(loadId);
  if (!row) throw new AppError("No hay una oferta aceptada para congelar el trato.", 409);
  return JSON.stringify({
    carga: row.id,
    oferta: row.offer_id,
    origen: row.origin,
    destino: row.destination,
    retiro: row.offer_pickup,
    equipo: row.equipment,
    pesoT: row.weight_t,
    precioClp: row.price_clp,
  });
}

/** Se llama dentro de la transacción de acceptOffer. No exige la clave del QR. */
export function insertPendingDeal(loadId: string, offerId: string, acceptedBy: string, stamp: string): { code: string } | null {
  if (!qrFase1Enabled()) return null;
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM trip_deals WHERE load_id = ?`).get(loadId);
  if (existing) return null;
  const terms = termsSnapshot(loadId);
  const code = newOtpCode();
  const id = randomUUID();
  const deadline = new Date(Date.parse(stamp) + CONFIRM_MS).toISOString();
  db.prepare(
    `INSERT INTO trip_deals (
      id, load_id, offer_id, public_ref, terms_json, status, accepted_by, accepted_at, confirm_deadline,
      confirm_code_hash, confirm_attempts, confirm_code_expires, created_at
    ) VALUES (?, ?, ?, ?, ?, 'pendiente_confirmacion', ?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, loadId, offerId, randomBytes(6).toString("base64url"), terms, acceptedBy, stamp, deadline, hashOtp(id, code), deadline, stamp);
  return { code };
}

export function dealMailLines(loadId: string, code: string | null): { carrier: string; owner: string } {
  const deal = tratoDeCarga(loadId);
  const hour = deal
    ? new Date(deal.confirm_deadline).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })
    : "";
  const url = `${appUrl()}/viajes/${loadId}/escanear`;
  return {
    carrier: code
      ? `Confirma el trato antes de las ${hour} (hora de Chile) en ${url} con este código de un solo uso: ${code}. Sin tu confirmación no hay comprobante ni QR de retiro.`
      : `Confirma el trato antes de las ${hour} (hora de Chile) en ${url}.`,
    owner: `Cuando el transportista confirme, el comprobante del trato quedará en tu panel: ${appUrl()}/viajes/${loadId}/comprobante`,
  };
}

function carrierEmail(carrierId: string): { email: string; contact: string } | null {
  const row = getDb().prepare(`SELECT email, contact_name FROM users WHERE id = ?`).get(carrierId) as
    | { email: string; contact_name: string }
    | undefined;
  return row ? { email: row.email, contact: row.contact_name } : null;
}

export function emitirCodigoTrato(user: PublicUser, loadId: string, now = new Date()): string {
  assertQrFase1();
  const deal = tratoDeCarga(loadId);
  if (!deal) throw new AppError("Esta carga no tiene un trato pendiente.", 404);
  const row = loadOffer(loadId);
  if (!row || row.carrier_id !== user.id) throw new AppError("Solo el transportista del trato puede pedir el código.", 403);
  if (deal.status === "cerrado") throw new AppError("Este trato ya está cerrado.", 409);
  if (deal.status !== "pendiente_confirmacion") throw new AppError("Este trato ya no se puede confirmar.", 409);
  if (now.getTime() > Date.parse(deal.confirm_deadline)) {
    getDb().prepare(`UPDATE trip_deals SET status = 'expirado' WHERE id = ? AND status = 'pendiente_confirmacion'`).run(deal.id);
    throw new AppError("Pasó el plazo para confirmar el trato.", 409, "expirado");
  }
  const code = newOtpCode();
  getDb()
    .prepare(`UPDATE trip_deals SET confirm_code_hash = ?, confirm_attempts = 0, confirm_code_expires = ? WHERE id = ?`)
    .run(hashOtp(deal.id, code), deal.confirm_deadline, deal.id);
  return code;
}

export async function reemitirCodigo(user: PublicUser, loadId: string): Promise<void> {
  const code = emitirCodigoTrato(user, loadId);
  const row = loadOffer(loadId);
  const person = carrierEmail(user.id);
  if (person && row) {
    await sendEmail(
      person.email,
      `Confirma el trato ${row.origin} → ${row.destination}`,
      [`Hola ${person.contact},`, "", dealMailLines(loadId, code).carrier, "", row ? `${row.origin} → ${row.destination}` : "", "Carga360go"].join("\n"),
    );
  }
}

export function confirmarTrato(user: PublicUser, loadId: string, code: string, now = new Date()) {
  assertQrFase1();
  const deal = tratoDeCarga(loadId);
  if (!deal) throw new AppError("Esta carga no tiene un trato por confirmar.", 404);
  const row = loadOffer(loadId);
  if (!row || (row.carrier_id !== user.id && user.role !== "admin")) {
    throw new AppError("Solo el transportista del trato puede confirmarlo.", 403);
  }
  if (user.role === "admin" && row.carrier_id !== user.id) {
    throw new AppError("La confirmación la hace el transportista con su código.", 403);
  }
  if (deal.status === "cerrado") throw new AppError("Este trato ya está cerrado.", 409);
  if (deal.status !== "pendiente_confirmacion") throw new AppError("Este trato ya no se puede confirmar.", 409);
  if (now.getTime() > Date.parse(deal.confirm_deadline)) {
    getDb().prepare(`UPDATE trip_deals SET status = 'expirado' WHERE id = ?`).run(deal.id);
    throw new AppError("Pasó el plazo para confirmar el trato.", 409, "expirado");
  }
  const clean = code.replace(/\D/g, "");
  if (!/^\d{6}$/.test(clean) || !deal.confirm_code_hash) throw new AppError("El código no es válido.", 400, "codigo_invalido");
  if (deal.confirm_attempts >= 5) throw new AppError("Demasiados intentos. Pide un código nuevo.", 429, "limite_intentos");
  const actual = Buffer.from(hashOtp(deal.id, clean), "hex");
  const expected = Buffer.from(deal.confirm_code_hash, "hex");
  const ok = actual.length === expected.length && timingSafeEqual(actual, expected);
  if (!ok) {
    getDb().prepare(`UPDATE trip_deals SET confirm_attempts = confirm_attempts + 1 WHERE id = ?`).run(deal.id);
    throw new AppError("El código no coincide.", 400, "codigo_invalido");
  }

  if (!deal.terms_json) throw new AppError("El trato no tiene los términos congelados.", 409);
  const hash = createHash("sha256").update(deal.terms_json).digest("hex");
  const periodo = periodoOperacion(now);
  const stamp = now.toISOString();
  const shipment = prepararCadena(loadId, user);
  const db = getDb();
  const saved = db.transaction(() => {
    const counter = db
      .prepare(
        `INSERT INTO ops_operation_counters (periodo, ultimo) VALUES (?, 1)
         ON CONFLICT(periodo) DO UPDATE SET ultimo = ultimo + 1
         WHERE ultimo < ?
         RETURNING ultimo`,
      )
      .get(periodo, MAX_CORRELATIVO) as { ultimo: number } | undefined;
    if (!counter) throw new AppError("No hay correlativo disponible para este mes.", 409);
    const folio = codigoOperacion(periodo, counter.ultimo);
    const changed = db
      .prepare(
        `UPDATE trip_deals
         SET status = 'cerrado', folio = ?, terms_hash = ?, confirmed_by = ?, confirmed_at = ?, confirm_code_hash = NULL
         WHERE id = ? AND status = 'pendiente_confirmacion'`,
      )
      .run(folio, hash, user.id, stamp, deal.id);
    if (changed.changes !== 1) throw new AppError("Este trato ya no se puede confirmar.", 409);
    db.prepare(
      `INSERT INTO trip_handoffs (id, load_id, kind, key_id, epoch, status, holder_user_id, sync_state, created_at)
       VALUES (?, ?, 'retiro', ?, 1, 'pendiente', ?, 'en_linea', ?)`,
    ).run(randomUUID(), loadId, process.env.QR_MASTER_KEY_ID || "k1", row.owner_id, stamp);
    escribirEvento(db, shipment.id, "qr.trato_cerrado", { folio, carga: loadId }, user.id, stamp);
    return folio;
  })();
  audit(user, "trato.cerrado", { type: "carga", id: loadId }, { folio: saved });
  return { folio: saved, retiro: formatDateCL(row.offer_pickup) };
}

export function folioDe(loadId: string): string | null {
  return tratoDeCarga(loadId)?.folio ?? null;
}
