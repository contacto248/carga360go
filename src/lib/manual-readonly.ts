import { getDb } from "./db";
import { AppError } from "./errors";
import type { PublicUser } from "./types";

/**
 * Verificación manual del administrador (acceso de solo lectura por 30 días).
 *
 * Estado efectivo "manual_readonly": la cuenta NO está verificada (verification_status = 'pendiente'),
 * pero un administrador la habilitó a mano para VER la plataforma (listados y detalle de cargas y camiones)
 * hasta users.manual_readonly_until. Mientras dure:
 *  - puede ver el marketplace (un transportista no se redirige a /cuenta-en-revision);
 *  - NO puede publicar ni editar cargas o camiones, ofertar, ni adjudicar (tomar) cargas: se bloquea en el servidor
 *    (assertNotManualReadonly en access.ts, offers.ts y listings.ts), no solo en la interfaz.
 * Al vencer, el acceso de solo lectura se pierde solo (la comparación es por fecha) y la cuenta queda pendiente.
 * La aprobación normal (approveCarrier) y el rechazo limpian este estado. Solo un administrador lo otorga o revoca.
 *
 * Se guarda en columnas de users (migración 14 en db.ts) para no tocar el CHECK de verification_status.
 */
export const MANUAL_READONLY_DAYS = 30;
export const MANUAL_READONLY_STATE = "manual_readonly" as const;

export type AccountState = "verificado" | "manual_readonly" | "pendiente" | "rechazado";

export type ManualReadonly = {
  /** true si hoy la cuenta tiene acceso de solo lectura vigente. */
  active: boolean;
  /** Fecha y hora ISO (UTC) en que vence o venció; null si nunca se otorgó o se revocó. */
  until: string | null;
  grantedAt: string | null;
  grantedBy: string | null;
  grantedByEmail: string | null;
  /** Días que quedan (redondeado hacia arriba); 0 si no está activo. */
  daysLeft: number;
  /** true si se otorgó y ya venció sin acreditación completa. */
  expired: boolean;
};

type Row = {
  role: string;
  verification_status: string;
  manual_readonly_until: string | null;
  manual_readonly_at: string | null;
  manual_readonly_by: string | null;
  manual_readonly_by_email: string | null;
};

const DAY_MS = 86_400_000;

/** Regla pura: ¿la solo lectura está vigente? (exportada para pruebas y para toPublicUser). */
export function readonlyActive(
  row: { role?: string | null; verification_status?: string | null; manual_readonly_until?: string | null },
  now = new Date(),
): boolean {
  if (!row.manual_readonly_until) return false;
  if (row.role === "admin") return false;
  // La verificación completa reemplaza la solo lectura.
  if (row.verification_status === "verificado") return false;
  return row.manual_readonly_until > now.toISOString();
}

function rowOf(userId: string): Row | undefined {
  return getDb()
    .prepare(
      `SELECT role, verification_status, manual_readonly_until, manual_readonly_at, manual_readonly_by, manual_readonly_by_email
       FROM users WHERE id = ?`,
    )
    .get(userId) as Row | undefined;
}

export function manualReadonlyOf(userId: string, now = new Date()): ManualReadonly {
  const row = rowOf(userId);
  const none: ManualReadonly = { active: false, until: null, grantedAt: null, grantedBy: null, grantedByEmail: null, daysLeft: 0, expired: false };
  if (!row || !row.manual_readonly_until) return none;
  const active = readonlyActive(row, now);
  const left = Date.parse(row.manual_readonly_until) - now.getTime();
  return {
    active,
    until: row.manual_readonly_until,
    grantedAt: row.manual_readonly_at,
    grantedBy: row.manual_readonly_by,
    grantedByEmail: row.manual_readonly_by_email,
    daysLeft: active ? Math.max(1, Math.ceil(left / DAY_MS)) : 0,
    expired: !active && row.verification_status !== "verificado" && left <= 0,
  };
}

/** true si la cuenta del usuario está hoy en solo lectura (consulta la base, no confía en el objeto de sesión). */
export function isManualReadonly(user: Pick<PublicUser, "id"> | null | undefined, now = new Date()): boolean {
  if (!user) return false;
  const row = rowOf(user.id);
  return Boolean(row && readonlyActive(row, now));
}

/** Estado efectivo de la cuenta, incluido "manual_readonly". */
export function accountStateOf(user: Pick<PublicUser, "id" | "verificationStatus">, now = new Date()): AccountState {
  if (user.verificationStatus === "verificado") return "verificado";
  if (isManualReadonly(user, now)) return MANUAL_READONLY_STATE;
  return user.verificationStatus === "rechazado" ? "rechazado" : "pendiente";
}

export const READONLY_BLOCK_CODE = "solo_lectura";

/** Bloqueo de servidor: con solo lectura vigente no se publica, edita, oferta ni adjudica. */
export function assertNotManualReadonly(user: Pick<PublicUser, "id"> | null | undefined, action: string, now = new Date()) {
  if (!user) return;
  const row = rowOf(user.id);
  if (!row || !readonlyActive(row, now)) return;
  const until = new Date(row.manual_readonly_until as string).toLocaleDateString("es-CL", { timeZone: "America/Santiago" });
  throw new AppError(
    `Tu cuenta tiene acceso de solo lectura hasta el ${until} (verificación manual del administrador). Puedes ver la plataforma, pero para ${action} debes completar tu acreditación.`,
    403,
    READONLY_BLOCK_CODE,
  );
}

/** El administrador otorga 30 días de solo lectura a una cuenta no verificada. Devuelve la fecha de vencimiento. */
export function grantManualReadonly(admin: Pick<PublicUser, "id" | "email" | "role">, userId: string, now = new Date()): string {
  if (admin.role !== "admin") throw new AppError("Solo un administrador puede otorgar la verificación manual.", 403);
  const row = rowOf(userId);
  if (!row) throw new AppError("Usuario no encontrado.", 404);
  if (row.role === "admin") throw new AppError("La cuenta administradora no necesita verificación manual.");
  if (row.verification_status === "verificado") {
    throw new AppError("La cuenta ya está verificada por completo: no necesita acceso de solo lectura.");
  }
  const until = new Date(now.getTime() + MANUAL_READONLY_DAYS * DAY_MS).toISOString();
  getDb()
    .prepare(
      `UPDATE users SET verification_status = 'pendiente', manual_readonly_until = ?, manual_readonly_at = ?,
         manual_readonly_by = ?, manual_readonly_by_email = ? WHERE id = ?`,
    )
    .run(until, now.toISOString(), admin.id, admin.email, userId);
  return until;
}

/** El administrador revoca la solo lectura antes de tiempo. Devuelve true si había una vigente. */
export function revokeManualReadonly(admin: Pick<PublicUser, "role">, userId: string, now = new Date()): boolean {
  if (admin.role !== "admin") throw new AppError("Solo un administrador puede revocar la verificación manual.", 403);
  const row = rowOf(userId);
  if (!row) throw new AppError("Usuario no encontrado.", 404);
  const wasActive = readonlyActive(row, now);
  clearManualReadonly(userId);
  return wasActive;
}

/** Limpia las columnas (al aprobar, rechazar, revocar o al vencer). */
export function clearManualReadonly(userId: string) {
  getDb()
    .prepare(
      `UPDATE users SET manual_readonly_until = NULL, manual_readonly_at = NULL, manual_readonly_by = NULL, manual_readonly_by_email = NULL
       WHERE id = ?`,
    )
    .run(userId);
}

/**
 * Limpieza de vencidas (opcional: el bloqueo ya funciona por fecha). Devuelve los ids que vencieron para auditarlos.
 * La cuenta queda 'pendiente' (nunca dejó de estarlo) y sin solo lectura.
 */
export function expireManualReadonly(now = new Date()): string[] {
  const rows = getDb()
    .prepare(
      `SELECT id FROM users WHERE manual_readonly_until IS NOT NULL AND manual_readonly_until <= ? AND verification_status <> 'verificado'`,
    )
    .all(now.toISOString()) as { id: string }[];
  for (const row of rows) clearManualReadonly(row.id);
  return rows.map((row) => row.id);
}
