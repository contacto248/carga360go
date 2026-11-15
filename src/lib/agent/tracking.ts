import { createHash, randomBytes, randomInt, randomUUID } from "crypto";
import { equipmentById } from "../catalog";
import { getDb } from "../db";
import { formatDateCL } from "../format";
import { getLoad } from "../listings";
import { emailChannelReady, sendEmail, sendPhoneOtp, whatsappChannelReady } from "../notify";
import type { PublicUser } from "../types";
import { TRIP_LABEL, isTripParty, isTripStatus } from "../viaje";

/**
 * Código corto de seguimiento por carga (SEG-XXXXXX) y verificación del contacto registrado.
 *
 * Para ver el estado de una carga por el agente (voz, chat o WhatsApp) sin sesión iniciada hay que dar
 * el código de seguimiento y luego un código de un solo uso enviado al correo o WhatsApp registrado del
 * dueño de la carga. Si no hay envío configurado, el agente deriva al panel con sesión iniciada.
 * La respuesta es idéntica exista o no el código de seguimiento (no sirve para adivinar códigos).
 */
export const TRACKING_PREFIX = "SEG-";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
/** Máximo de códigos enviados por conversación por hora. */
export const OTP_MAX_PER_HOUR = 3;

function randomCode(): string {
  let out = "";
  for (const byte of randomBytes(6)) out += ALPHABET[byte % ALPHABET.length];
  return `${TRACKING_PREFIX}${out}`;
}

/** Devuelve (y crea al primer uso) el código de seguimiento de la carga. */
export function trackingCodeFor(loadId: string, now = new Date()): string {
  const db = getDb();
  const row = db.prepare(`SELECT code FROM load_tracking_codes WHERE load_id = ?`).get(loadId) as { code: string } | undefined;
  if (row) return row.code;
  for (let i = 0; i < 8; i += 1) {
    const code = randomCode();
    const result = db.prepare(`INSERT OR IGNORE INTO load_tracking_codes (load_id, code, created_at) VALUES (?, ?, ?)`).run(loadId, code, now.toISOString());
    if (result.changes > 0) return code;
    const again = db.prepare(`SELECT code FROM load_tracking_codes WHERE load_id = ?`).get(loadId) as { code: string } | undefined;
    if (again) return again.code;
  }
  throw new Error("No se pudo generar el código de seguimiento.");
}

/** Extrae un código SEG-XXXXXX de un texto dictado o escrito ("seg 7kq 2mx", "SEG-7KQ2MX"). */
export function parseTrackingCode(text: string): string | null {
  const clean = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = clean.match(/SEG([A-Z2-9]{6})/);
  return match ? `${TRACKING_PREFIX}${match[1]}` : null;
}

export function loadIdForTrackingCode(code: string): string | null {
  const row = getDb().prepare(`SELECT load_id FROM load_tracking_codes WHERE code = ?`).get(code) as { load_id: string } | undefined;
  return row?.load_id ?? null;
}

export function trackingCodeVisibleTo(loadId: string, user: PublicUser | null): boolean {
  return isTripParty(loadId, user);
}

function hashOtp(conversationId: string, code: string): string {
  return createHash("sha256").update(`${conversationId}:${code}`).digest("hex");
}

export type OtpChannel = "email" | "whatsapp";

/** Envío del código. Reemplazable en pruebas; en producción usa SMTP o la plantilla OTP de WhatsApp existentes. */
export type OtpSender = {
  channel: () => OtpChannel | null;
  send: (channel: OtpChannel, to: string, code: string) => Promise<boolean>;
};

const defaultSender: OtpSender = {
  channel: () => (emailChannelReady() ? "email" : whatsappChannelReady() ? "whatsapp" : null),
  send: async (channel, to, code) => {
    if (channel === "email") {
      const delivery = await sendEmail(
        to,
        "Código para consultar su carga en Carga 360 Go",
        `Su código de verificación es ${code}. Vence en 10 minutos.\n\nSi usted no lo pidió, ignore este mensaje: nadie verá el estado de su carga sin este código.`,
      );
      return delivery === "smtp";
    }
    const delivery = await sendPhoneOtp(to, code);
    return delivery === "whatsapp";
  },
};

let sender: OtpSender = defaultSender;

export function setOtpSenderForTests(next: OtpSender | null) {
  sender = next ?? defaultSender;
}

export function otpChannelAvailable(): OtpChannel | null {
  return sender.channel();
}

export type StartResult =
  | { status: "enviado"; channel: OtpChannel }
  | { status: "sin_canal" }
  | { status: "limite" };

/**
 * Pide el código de un solo uso. Exista o no la carga, la respuesta es la misma ("enviado" con el canal),
 * para que no sirva para adivinar códigos. Si no hay canal configurado, "sin_canal".
 */
export async function startTrackingChallenge(conversationId: string, trackingCode: string, now = new Date()): Promise<StartResult> {
  const channel = sender.channel();
  if (!channel) return { status: "sin_canal" };
  const db = getDb();
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = (db.prepare(`SELECT COUNT(*) AS n FROM agent_otp_challenges WHERE conversation_id = ? AND created_at >= ?`).get(conversationId, since) as { n: number }).n;
  if (recent >= OTP_MAX_PER_HOUR) return { status: "limite" };
  const loadId = loadIdForTrackingCode(trackingCode);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  if (loadId) {
    const owner = db
      .prepare(`SELECT u.email, u.whatsapp FROM loads l JOIN users u ON u.id = l.owner_id WHERE l.id = ?`)
      .get(loadId) as { email: string; whatsapp: string } | undefined;
    const to = owner ? (channel === "email" ? owner.email : owner.whatsapp.replace(/\D/g, "")) : "";
    if (to) {
      try {
        await sender.send(channel, to, code);
      } catch {
        console.error("[carga360go] agente: no se pudo enviar el código de seguimiento");
      }
    }
  }
  // Sin carga se guarda un desafío imposible: el flujo y los tiempos son los mismos.
  const hash = loadId ? hashOtp(conversationId, code) : hashOtp(conversationId, randomUUID());
  db.prepare(
    `INSERT INTO agent_otp_challenges (id, conversation_id, load_id, channel, code_hash, attempts, expires_at, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(randomUUID(), conversationId, loadId, channel, hash, new Date(now.getTime() + OTP_TTL_MS).toISOString(), now.toISOString());
  return { status: "enviado", channel };
}

export type VerifyResult = { ok: true; loadId: string } | { ok: false; reason: "incorrecto" | "vencido" | "agotado" | "sin_desafio" };

/** Verifica el código de un solo uso del último desafío vigente de la conversación. */
export function verifyTrackingChallenge(conversationId: string, rawCode: string, now = new Date()): VerifyResult {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM agent_otp_challenges WHERE conversation_id = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`)
    .get(conversationId) as { id: string; load_id: string | null; code_hash: string; attempts: number; expires_at: string } | undefined;
  if (!row) return { ok: false, reason: "sin_desafio" };
  if (row.expires_at < now.toISOString()) return { ok: false, reason: "vencido" };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "agotado" };
  const code = rawCode.replace(/\D/g, "");
  if (code.length !== 6 || !row.load_id || hashOtp(conversationId, code) !== row.code_hash) {
    db.prepare(`UPDATE agent_otp_challenges SET attempts = attempts + 1 WHERE id = ?`).run(row.id);
    return { ok: false, reason: row.attempts + 1 >= OTP_MAX_ATTEMPTS ? "agotado" : "incorrecto" };
  }
  db.prepare(`UPDATE agent_otp_challenges SET used_at = ? WHERE id = ?`).run(now.toISOString(), row.id);
  return { ok: true, loadId: row.load_id };
}

const LOAD_STATUS_LABEL: Record<string, string> = { abierta: "abierta a ofertas", adjudicada: "adjudicada", cerrada: "cerrada" };

/** Estado de la carga ya verificada: ruta, estado y último evento registrado. Sin contactos ni nombres. */
export function verifiedLoadStatus(loadId: string): string {
  const load = getLoad(loadId);
  if (!load) return "No encontré esa carga.";
  const equipment = equipmentById(load.equipment)?.label ?? load.equipment;
  const lines = [`Carga ${load.origin} → ${load.destination}, ${equipment}, retiro ${formatDateCL(load.pickupDate)}: ${LOAD_STATUS_LABEL[load.status] ?? load.status}.`];
  if (load.status === "abierta") lines.push(`Ofertas recibidas: ${load.offerCount}.`);
  if (load.status === "adjudicada") {
    const last = getDb()
      .prepare(`SELECT status, created_at AS createdAt FROM trip_events WHERE load_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(loadId) as { status: string; createdAt: string } | undefined;
    if (last && isTripStatus(last.status)) {
      lines.push(`Último evento registrado: ${TRIP_LABEL[last.status]}, ${formatDateCL(last.createdAt.slice(0, 10))} ${last.createdAt.slice(11, 16)} UTC.`);
    } else {
      lines.push("Aún no hay eventos de viaje registrados.");
    }
    lines.push("No hay GPS en vivo conectado: este es el último evento registrado en la plataforma.");
  }
  return lines.join("\n");
}
