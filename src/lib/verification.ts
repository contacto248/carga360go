import { createHash, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { randomToken, tokenHash } from "./auth";
import { getDb } from "./db";
import { AppError } from "./errors";
import { BRAND } from "./catalog";
import { formatWhatsappDisplay, waLink } from "./format";
import { appUrl } from "./mail";
import { type Delivery, sendEmail, sendPhoneOtp, whatsappOtpInboundEnabled } from "./notify";
import { sendRegistrationCopy } from "./registration-pdf";
import type { PublicUser } from "./types";

const EMAIL_TTL_MS = 48 * 60 * 60 * 1000;
const PHONE_TTL_MS = 10 * 60 * 1000;
const RESEND_GAP_MS = 60 * 1000;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

type Channel = "email" | "phone";

type CodeRow = {
  id: string;
  user_id: string;
  channel: Channel;
  code_hash: string;
  target: string;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
  delivery: string;
  created_at: string;
};


/** Prefijo del mensaje entrante. Evita que un número suelto (por ejemplo un precio) se tome como código. */
export const PHONE_OTP_INBOUND_PREFIX = "C360GO";

export type PhoneVerificationStart = {
  delivery: Delivery;
  waLink?: string;
  prefilledText?: string;
  expiresAt?: string;
  businessPhone?: string;
};

export function inboundOtpBusinessNumber(): string {
  const raw = process.env.WHATSAPP_OTP_INBOUND_NUMBER || BRAND.whatsapp;
  return raw.replace(/\D/g, "") || BRAND.whatsapp;
}

export function phoneOtpPrefilledText(code: string): string {
  return `Carga360go: mi código de verificación es ${PHONE_OTP_INBOUND_PREFIX}-${code}`;
}

export function phoneOtpWaLink(code: string): string {
  return waLink(inboundOtpBusinessNumber(), phoneOtpPrefilledText(code));
}

/** Extrae el código solo si trae el prefijo C360GO-. */
export function parseInboundOtpCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.toUpperCase().match(/\bC360GO[^0-9]{0,3}(\d{6})\b/);
  return match ? match[1] : null;
}

function normalizeWaDigits(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

function nowIso() {
  return new Date().toISOString();
}

function otpHash(userId: string, code: string) {
  return createHash("sha256").update(`otp:${userId}:${code}`).digest("hex");
}

function assertRate(userId: string, channel: Channel) {
  const db = getDb();
  const last = db
    .prepare(`SELECT created_at FROM verification_codes WHERE user_id = ? AND channel = ? ORDER BY created_at DESC LIMIT 1`)
    .get(userId, channel) as { created_at: string } | undefined;
  if (last && Date.now() - Date.parse(last.created_at) < RESEND_GAP_MS) {
    throw new AppError("Espera un minuto antes de pedir otro envío.", 429);
  }
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const count = db
    .prepare(`SELECT COUNT(*) AS c FROM verification_codes WHERE user_id = ? AND channel = ? AND created_at > ?`)
    .get(userId, channel, hourAgo) as { c: number };
  if (count.c >= MAX_PER_HOUR) throw new AppError("Demasiados envíos. Inténtalo de nuevo en una hora.", 429);
}

function storeCode(userId: string, channel: Channel, hash: string, target: string, ttl: number): string {
  const db = getDb();
  const id = randomUUID();
  const created = nowIso();
  // Los códigos de teléfono se reemplazan; los enlaces de correo anteriores siguen válidos hasta vencer,
  // para que abrir un correo antiguo después de pedir otro no muestre "venció".
  if (channel === "phone") {
    db.prepare(`UPDATE verification_codes SET consumed_at = ? WHERE user_id = ? AND channel = ? AND consumed_at IS NULL`).run(
      created,
      userId,
      channel,
    );
  }
  db.prepare(
    `INSERT INTO verification_codes (id, user_id, channel, code_hash, target, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, channel, hash, target, new Date(Date.now() + ttl).toISOString(), created);
  return id;
}

function setDelivery(id: string, delivery: Delivery) {
  getDb().prepare(`UPDATE verification_codes SET delivery = ? WHERE id = ?`).run(delivery, id);
}

export async function startEmailVerification(user: PublicUser, opts: { skipRate?: boolean } = {}): Promise<Delivery> {
  if (user.emailVerifiedAt) throw new AppError("Tu correo ya está verificado.");
  if (!opts.skipRate) assertRate(user.id, "email");
  const token = randomToken();
  const id = storeCode(user.id, "email", tokenHash(token), user.email, EMAIL_TTL_MS);
  const link = `${appUrl()}/verificar-correo?token=${encodeURIComponent(token)}`;
  const text = [
    `Hola ${user.contactName},`,
    "",
    "Confirma tu correo en Carga360go: abre este enlace y presiona «Confirmar mi correo» (vence en 48 horas):",
    link,
    "",
    "Si el enlace venció, pide uno nuevo en " + `${appUrl()}/verificar-correo`,
    "",
    "Si no creaste una cuenta, ignora este mensaje.",
    "",
    "Carga360go",
  ].join("\n");
  const delivery = await sendEmail(user.email, "Confirma tu correo — Carga360go", text);
  setDelivery(id, delivery);
  return delivery;
}

export type EmailTokenState = "valido" | "verificado" | "invalido";

function emailTokenRow(token: string): CodeRow | undefined {
  if (!token || token.length > 200) return undefined;
  return getDb()
    .prepare(`SELECT * FROM verification_codes WHERE channel = 'email' AND code_hash = ?`)
    .get(tokenHash(token)) as CodeRow | undefined;
}

/**
 * Revisa el enlace sin consumirlo. Los antivirus y vistas previas del correo abren los enlaces con GET,
 * así que la página solo muestra un botón y el correo se confirma con POST.
 */
export function emailTokenState(token: string): EmailTokenState {
  const row = emailTokenRow(token);
  if (!row) return "invalido";
  const user = getDb().prepare(`SELECT email, email_verified_at FROM users WHERE id = ?`).get(row.user_id) as
    | { email: string; email_verified_at: string | null }
    | undefined;
  if (!user || user.email.toLowerCase() !== row.target.toLowerCase()) return "invalido";
  if (user.email_verified_at) return "verificado";
  if (row.consumed_at || Date.parse(row.expires_at) <= Date.now()) return "invalido";
  return "valido";
}

/** Consume el enlace del correo. Devuelve true si quedó verificado (o ya lo estaba con ese mismo enlace). */
export function confirmEmailToken(token: string): boolean {
  const state = emailTokenState(token);
  if (state === "verificado") return true;
  if (state !== "valido") return false;
  const row = emailTokenRow(token) as CodeRow;
  const db = getDb();
  const stamp = nowIso();
  db.transaction(() => {
    db.prepare(`UPDATE verification_codes SET consumed_at = ? WHERE id = ?`).run(stamp, row.id);
    db.prepare(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?`).run(stamp, row.user_id);
  })();
  // Bienvenida con la copia de la inscripción en PDF (solo con REGISTRATION_PDF_ENABLED=true; nunca bloquea).
  void sendRegistrationCopy(row.user_id);
  return true;
}

/**
 * Reenvío público por correo (sin sesión). No revela si el correo existe: siempre responde igual.
 * Solo envía a cuentas no verificadas y respeta el límite de envíos.
 */
export async function resendEmailVerification(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!clean || clean.length > 200) return;
  const row = getDb().prepare(`SELECT id FROM users WHERE email = ? AND email_verified_at IS NULL`).get(clean) as
    | { id: string }
    | undefined;
  if (!row) return;
  const user = getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(row.id) as Record<string, unknown>;
  try {
    await startEmailVerification({
      id: String(user.id),
      email: String(user.email),
      contactName: String(user.contact_name),
      emailVerifiedAt: null,
    } as PublicUser);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
  }
}

export async function startPhoneVerification(user: PublicUser): Promise<PhoneVerificationStart> {
  if (user.phoneVerifiedAt) throw new AppError("Tu teléfono ya está verificado.");
  assertRate(user.id, "phone");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = storeCode(user.id, "phone", otpHash(user.id, code), user.whatsapp, PHONE_TTL_MS);
  if (whatsappOtpInboundEnabled()) {
    const expiresAt = new Date(Date.now() + PHONE_TTL_MS).toISOString();
    setDelivery(id, "whatsapp_inbound");
    // No se envía ningún mensaje de salida (es el canal gratuito). El código no se registra en el log.
    return {
      delivery: "whatsapp_inbound",
      waLink: phoneOtpWaLink(code),
      prefilledText: phoneOtpPrefilledText(code),
      expiresAt,
      businessPhone: formatWhatsappDisplay(inboundOtpBusinessNumber()),
    };
  }
  const delivery = await sendPhoneOtp(user.whatsapp, code);
  setDelivery(id, delivery);
  return { delivery };
}

export function confirmPhoneCode(user: PublicUser, code: string) {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) throw new AppError("El código tiene 6 dígitos.");
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM verification_codes WHERE user_id = ? AND channel = 'phone' AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(user.id) as CodeRow | undefined;
  if (!row || row.expires_at <= nowIso()) throw new AppError("El código venció. Pide uno nuevo.");
  if (row.target !== user.whatsapp) throw new AppError("El número cambió. Pide un código nuevo.");
  if (row.attempts >= MAX_ATTEMPTS) throw new AppError("Demasiados intentos. Pide un código nuevo.", 429);
  if (row.delivery === "whatsapp_inbound") {
    throw new AppError("Para confirmar, envía el mensaje de WhatsApp desde el número que registraste. Ingresar el código aquí no basta.");
  }
  const expected = Buffer.from(row.code_hash, "hex");
  const actual = Buffer.from(otpHash(user.id, clean), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    db.prepare(`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?`).run(row.id);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw new AppError(left > 0 ? `Código incorrecto. Te quedan ${left} intento(s).` : "Código incorrecto. Pide uno nuevo.");
  }
  const stamp = nowIso();
  db.transaction(() => {
    db.prepare(`UPDATE verification_codes SET consumed_at = ? WHERE id = ?`).run(stamp, row.id);
    db.prepare(`UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, ?) WHERE id = ?`).run(stamp, user.id);
  })();
}

export type PendingCodeInfo = { channel: Channel; delivery: string; createdAt: string; expiresAt: string } | null;

export function lastCodeInfo(userId: string, channel: Channel): PendingCodeInfo {
  const row = getDb()
    .prepare(`SELECT * FROM verification_codes WHERE user_id = ? AND channel = ? ORDER BY created_at DESC LIMIT 1`)
    .get(userId, channel) as CodeRow | undefined;
  if (!row) return null;
  return { channel, delivery: row.delivery, createdAt: row.created_at, expiresAt: row.expires_at };
}

export function phoneDisplay(digits: string) {
  return formatWhatsappDisplay(digits);
}

export type InboundOtpResult = "ok" | "no_aplica" | "codigo_invalido" | "vencido" | "ya_verificado";

/**
 * Confirma el teléfono si el mensaje entrante trae un código C360GO-****** y
 * viene del WhatsApp registrado de una cuenta con código vigente.
 * No envía ninguna respuesta por WhatsApp.
 */
export function confirmPhoneFromWhatsapp(fromWaId: string, text: string | null | undefined): InboundOtpResult {
  if (!whatsappOtpInboundEnabled()) return "no_aplica";
  const code = parseInboundOtpCode(text);
  if (!code) return "no_aplica";
  const digits = normalizeWaDigits(fromWaId);
  if (!digits) return "no_aplica";
  const db = getDb();
  const matches = (
    db.prepare(`SELECT id, whatsapp, phone_verified_at FROM users`).all() as {
      id: string;
      whatsapp: string;
      phone_verified_at: string | null;
    }[]
  ).filter((row) => normalizeWaDigits(row.whatsapp) === digits);
  if (!matches.length) return "codigo_invalido";
  let sawExpired = false;
  let sawBad = false;
  for (const user of matches) {
    if (user.phone_verified_at) return "ya_verificado";
    const row = db
      .prepare(
        `SELECT * FROM verification_codes WHERE user_id = ? AND channel = 'phone' AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(user.id) as CodeRow | undefined;
    if (!row) {
      sawBad = true;
      continue;
    }
    if (row.expires_at <= nowIso()) {
      sawExpired = true;
      continue;
    }
    if (normalizeWaDigits(row.target) !== digits) {
      sawBad = true;
      continue;
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      sawBad = true;
      continue;
    }
    const expected = Buffer.from(row.code_hash, "hex");
    const actual = Buffer.from(otpHash(user.id, code), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      db.prepare(`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?`).run(row.id);
      sawBad = true;
      continue;
    }
    const stamp = nowIso();
    db.transaction(() => {
      db.prepare(`UPDATE verification_codes SET consumed_at = ? WHERE id = ?`).run(stamp, row.id);
      db.prepare(`UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, ?) WHERE id = ?`).run(stamp, user.id);
    })();
    return "ok";
  }
  if (sawExpired) return "vencido";
  if (sawBad) return "codigo_invalido";
  return "codigo_invalido";
}
