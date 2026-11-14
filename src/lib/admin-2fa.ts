import { randomInt, randomUUID, timingSafeEqual, createHash } from "crypto";
import { audit } from "./audit";
import { createSession, randomToken, tokenHash, userFromToken } from "./auth";
import { getDb } from "./db";
import { AppError } from "./errors";
import { sendEmail } from "./notify";
import type { PublicUser } from "./types";

/**
 * Segundo factor de la cuenta administradora: tras la contraseña correcta enviamos un código de 6 dígitos a su correo.
 * Vence en 10 minutos, admite 5 intentos y como máximo 5 códigos cada 15 minutos. Opcional: confiar en el dispositivo 30 días.
 */
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_CODES_PER_WINDOW = 5;
export const CODE_WINDOW_MS = 15 * 60 * 1000;
export const TRUST_MS = 30 * 24 * 60 * 60 * 1000;
export const CHALLENGE_COOKIE = "c360_2fa";
export const TRUST_COOKIE = "c360_td";

function codeHash(challengeId: string, code: string): string {
  return createHash("sha256").update(`${challengeId}:${code}`).digest("hex");
}

export function maskEmail(email: string): string {
  const [local, domain = ""] = email.split("@");
  if (!local) return email;
  return `${local.charAt(0)}${"•".repeat(Math.max(1, local.length - 2))}${local.length > 1 ? local.charAt(local.length - 1) : ""}@${domain}`;
}

type ChallengeRow = { id: string; user_id: string; code_hash: string; attempts: number; expires_at: string; consumed_at: string | null };

/** Crea un desafío y envía el código por correo. Devuelve el id del desafío (va en una cookie httpOnly). */
export async function startAdminChallenge(
  user: PublicUser,
  ip: string | null,
  opts: { send?: (to: string, subject: string, text: string) => Promise<string> } = {},
): Promise<{ challengeId: string; sentTo: string }> {
  if (user.role !== "admin") throw new AppError("Solo la cuenta administradora usa código de ingreso.", 400);
  const db = getDb();
  const now = new Date();
  const since = new Date(now.getTime() - CODE_WINDOW_MS).toISOString();
  const recent = (db.prepare(`SELECT COUNT(*) AS n FROM login_challenges WHERE user_id = ? AND created_at > ?`).get(user.id, since) as { n: number }).n;
  if (recent >= MAX_CODES_PER_WINDOW) {
    audit(user, "admin.2fa_limite", { type: "usuario", id: user.id }, { codigos: recent }, ip);
    throw new AppError("Pediste demasiados códigos. Espera 15 minutos e inténtalo de nuevo.", 429, "demasiados_codigos");
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = randomUUID();
  db.prepare(`UPDATE login_challenges SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL`).run(now.toISOString(), user.id);
  db.prepare(`INSERT INTO login_challenges (id, user_id, code_hash, attempts, expires_at, ip, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)`).run(
    id,
    user.id,
    codeHash(id, code),
    new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    ip,
    now.toISOString(),
  );
  const send = opts.send ?? sendEmail;
  const when = now.toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });
  const delivery = await send(
    user.email,
    `Código de ingreso: ${code} — Carga360go`,
    [
      "Hola,",
      "",
      `Tu código para ingresar al panel de administración de Carga360go es: ${code}`,
      "",
      `Vence en 10 minutos. Solicitado el ${when} (hora de Chile) desde la IP ${ip || "desconocida"}.`,
      "",
      "Si no fuiste tú, alguien conoce tu contraseña: cámbiala de inmediato en https://carga360go.cl/recuperar.",
      "",
      "Carga360go",
    ].join("\n"),
  );
  if (delivery === "error") {
    db.prepare(`UPDATE login_challenges SET consumed_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
    throw new AppError("No pudimos enviar el código a tu correo. Inténtalo de nuevo en unos minutos.", 502, "codigo_no_enviado");
  }
  audit(user, "admin.2fa_codigo_enviado", { type: "usuario", id: user.id }, { destino: maskEmail(user.email) }, ip);
  return { challengeId: id, sentTo: maskEmail(user.email) };
}

/** Valida el código. Si es correcto abre una sesión marcada con segundo factor. */
export function verifyAdminChallenge(challengeId: string | null | undefined, rawCode: unknown, ip: string | null): { user: PublicUser; token: string } {
  const code = String(rawCode ?? "").replace(/\s+/g, "");
  const expired = new AppError("El código venció o ya no es válido. Ingresa de nuevo con tu contraseña para recibir otro.", 400, "codigo_vencido");
  if (!challengeId) throw expired;
  const db = getDb();
  const row = db.prepare(`SELECT id, user_id, code_hash, attempts, expires_at, consumed_at FROM login_challenges WHERE id = ?`).get(challengeId) as
    | ChallengeRow
    | undefined;
  if (!row || row.consumed_at || row.expires_at <= new Date().toISOString() || row.attempts >= MAX_ATTEMPTS) throw expired;
  const user = db.prepare(`SELECT id, email, role FROM users WHERE id = ?`).get(row.user_id) as { id: string; email: string; role: string } | undefined;
  if (!user || user.role !== "admin") throw expired;
  const expected = Buffer.from(row.code_hash, "hex");
  const given = Buffer.from(codeHash(row.id, /^\d{6}$/.test(code) ? code : "x"), "hex");
  if (!/^\d{6}$/.test(code) || !timingSafeEqual(expected, given)) {
    const attempts = row.attempts + 1;
    db.prepare(`UPDATE login_challenges SET attempts = ?, consumed_at = CASE WHEN ? >= ? THEN ? ELSE consumed_at END WHERE id = ?`).run(
      attempts,
      attempts,
      MAX_ATTEMPTS,
      new Date().toISOString(),
      row.id,
    );
    audit({ id: user.id, email: user.email }, "admin.2fa_fallido", { type: "usuario", id: user.id }, { intento: attempts }, ip);
    const left = MAX_ATTEMPTS - attempts;
    if (left <= 0) throw new AppError("Código incorrecto. Se agotaron los 5 intentos: ingresa de nuevo con tu contraseña.", 401, "codigo_bloqueado");
    throw new AppError(`Código incorrecto. Te ${left === 1 ? "queda 1 intento" : `quedan ${left} intentos`}.`, 401, "codigo_incorrecto");
  }
  db.prepare(`UPDATE login_challenges SET consumed_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id);
  const token = createSession(user.id, { mfa: true });
  audit({ id: user.id, email: user.email }, "admin.2fa_ok", { type: "usuario", id: user.id }, null, ip);
  const session = userFromToken(token);
  if (!session) throw expired;
  return { user: session, token };
}

/** Registra este navegador como de confianza por 30 días. Devuelve el token para la cookie httpOnly. */
export function trustDevice(userId: string, ip: string | null, userAgent: string | null): string {
  const token = randomToken();
  const now = new Date();
  getDb()
    .prepare(`INSERT INTO trusted_devices (id, user_id, token_hash, expires_at, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), userId, tokenHash(token), new Date(now.getTime() + TRUST_MS).toISOString(), ip, (userAgent || "").slice(0, 200), now.toISOString());
  audit({ id: userId, email: "" }, "admin.dispositivo_confiable", { type: "usuario", id: userId }, { dias: 30 }, ip);
  return token;
}

/** true si el token de dispositivo de confianza es válido para esa cuenta. */
export function isTrustedDevice(userId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`DELETE FROM trusted_devices WHERE expires_at <= ?`).run(now);
  const row = db.prepare(`SELECT id FROM trusted_devices WHERE token_hash = ? AND user_id = ? AND expires_at > ?`).get(tokenHash(token), userId, now) as
    | { id: string }
    | undefined;
  if (!row) return false;
  db.prepare(`UPDATE trusted_devices SET last_used_at = ? WHERE id = ?`).run(now, row.id);
  return true;
}

export function challengeCookieOptions(secure: boolean) {
  return { httpOnly: true as const, sameSite: "strict" as const, secure, path: "/api/auth", maxAge: Math.floor(CODE_TTL_MS / 1000) };
}

export function trustCookieOptions(secure: boolean) {
  return { httpOnly: true as const, sameSite: "strict" as const, secure, path: "/api/auth", maxAge: Math.floor(TRUST_MS / 1000) };
}
