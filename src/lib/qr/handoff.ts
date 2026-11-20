import { createHash, randomBytes, randomUUID } from "crypto";
import QRCode from "qrcode";
import { audit } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import { asignacionVigente } from "./assignment";
import { prepararCadena, escribirEvento } from "./chain";
import { tratoDeCarga } from "./deal";
import { delegateLinkEnabled } from "./flag";
import { archivarComprobante } from "./pdf";
import { formatPatente } from "./patente";
import {
  QR_LOCK_MS,
  QR_MAX_ATTEMPTS,
  QR_OFFLINE_GRACE_MS,
  backupCode,
  backupCodeMatches,
  issuePickupToken,
  masterKey,
  secondsLeft,
  tripKey,
  verifySignature,
  windowFresh,
} from "./token";

type Fail =
  | "firma_invalida"
  | "vencido"
  | "ya_usado"
  | "chofer_no_asignado"
  | "patente_distinta"
  | "limite_intentos"
  | "estado_invalido"
  | "codigo_invalido"
  | "mal_formado";

const MENSAJE: Record<Fail, string> = {
  firma_invalida: "El QR no es válido.",
  vencido: "El QR venció. Quien entrega debe mostrar el que está en pantalla.",
  ya_usado: "Este QR ya se usó.",
  chofer_no_asignado: "Solo el chofer asignado puede registrar el retiro.",
  patente_distinta: "La patente no coincide con el camión asignado.",
  limite_intentos: "Demasiados intentos. Hay que esperar 15 minutos.",
  estado_invalido: "El viaje no está en camino al retiro.",
  codigo_invalido: "El código no coincide.",
  mal_formado: "No pudimos leer el QR.",
};

function fail(code: Fail, status = 400): never {
  const http = code === "limite_intentos" ? 429 : status;
  throw new AppError(MENSAJE[code], http, code);
}

type Handoff = {
  id: string;
  load_id: string;
  epoch: number;
  status: string;
  locked_until: string | null;
  holder_user_id: string | null;
};

function handoffOf(loadId: string): Handoff | null {
  const row = getDb()
    .prepare(
      `SELECT id, load_id, epoch, status, locked_until, holder_user_id FROM trip_handoffs WHERE load_id = ? AND kind = 'retiro'`,
    )
    .get(loadId) as Handoff | undefined;
  return row ?? null;
}

function pickupKey(loadId: string, epoch: number) {
  const deal = tratoDeCarga(loadId);
  if (!deal || deal.status !== "cerrado" || !deal.terms_hash) throw new AppError("El trato todavía no está cerrado.", 409);
  const master = masterKey();
  return { deal, master, key: tripKey(master.key, loadId, "r", deal.terms_hash, epoch) };
}

export async function emitirQr(loadId: string, now = new Date()) {
  const hand = handoffOf(loadId);
  const assignment = asignacionVigente(loadId);
  if (!hand || !assignment) throw new AppError("Aún no hay chofer asignado para mostrar el QR.", 409);
  if (hand.status === "confirmado") throw new AppError("El retiro de esta carga ya fue validado.", 409);
  if (hand.status === "escaneado") throw new AppError("El chofer ya escaneó. Falta tu confirmación.", 409, "esperando_confirmacion");
  const { key } = pickupKey(loadId, assignment.epoch);
  const issued = issuePickupToken(key, tratoDeCarga(loadId)!.public_ref, now.getTime());
  const svg = await QRCode.toString(issued.token, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
    color: { dark: "#0D1014", light: "#FFFFFF" },
  });
  return { svg, segundos: secondsLeft(now.getTime()), codigo: backupCode(key, now.getTime()) };
}

export type ValidarInput = {
  token?: string | null;
  codigo?: string | null;
  patente?: string | null;
  lat?: number | null;
  lng?: number | null;
  deviceId?: string | null;
  sinSenal?: boolean;
  deviceTime?: string | null;
};

function recordarIntento(
  db: ReturnType<typeof getDb>,
  handoffId: string,
  actorId: string | null,
  method: string,
  result: string,
  input: ValidarInput,
  stamp: string,
  nonce: string | null,
) {
  db.prepare(
    `INSERT INTO trip_handoff_attempts (id, handoff_id, actor_id, device_id, method, nonce, result, lat, lng, device_time, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    handoffId,
    actorId,
    input.deviceId || null,
    method,
    nonce,
    result,
    input.lat ?? null,
    input.lng ?? null,
    input.deviceTime || null,
    stamp,
  );
}

function intentosRecientes(handoffId: string, actorId: string, now: Date): number {
  const since = new Date(now.getTime() - QR_LOCK_MS).toISOString();
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM trip_handoff_attempts
       WHERE handoff_id = ? AND result <> 'ok' AND created_at >= ? AND (actor_id = ? OR actor_id IS NULL)`,
    )
    .get(handoffId, since, actorId) as { n: number };
  return row.n;
}

export function validarRetiro(user: PublicUser, loadId: string, input: ValidarInput, now = new Date()) {
  const deal = tratoDeCarga(loadId);
  const assignment = asignacionVigente(loadId);
  const hand = handoffOf(loadId);
  if (!deal || deal.status !== "cerrado" || !hand || !assignment) fail("estado_invalido", 409);
  if (assignment.driverUserId !== user.id) fail("chofer_no_asignado", 403);
  const load = getDb().prepare(`SELECT trip_status FROM loads WHERE id = ?`).get(loadId) as { trip_status: string | null };
  if (load.trip_status !== "en_camino") fail("estado_invalido", 409);
  if (hand.status === "confirmado") fail("ya_usado", 409);
  if (hand.status === "escaneado") fail("ya_usado", 409);
  if (hand.locked_until && Date.parse(hand.locked_until) > now.getTime()) fail("limite_intentos", 429);
  if (intentosRecientes(hand.id, user.id, now) >= QR_MAX_ATTEMPTS) {
    const until = new Date(now.getTime() + QR_LOCK_MS).toISOString();
    getDb().prepare(`UPDATE trip_handoffs SET locked_until = ? WHERE id = ?`).run(until, hand.id);
    fail("limite_intentos", 429);
  }

  const patente = (input.patente || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const method = input.token ? "qr" : "codigo";
  const stamp = now.toISOString();
  let nonce: string | null = null;
  let failure: Fail | null = null;
  let sync: "en_linea" | "sincronizado" = "en_linea";

  if (patente !== assignment.patente) failure = "patente_distinta";
  else if (input.token) {
    const { key } = pickupKey(loadId, assignment.epoch);
    const checked = verifySignature(key, input.token.trim(), "r");
    if ("failure" in checked) failure = checked.failure === "mal_formado" ? "mal_formado" : "firma_invalida";
    else if (checked.payload.j !== deal.public_ref) failure = "firma_invalida";
    else if (!windowFresh(checked.payload.w, now.getTime())) failure = "vencido";
    else nonce = checked.payload.n;
  } else if (input.codigo) {
    const { key } = pickupKey(loadId, assignment.epoch);
    const when = input.sinSenal && input.deviceTime ? Date.parse(input.deviceTime) : now.getTime();
    if (input.sinSenal) {
      if (!Number.isFinite(when) || Math.abs(now.getTime() - when) > QR_OFFLINE_GRACE_MS) failure = "vencido";
      else sync = "sincronizado";
    }
    const clock = failure ? now.getTime() : when;
    if (!failure && !backupCodeMatches(key, input.codigo, clock)) failure = "codigo_invalido";
    else if (!failure) nonce = `totp:${Math.floor(clock / 1000 / 30)}`;
  } else failure = "mal_formado";

  const shipment = prepararCadena(loadId, user);
  const db = getDb();
  const applied = db.transaction(() => {
    if (failure) {
      recordarIntento(db, hand.id, user.id, method, failure, input, stamp, null);
      const recent = intentosRecientes(hand.id, user.id, now) ;
      if (recent >= QR_MAX_ATTEMPTS) {
        db.prepare(`UPDATE trip_handoffs SET locked_until = ? WHERE id = ?`).run(new Date(now.getTime() + QR_LOCK_MS).toISOString(), hand.id);
      }
      if (input.sinSenal && failure === "codigo_invalido") {
        db.prepare(`UPDATE loads SET trip_status = 'incidencia', updated_at = ? WHERE id = ?`).run(stamp, loadId);
        db.prepare(`INSERT INTO trip_events (id, load_id, actor_id, status, note, created_at) VALUES (?, ?, ?, 'incidencia', ?, ?)`).run(
          randomUUID(),
          loadId,
          user.id,
          "Código de retiro sin conexión no verificado",
          stamp,
        );
      }
      escribirEvento(db, shipment.id, "qr.intento", { metodo: method, resultado: failure, patente: assignment.patente, epoch: assignment.epoch }, user.id, stamp);
      return failure;
    }
    try {
      db.prepare(`INSERT INTO trip_qr_nonces (handoff_id, nonce, created_at) VALUES (?, ?, ?)`).run(hand.id, nonce, stamp);
    } catch {
      recordarIntento(db, hand.id, user.id, method, "ya_usado", input, stamp, nonce);
      escribirEvento(db, shipment.id, "qr.intento", { metodo: method, resultado: "ya_usado", patente: assignment.patente, epoch: assignment.epoch }, user.id, stamp);
      return "ya_usado" as Fail;
    }
    recordarIntento(db, hand.id, user.id, method, "ok", input, stamp, nonce);
    db.prepare(
      `UPDATE trip_handoffs SET status = 'escaneado', validated_at = ?, validated_by = ?, method = ?, sync_state = ? WHERE id = ?`,
    ).run(stamp, user.id, method, sync, hand.id);
    escribirEvento(
      db,
      shipment.id,
      "qr.escaneado",
      { metodo: method, resultado: "ok", patente: assignment.patente, epoch: assignment.epoch },
      user.id,
      stamp,
    );
    return null;
  })();

  if (applied) fail(applied);
  audit(user, "trato.qr_escaneado", { type: "carga", id: loadId }, { metodo: method, patente: formatPatente(assignment.patente) });
  return { ok: true as const, esperandoPoseedor: true, patente: formatPatente(assignment.patente), chofer: assignment.nombre };
}

export function confirmarPoseedor(
  user: Pick<PublicUser, "id" | "email"> | null,
  loadId: string,
  decision: "entrego" | "no_coincide",
  now = new Date(),
  origen?: { tipo: "delegado"; enlaceId: string },
) {
  const hand = handoffOf(loadId);
  const assignment = asignacionVigente(loadId);
  if (!hand || !assignment) throw new AppError("No hay un retiro por confirmar.", 409);
  const delegado = origen?.tipo === "delegado";
  if (!delegado && (!user || hand.holder_user_id !== user.id)) throw new AppError("Solo quien entrega la carga puede confirmar.", 403);
  if (hand.status !== "escaneado") throw new AppError("El chofer todavía no escanea el QR.", 409);
  const stamp = now.toISOString();
  const actorId = delegado ? null : (user?.id ?? null);
  const shipment = prepararCadena(loadId, delegado ? null : user);
  const metodo = delegado ? "delegado" : "confirmacion";
  const notaOk = delegado ? "Retiro validado por enlace de bodega" : "Retiro validado con QR";
  const notaNo = delegado ? "El enlace de bodega reportó que no coincide" : "Quien entrega reportó que no coincide";
  const db = getDb();
  db.transaction(() => {
    if (decision === "entrego") {
      db.prepare(`UPDATE trip_handoffs SET status = 'confirmado', holder_confirmed_at = ? WHERE id = ? AND status = 'escaneado'`).run(stamp, hand.id);
      db.prepare(`UPDATE loads SET trip_status = 'retirado', updated_at = ? WHERE id = ?`).run(stamp, loadId);
      db.prepare(`INSERT INTO trip_events (id, load_id, actor_id, status, note, created_at) VALUES (?, ?, ?, 'retirado', ?, ?)`).run(
        randomUUID(),
        loadId,
        actorId,
        notaOk,
        stamp,
      );
      escribirEvento(
        db,
        shipment.id,
        "qr.retiro_validado",
        { metodo, resultado: "ok", patente: assignment.patente, epoch: assignment.epoch, enlaceId: origen?.enlaceId ?? null },
        actorId,
        stamp,
      );
    } else {
      db.prepare(`UPDATE trip_handoffs SET status = 'rechazado', holder_confirmed_at = ? WHERE id = ?`).run(stamp, hand.id);
      db.prepare(`UPDATE loads SET trip_status = 'incidencia', updated_at = ? WHERE id = ?`).run(stamp, loadId);
      db.prepare(`INSERT INTO trip_events (id, load_id, actor_id, status, note, created_at) VALUES (?, ?, ?, 'incidencia', ?, ?)`).run(
        randomUUID(),
        loadId,
        actorId,
        notaNo,
        stamp,
      );
      escribirEvento(
        db,
        shipment.id,
        "qr.retiro_rechazado",
        { metodo, resultado: "no_coincide", patente: assignment.patente, epoch: assignment.epoch, enlaceId: origen?.enlaceId ?? null },
        actorId,
        stamp,
      );
    }
  })();
  audit(delegado ? null : user, decision === "entrego" ? "trato.retiro_confirmado" : "trato.retiro_rechazado", { type: "carga", id: loadId }, {
    enlaceId: origen?.enlaceId ?? null,
  });
  if (decision === "entrego") archivarComprobante(loadId, now);
  return { ok: true as const, decision, delegado };
}

export function confirmarPorDelegado(token: string, loadId: string, decision: "entrego" | "no_coincide", now = new Date()) {
  if (!delegateLinkEnabled()) throw new AppError("No encontrado.", 404);
  const link = delegadoVigente(token, now);
  if (!link || link.load_id !== loadId) throw new AppError("El enlace no sirve.", 403);
  const holder = getDb().prepare(`SELECT holder_user_id FROM trip_handoffs WHERE load_id = ? AND kind = 'retiro'`).get(loadId) as
    | { holder_user_id: string }
    | undefined;
  if (!holder?.holder_user_id) throw new AppError("No hay un retiro por confirmar.", 409);
  const result = confirmarPoseedor(null, loadId, decision, now, { tipo: "delegado", enlaceId: link.id });
  if (decision === "entrego") {
    getDb().prepare(`UPDATE trip_delegate_links SET revoked_at = ? WHERE id = ?`).run(now.toISOString(), link.id);
  }
  return result;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function crearDelegado(user: PublicUser, loadId: string, now = new Date()) {
  if (!delegateLinkEnabled()) throw new AppError("No encontrado.", 404);
  const deal = tratoDeCarga(loadId);
  const load = getDb().prepare(`SELECT owner_id FROM loads WHERE id = ?`).get(loadId) as { owner_id: string } | undefined;
  if (!deal || deal.status !== "cerrado" || !load || load.owner_id !== user.id) {
    throw new AppError("Solo el mandante del trato puede crear el enlace.", 403);
  }
  const token = randomBytes(24).toString("base64url");
  const stamp = now.toISOString();
  const expires = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
  const db = getDb();
  db.prepare(`UPDATE trip_delegate_links SET revoked_at = ? WHERE load_id = ? AND revoked_at IS NULL`).run(stamp, loadId);
  db.prepare(
    `INSERT INTO trip_delegate_links (id, load_id, token_hash, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), loadId, hashToken(token), user.id, expires, stamp);
  audit(user, "trato.delegado", { type: "carga", id: loadId });
  return { path: `/d/${token}`, expira: expires };
}

export function delegadoVigente(token: string, now = new Date()) {
  if (!delegateLinkEnabled()) return null;
  if (!token || token.length < 20) return null;
  const row = getDb()
    .prepare(`SELECT id, load_id, expires_at, revoked_at FROM trip_delegate_links WHERE token_hash = ?`)
    .get(hashToken(token)) as { id: string; load_id: string; expires_at: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at || Date.parse(row.expires_at) < now.getTime()) return null;
  const hand = handoffOf(row.load_id);
  if (!hand || hand.status === "confirmado") return null;
  return row;
}

/** Fase 2: la entrega en destino repite estas verificaciones con kind "e". */
export function entregaValidar(): never {
  // TODO QR-10: tokens de retiro no sirven en destino. No implementar en la fase 1.
  throw new AppError("La entrega en destino queda para la fase 2.", 501, "fase_2");
}

export function entregaConformidad(): never {
  // TODO QR-11: firma, conformidad y disputa. No implementar en la fase 1.
  throw new AppError("La conformidad en destino queda para la fase 2.", 501, "fase_2");
}
