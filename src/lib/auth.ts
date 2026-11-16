import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { audit } from "./audit";
import { freeUntilFrom } from "./campaign";
import { assertStrongPassword } from "./security";
import { parseBackupContact } from "./backup-contact";
import { readonlyActive } from "./manual-readonly";
import { CITIES } from "./catalog";
import { getDb } from "./db";
import { AppError } from "./errors";
import { formatRut, isValidEmail, isValidRut, normalizeWhatsapp, rutBody } from "./format";
import { appUrl, sendPasswordResetEmail } from "./mail";
import type { PublicUser, Role, VerificationStatus } from "./types";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const RESET_MS = 60 * 60 * 1000;
const LOCK_AFTER = 8;
const LOCK_MS = 15 * 60 * 1000;

export const COOKIE_NAME = "c360_session";

const DUMMY_HASH = hashPassword("dummy-password-not-used");

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  razon_social: string;
  rut: string;
  rut_norm: string;
  contact_name: string;
  whatsapp: string;
  city: string;
  verification_status: VerificationStatus;
  verification_note: string | null;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  login_failures: number;
  locked_until: string | null;
  created_at: string;
  free_until?: string | null;
  manual_readonly_until?: string | null;
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  const actual = scryptSync(password, salt, expected.length, { N: n, r, p, maxmem: 64 * 1024 * 1024 });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    razonSocial: row.razon_social,
    rut: row.rut,
    contactName: row.contact_name,
    whatsapp: row.whatsapp,
    city: row.city,
    verificationStatus: row.verification_status,
    verificationNote: row.verification_note,
    emailVerifiedAt: row.email_verified_at ?? null,
    phoneVerifiedAt: row.phone_verified_at ?? null,
    verifiedAt: row.verified_at ?? null,
    createdAt: row.created_at,
    freeUntil: row.role === "admin" ? null : (row.free_until ?? freeUntilFrom(row.created_at)),
    manualReadonlyUntil: readonlyActive(row) ? (row.manual_readonly_until ?? null) : null,
  };
}

function findByEmail(email: string): UserRow | undefined {
  return getDb().prepare(`SELECT * FROM users WHERE email = ?`).get(email) as UserRow | undefined;
}

function findById(id: string): UserRow | undefined {
  return getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
}

export type RegisterInput = {
  role: string;
  razonSocial: string;
  rut: string;
  contactName: string;
  email: string;
  password: string;
  whatsapp: string;
  city: string;
  /** Versión de la Política de Privacidad aceptada (las rutas de registro la exigen). */
  privacyVersion?: string | null;
  termsVersion?: string | null;
  /** Teléfono chileno o correo de respaldo, distinto del principal (ver backup-contact.ts). */
  backupContact?: string | null;
  /** La web exige el contacto de respaldo al registrarse; la API móvil lo deja opcional (lo pide después). */
  requireBackupContact?: boolean;
};

function cleanRegister(input: RegisterInput, allowAdmin: boolean): Omit<RegisterInput, "role"> & { role: Role } {
  const role = input.role;
  if (role !== "transportista" && role !== "mandante" && !(allowAdmin && role === "admin")) {
    throw new AppError("Elige transportista o mandante.");
  }
  const razonSocial = input.razonSocial.trim();
  const contactName = input.contactName.trim();
  const email = input.email.trim().toLowerCase();
  const city = input.city.trim();
  if (razonSocial.length < 2 || razonSocial.length > 160) {
    throw new AppError("Indica la razón social o el nombre.");
  }
  if (contactName.length < 2 || contactName.length > 120) {
    throw new AppError("Indica el nombre de contacto.");
  }
  if (!isValidRut(input.rut)) throw new AppError("El RUT no es válido (revisa el dígito verificador).");
  if (!isValidEmail(email)) throw new AppError("Correo inválido.");
  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!whatsapp) throw new AppError("El WhatsApp debe ser un celular chileno: +56 9 XXXX XXXX.");
  if (!CITIES.some((item) => item.name === city)) throw new AppError("Elige una ciudad de la lista.");
  assertStrongPassword(input.password, email);
  return {
    role: role as Role,
    razonSocial,
    rut: formatRut(input.rut),
    contactName,
    email,
    password: input.password,
    whatsapp,
    city,
  };
}

export function registerUser(input: RegisterInput): { user: PublicUser; token: string } {
  const data = cleanRegister(input, false);
  const rawBackup = input.backupContact == null ? "" : String(input.backupContact).trim();
  const backup = rawBackup || input.requireBackupContact ? parseBackupContact(rawBackup, { email: data.email, whatsapp: data.whatsapp }) : null;
  const db = getDb();
  const existing = findByEmail(data.email);
  if (existing && !existing.email_verified_at && existing.role !== "admin") {
    throw new AppError(
      "Este correo ya tiene una cuenta sin confirmar. Te podemos reenviar el correo de verificación; después ingresa y corrige tus datos en \"Mis datos\". Si no recuerdas la contraseña, usa \"Olvidé mi contraseña\".",
      409,
      "email_pendiente",
    );
  }
  if (existing) throw new AppError("Este correo ya está registrado. Ingresa o usa \"Olvidé mi contraseña\".", 409, "email_registrado");
  const rutNorm = rutBody(data.rut);
  const taken = db.prepare(`SELECT id FROM users WHERE rut_norm = ?`).get(rutNorm);
  if (taken) {
    throw new AppError(
      "Este RUT ya está registrado en otra cuenta. Si es tuya, ingresa con ese correo; si el correo quedó mal, escríbenos a contacto@carga360go.cl y lo corregimos.",
      409,
      "rut_registrado",
    );
  }

  const id = randomUUID();
  const token = randomToken();
  const created = nowIso();
  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (
        id, email, password_hash, role, razon_social, rut, rut_norm, contact_name, whatsapp, city,
        verification_status, created_at, privacy_accepted_at, privacy_version, terms_accepted_at, terms_version, free_until,
        backup_contact, backup_contact_type, backup_contact_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      data.email,
      hashPassword(data.password),
      data.role,
      data.razonSocial,
      data.rut,
      rutNorm,
      data.contactName,
      data.whatsapp,
      data.city,
      created,
      input.privacyVersion ? created : null,
      input.privacyVersion || null,
      input.termsVersion ? created : null,
      input.termsVersion || null,
      freeUntilFrom(created),
      backup?.value ?? null,
      backup?.type ?? null,
      backup ? created : null,
    );
    db.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      randomUUID(),
      id,
      tokenHash(token),
      new Date(Date.now() + SESSION_MS).toISOString(),
      created,
    );
  });
  insert();
  const user = findById(id);
  if (!user) throw new AppError("No se pudo crear la cuenta.", 500);
  return { user: toPublicUser(user), token };
}

/**
 * Valida correo y contraseña (con bloqueo por intentos) sin crear sesión. Devuelve la cuenta si la clave es correcta.
 * La cuenta administradora necesita además un código por correo (src/lib/admin-2fa.ts).
 */
export function verifyCredentials(email: string, password: string): PublicUser {
  const normalized = email.trim().toLowerCase();
  const row = findByEmail(normalized);
  const locked = row?.locked_until && row.locked_until > nowIso();
  if (locked) {
    verifyPassword(password, row?.password_hash || DUMMY_HASH);
    throw new AppError("Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.", 429);
  }
  const ok = verifyPassword(password, row?.password_hash || DUMMY_HASH);
  if (!row || !ok) {
    if (row) {
      const failures = row.login_failures + 1;
      if (failures >= LOCK_AFTER) {
        getDb()
          .prepare(`UPDATE users SET login_failures = 0, locked_until = ? WHERE id = ?`)
          .run(new Date(Date.now() + LOCK_MS).toISOString(), row.id);
        audit({ id: row.id, email: row.email }, "usuario.bloqueo_login", { type: "usuario", id: row.id }, `${LOCK_AFTER} intentos fallidos; bloqueo de 15 min`);
      } else {
        getDb().prepare(`UPDATE users SET login_failures = ? WHERE id = ?`).run(failures, row.id);
      }
    }
    throw new AppError("Correo o contraseña incorrectos.", 401);
  }
  getDb().prepare(`UPDATE users SET login_failures = 0, locked_until = NULL WHERE id = ?`).run(row.id);
  return toPublicUser(row);
}

/**
 * Crea una sesión. `mfa` marca que la sesión pasó el segundo factor: las sesiones de administrador sin esa marca
 * no sirven (ver userFromToken), así que ningún otro camino puede abrir una sesión de administrador.
 */
export function createSession(userId: string, opts: { mfa?: boolean } = {}): string {
  const db = getDb();
  const token = randomToken();
  const created = nowIso();
  const save = db.transaction(() => {
    db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(created);
    db.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, mfa_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      randomUUID(),
      userId,
      tokenHash(token),
      new Date(Date.now() + SESSION_MS).toISOString(),
      created,
      opts.mfa ? created : null,
    );
  });
  save();
  return token;
}

export const ADMIN_2FA_REQUIRED = "La cuenta administradora ingresa solo por la web con un código enviado a su correo.";

/** Ingreso con correo y contraseña para cuentas no administradoras (web y app). El administrador usa el flujo con código. */
export function loginUser(email: string, password: string): { user: PublicUser; token: string } {
  const user = verifyCredentials(email, password);
  if (user.role === "admin") throw new AppError(ADMIN_2FA_REQUIRED, 403, "requiere_2fa");
  return { user, token: createSession(user.id) };
}

export function userFromToken(token: string | null | undefined): PublicUser | null {
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.*, s.mfa_at AS session_mfa_at FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash(token), nowIso()) as (UserRow & { session_mfa_at: string | null }) | undefined;
  if (!row) return null;
  // Una sesión de administrador solo vale si pasó el código por correo.
  if (row.role === "admin" && !row.session_mfa_at) return null;
  return toPublicUser(row);
}

export function revokeToken(token: string | null | undefined) {
  if (!token) return;
  getDb().prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash(token));
}

export async function requestPasswordReset(email: string): Promise<{ ok: true; devLink?: string }> {
  const normalized = email.trim().toLowerCase();
  const row = isValidEmail(normalized) ? findByEmail(normalized) : undefined;
  if (!row) return { ok: true };
  const db = getDb();
  const token = randomToken();
  const created = nowIso();
  db.prepare(`DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL`).run(row.id);
  db.prepare(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), row.id, tokenHash(token), new Date(Date.now() + RESET_MS).toISOString(), created);
  const link = `${appUrl()}/restablecer?token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail(row.email, link);
  const expose = process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST;
  return expose ? { ok: true, devLink: link } : { ok: true };
}

export function resetPassword(token: string, password: string) {
  assertStrongPassword(password);
  const db = getDb();
  const row = db
    .prepare(`SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?`)
    .get(tokenHash(token)) as { id: string; user_id: string; expires_at: string; used_at: string | null } | undefined;
  if (!row || row.used_at || row.expires_at <= nowIso()) {
    throw new AppError("El enlace no es válido o ya venció.", 400);
  }
  const apply = db.transaction(() => {
    db.prepare(`UPDATE users SET password_hash = ?, login_failures = 0, locked_until = NULL WHERE id = ?`).run(
      hashPassword(password),
      row.user_id,
    );
    db.prepare(`UPDATE password_resets SET used_at = ? WHERE id = ?`).run(nowIso(), row.id);
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(row.user_id);
    db.prepare(`DELETE FROM trusted_devices WHERE user_id = ?`).run(row.user_id);
  });
  apply();
  audit({ id: row.user_id, email: "" }, "usuario.clave_restablecida", { type: "usuario", id: row.user_id });
}

export type AdminInput = {
  email: string;
  password: string;
  razonSocial: string;
  rut: string;
  contactName: string;
  whatsapp: string;
  city: string;
};

export function upsertAdmin(input: AdminInput): PublicUser {
  const data = cleanRegister({ ...input, role: "admin" }, true);
  const db = getDb();
  const existing = findByEmail(data.email);
  if (existing && existing.role !== "admin") {
    throw new AppError("Ese correo ya pertenece a una cuenta que no es administradora.");
  }
  const rutNorm = rutBody(data.rut);
  const rutOwner = db.prepare(`SELECT id, email FROM users WHERE rut_norm = ?`).get(rutNorm) as
    | { id: string; email: string }
    | undefined;
  if (rutOwner && rutOwner.email !== data.email) throw new AppError("Ese RUT ya está usado por otra cuenta.");
  const created = nowIso();
  if (!existing) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO users (
        id, email, password_hash, role, razon_social, rut, rut_norm, contact_name, whatsapp, city,
        verification_status, created_at
      ) VALUES (?, ?, ?, 'admin', ?, ?, ?, ?, ?, ?, 'verificado', ?)`,
    ).run(
      id,
      data.email,
      hashPassword(data.password),
      data.razonSocial,
      data.rut,
      rutNorm,
      data.contactName,
      data.whatsapp,
      data.city,
      created,
    );
    const user = findById(id);
    if (!user) throw new AppError("No se pudo crear el administrador.", 500);
    return toPublicUser(user);
  }
  db.prepare(
    `UPDATE users SET password_hash = ?, razon_social = ?, rut = ?, rut_norm = ?, contact_name = ?, whatsapp = ?, city = ?,
      verification_status = 'verificado', login_failures = 0, locked_until = NULL WHERE id = ?`,
  ).run(hashPassword(data.password), data.razonSocial, data.rut, rutNorm, data.contactName, data.whatsapp, data.city, existing.id);
  const user = findById(existing.id);
  if (!user) throw new AppError("No se pudo actualizar el administrador.", 500);
  return toPublicUser(user);
}

export type ProfileInput = Partial<{
  email: string;
  rut: string;
  razonSocial: string;
  contactName: string;
  whatsapp: string;
  city: string;
}>;

export function profileFromBody(body: Record<string, unknown>): ProfileInput {
  const out: ProfileInput = {};
  for (const key of ["email", "rut", "razonSocial", "contactName", "whatsapp", "city"] as const) {
    if (body[key] !== undefined && body[key] !== null) out[key] = String(body[key]);
  }
  return out;
}

/**
 * Corrige los datos de una cuenta. El propio usuario puede cambiar todo; si cambia el correo, vuelve a quedar
 * sin verificar (y hay que confirmarlo de nuevo), y si cambia el WhatsApp, el teléfono vuelve a quedar sin verificar.
 * El RUT solo lo cambia el usuario mientras su cuenta no esté verificada; después, solo un administrador.
 */
export function updateProfile(
  userId: string,
  input: ProfileInput,
  actor: "self" | "admin",
): { user: PublicUser; emailChanged: boolean } {
  const row = findById(userId);
  if (!row) throw new AppError("Usuario no encontrado.", 404);
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];
  let emailChanged = false;

  if (input.razonSocial !== undefined) {
    const value = input.razonSocial.trim();
    if (value.length < 2 || value.length > 160) throw new AppError("Indica la razón social o el nombre.");
    sets.push("razon_social = ?");
    values.push(value);
  }
  if (input.contactName !== undefined) {
    const value = input.contactName.trim();
    if (value.length < 2 || value.length > 120) throw new AppError("Indica el nombre de contacto.");
    sets.push("contact_name = ?");
    values.push(value);
  }
  if (input.city !== undefined) {
    const value = input.city.trim();
    if (!CITIES.some((item) => item.name === value)) throw new AppError("Elige una ciudad de la lista.");
    sets.push("city = ?");
    values.push(value);
  }
  if (input.whatsapp !== undefined) {
    const value = normalizeWhatsapp(input.whatsapp);
    if (!value) throw new AppError("El WhatsApp debe ser un celular chileno: +56 9 XXXX XXXX.");
    if (value !== row.whatsapp) {
      sets.push("whatsapp = ?", "phone_verified_at = NULL");
      values.push(value);
    }
  }
  if (input.rut !== undefined && rutBody(input.rut) !== row.rut_norm) {
    if (actor === "self" && row.verification_status === "verificado") {
      throw new AppError("Tu cuenta ya está verificada: para cambiar el RUT escríbenos a contacto@carga360go.cl.", 403);
    }
    if (!isValidRut(input.rut)) throw new AppError("El RUT no es válido (revisa el dígito verificador).");
    const rutNorm = rutBody(input.rut);
    const owner = db.prepare(`SELECT id FROM users WHERE rut_norm = ? AND id <> ?`).get(rutNorm, userId);
    if (owner) throw new AppError("Ese RUT ya está registrado en otra cuenta.", 409, "rut_registrado");
    sets.push("rut = ?", "rut_norm = ?");
    values.push(formatRut(input.rut), rutNorm);
  }
  if (input.email !== undefined) {
    const value = input.email.trim().toLowerCase();
    if (value !== row.email) {
      if (!isValidEmail(value)) throw new AppError("Correo inválido.");
      if (findByEmail(value)) throw new AppError("Ese correo ya está registrado en otra cuenta.", 409, "email_registrado");
      sets.push("email = ?", "email_verified_at = NULL");
      values.push(value);
      emailChanged = true;
    }
  }
  if (sets.length > 0) {
    db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...values, userId);
  }
  const updated = findById(userId);
  if (!updated) throw new AppError("Usuario no encontrado.", 404);
  return { user: toPublicUser(updated), emailChanged };
}

/**
 * El administrador borra un registro que quedó mal o pegado (nunca una cuenta administradora ni una ya verificada).
 */
export function adminDeleteUser(userId: string): { storedPaths: string[] } {
  const row = findById(userId);
  if (!row) throw new AppError("Usuario no encontrado.", 404);
  if (row.role === "admin") throw new AppError("La cuenta administradora no se puede eliminar.", 403);
  if (row.verification_status === "verificado") {
    throw new AppError("Solo se pueden eliminar cuentas pendientes o rechazadas. Primero cámbiala a pendiente.", 403);
  }
  return deleteOwnAccount(userId);
}

export function listUsers(): PublicUser[] {
  const rows = getDb().prepare(`SELECT * FROM users ORDER BY created_at DESC`).all() as UserRow[];
  return rows.map(toPublicUser);
}

export function setUserVerification(id: string, status: VerificationStatus, note: string | null): PublicUser {
  const row = findById(id);
  if (!row) throw new AppError("Usuario no encontrado.", 404);
  if (row.role === "admin" && status !== "verificado") {
    throw new AppError("La cuenta administradora se mantiene verificada.");
  }
  const clean = note?.trim() || null;
  if (status === "rechazado" && !clean) throw new AppError("Indica el motivo del rechazo.");
  if (clean && clean.length > 500) throw new AppError("El motivo es demasiado largo.");
  getDb()
    .prepare(`UPDATE users SET verification_status = ?, verification_note = ? WHERE id = ?`)
    .run(status, clean, id);
  const updated = findById(id);
  if (!updated) throw new AppError("Usuario no encontrado.", 404);
  return toPublicUser(updated);
}

/** Secure en prod (o COOKIE_SECURE=true). COOKIE_SECURE=false fuerza off (tests/local HTTP). */
export function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false");
}

export function cookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
    maxAge: Math.floor(SESSION_MS / 1000),
  };
}

export const SESSION_TTL_MS = SESSION_MS;

/** Fecha de vencimiento (ISO) de una sesión vigente, o null. */
export function sessionExpiresAt(token: string | null | undefined): string | null {
  if (!token) return null;
  const row = getDb()
    .prepare(`SELECT expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?`)
    .get(tokenHash(token), nowIso()) as { expires_at: string } | undefined;
  return row?.expires_at ?? null;
}

/**
 * Elimina la cuenta del propio usuario: sesiones, publicaciones, documentos, alertas y códigos
 * se borran en cascada. Los archivos subidos se borran aparte. La cuenta administradora no se borra así.
 */
export function deleteOwnAccount(userId: string): { storedPaths: string[] } {
  const row = findById(userId);
  if (!row) throw new AppError("Usuario no encontrado.", 404);
  if (row.role === "admin") throw new AppError("La cuenta administradora no se puede eliminar desde la app.", 403);
  const db = getDb();
  const paths = (db.prepare(`SELECT stored_path FROM documents WHERE user_id = ? AND stored_path IS NOT NULL`).all(userId) as {
    stored_path: string;
  }[]).map((item) => item.stored_path);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
  return { storedPaths: paths };
}
