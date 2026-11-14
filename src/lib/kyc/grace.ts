/**
 * Plazo de gracia de 15 días para cuentas que ya estaban acreditadas
 * cuando se enciende KYC_FEATURE_ENABLED. Durante ese plazo siguen
 * pudiendo publicar y ofertar; después, si no verificaron teléfono e
 * identidad, la cuenta pasa a "pendiente".
 *
 * Los correos de recordatorio se redactan aquí pero NO se envían
 * (no hay cron ni llamada a SMTP). Ver draftKycGraceReminder().
 */
import { getDb } from "../db";
import { formatDateCL, todayChile } from "../format";
import { kycEnabled, KYC_GRACE_DAYS } from "./config";
import { ensureKycSchema } from "./schema";
import { kycOf } from "./service";

export type KycGrace = {
  userId: string;
  startedAt: string;
  endsAt: string;
  expiredAt: string | null;
  daysLeft: number;
  active: boolean;
};

type Row = { user_id: string; started_at: string; ends_at: string; expired_at: string | null };

function nowIso(now = new Date()) {
  return now.toISOString();
}

function daysLeft(endsAt: string, now = new Date()): number {
  const ms = Date.parse(endsAt) - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

function fromRow(row: Row, now = new Date()): KycGrace {
  const expired = Boolean(row.expired_at) || Date.parse(row.ends_at) <= now.getTime();
  return {
    userId: row.user_id,
    startedAt: row.started_at,
    endsAt: row.ends_at,
    expiredAt: row.expired_at,
    daysLeft: expired ? 0 : daysLeft(row.ends_at, now),
    active: !expired,
  };
}

function endsAtFrom(start: Date): string {
  return new Date(start.getTime() + KYC_GRACE_DAYS * 86_400_000).toISOString();
}

/**
 * Incluye, una sola vez por persona, a quienes ya estaban acreditados
 * (verification_status = verificado, no administradores) y aún no tienen fila.
 * Se llama al aplicar la migración v2 y puede llamarse en pruebas después de
 * crear esas cuentas si el esquema ya existía.
 */
export function snapshotAccreditedForGrace(now = new Date()): number {
  if (!kycEnabled()) return 0;
  ensureKycSchema();
  const db = getDb();
  const stamp = nowIso(now);
  const ends = endsAtFrom(now);
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO kyc_grace (user_id, started_at, ends_at, expired_at, created_at)
       SELECT id, ?, ?, NULL, ?
       FROM users
       WHERE verification_status = 'verificado' AND role != 'admin'`,
    )
    .run(stamp, ends, stamp);
  return result.changes;
}

function expireIfDue(row: Row, now = new Date()): Row {
  if (row.expired_at || Date.parse(row.ends_at) > now.getTime()) return row;
  const stamp = nowIso(now);
  const db = getDb();
  const identity = kycOf(row.user_id);
  const user = db
    .prepare(`SELECT phone_verified_at, verification_status FROM users WHERE id = ?`)
    .get(row.user_id) as { phone_verified_at: string | null; verification_status: string } | undefined;
  const stillMissing = !user?.phone_verified_at || identity.status !== "aprobado";
  db.transaction(() => {
    db.prepare(`UPDATE kyc_grace SET expired_at = ? WHERE user_id = ? AND expired_at IS NULL`).run(stamp, row.user_id);
    if (stillMissing && user?.verification_status === "verificado") {
      db.prepare(`UPDATE users SET verification_status = 'pendiente' WHERE id = ? AND verification_status = 'verificado'`).run(row.user_id);
    }
  })();
  return { ...row, expired_at: stamp };
}

export function graceOf(userId: string, now = new Date()): KycGrace | null {
  if (!kycEnabled()) return null;
  ensureKycSchema();
  const row = getDb().prepare(`SELECT * FROM kyc_grace WHERE user_id = ?`).get(userId) as Row | undefined;
  if (!row) return null;
  return fromRow(expireIfDue(row, now), now);
}

/** Expira los plazos vencidos (también se hace al consultar graceOf). */
export function expireDueKycGraces(now = new Date()): number {
  if (!kycEnabled()) return 0;
  ensureKycSchema();
  const rows = getDb()
    .prepare(`SELECT * FROM kyc_grace WHERE expired_at IS NULL AND ends_at <= ?`)
    .all(nowIso(now)) as Row[];
  for (const row of rows) expireIfDue(row, now);
  return rows.length;
}

export type GraceReminderKind = "inicio" | "mitad" | "ultimo";

export type GraceReminderDraft = {
  kind: GraceReminderKind;
  to: string;
  subject: string;
  text: string;
};

function endLabel(endsAt: string): string {
  // Fecha de término en Chile, a partir del instante UTC guardado.
  return formatDateCL(todayChile(new Date(endsAt)));
}

/**
 * Redacta un correo de recordatorio. No lo envía ni lo guarda en el buzón de salida.
 */
export function draftKycGraceReminder(
  user: { email: string; contactName: string },
  grace: KycGrace,
  kind: GraceReminderKind,
): GraceReminderDraft {
  const until = endLabel(grace.endsAt);
  const days = kind === "inicio" ? KYC_GRACE_DAYS : grace.daysLeft;
  const subject =
    kind === "ultimo"
      ? "Últimos días para verificar tu cuenta en Carga360go"
      : kind === "mitad"
        ? "Recuerda verificar tu teléfono y tu identidad en Carga360go"
        : "Tienes 15 días para verificar tu cuenta en Carga360go";
  const lead =
    kind === "ultimo"
      ? `Quedan ${days} ${days === 1 ? "día" : "días"} (hasta el ${until}) para completar la verificación de tu teléfono y tu identidad.`
      : kind === "mitad"
        ? `Ya pasó la mitad del plazo: te quedan ${days} ${days === 1 ? "día" : "días"} (hasta el ${until}) para verificar tu teléfono y tu identidad.`
        : `Tu cuenta sigue activa durante ${KYC_GRACE_DAYS} días (hasta el ${until}) para que verifiques tu teléfono y tu identidad con cédula y reconocimiento facial.`;
  const text = [
    `Hola ${user.contactName},`,
    "",
    lead,
    "",
    "Carga360go ahora pide a todas las cuentas (mandantes y transportistas) confirmar el teléfono por WhatsApp y verificar la identidad con la cédula chilena y una selfie. Como tu cuenta ya estaba acreditada, no pierdes el acceso de inmediato.",
    "",
    "Si no lo completas antes de esa fecha, tu cuenta pasará a revisión y no podrás publicar, ofertar ni recibir contactos hasta terminar la verificación.",
    "",
    "Entra a https://www.carga360go.cl/verificar-identidad y sigue los dos pasos.",
    "",
    "Si tienes dudas, escríbenos a contacto@carga360go.cl.",
    "",
    "Carga360go",
  ].join("\n");
  return { kind, to: user.email, subject, text };
}

/** Qué recordatorio correspondería ahora, según los días que quedan (no envía nada). */
export function graceReminderKindDue(grace: KycGrace): GraceReminderKind | null {
  if (!grace.active) return null;
  if (grace.daysLeft <= 2) return "ultimo";
  if (grace.daysLeft <= 8) return "mitad";
  return "inicio";
}
