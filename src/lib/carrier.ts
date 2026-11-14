import { docTypeLabel } from "./catalog";
import { getDb } from "./db";
import { AppError } from "./errors";
import { todayChile } from "./format";
import { readonlyActive } from "./manual-readonly";
import type { PublicUser, VerificationStatus } from "./types";

/** Documentos mínimos que debe tener aprobados un transportista para desbloquear la plataforma. */
export const REQUIRED_CARRIER_DOCS = ["cedula", "licencia", "padron", "revision", "soap", "permiso"] as const;

export type ChecklistDoc = { type: string; label: string; status: "falta" | "vencido" | VerificationStatus };

export type CarrierChecklist = {
  emailVerified: boolean;
  phoneVerified: boolean;
  docs: ChecklistDoc[];
  docsReady: boolean;
  ready: boolean;
};

/**
 * true si la cuenta es de transportista y aún no ha sido aprobada por un administrador.
 * Con verificación manual vigente (solo lectura por 30 días) no se bloquea la VISTA del marketplace;
 * publicar, ofertar y adjudicar siguen bloqueados en el servidor (assertNotManualReadonly / assertAccredited).
 */
export function isCarrierLocked(user: PublicUser | null | undefined): boolean {
  if (!user || user.role !== "transportista" || user.verificationStatus === "verificado") return false;
  return !hasReadonlyAccess(user.id);
}

/** Consulta la base: el objeto de sesión podría venir de antes de que el administrador revocara o venciera la solo lectura. */
function hasReadonlyAccess(userId: string): boolean {
  const row = getDb()
    .prepare(`SELECT role, verification_status, manual_readonly_until FROM users WHERE id = ?`)
    .get(userId) as { role: string; verification_status: string; manual_readonly_until: string | null } | undefined;
  return Boolean(row && readonlyActive(row));
}

export function carrierChecklist(userId: string): CarrierChecklist {
  const db = getDb();
  const user = db.prepare(`SELECT email_verified_at, phone_verified_at FROM users WHERE id = ?`).get(userId) as
    | { email_verified_at: string | null; phone_verified_at: string | null }
    | undefined;
  const rows = db.prepare(`SELECT type, verification_status, expiry FROM documents WHERE user_id = ?`).all(userId) as {
    type: string;
    verification_status: VerificationStatus;
    expiry: string | null;
  }[];
  const today = todayChile();
  const rank: Record<string, number> = { verificado: 4, pendiente: 3, vencido: 2, rechazado: 1 };
  const docs: ChecklistDoc[] = REQUIRED_CARRIER_DOCS.map((type) => {
    let best: ChecklistDoc["status"] = "falta";
    for (const row of rows) {
      if (row.type !== type) continue;
      // Un documento aprobado pero vencido ya no cuenta para la acreditación.
      const status: ChecklistDoc["status"] =
        row.verification_status === "verificado" && row.expiry && row.expiry < today ? "vencido" : row.verification_status;
      if (best === "falta" || rank[status] > rank[best]) best = status;
    }
    return { type, label: docTypeLabel(type), status: best };
  });
  const emailVerified = Boolean(user?.email_verified_at);
  const phoneVerified = Boolean(user?.phone_verified_at);
  const docsReady = docs.every((doc) => doc.status === "verificado");
  return { emailVerified, phoneVerified, docs, docsReady, ready: emailVerified && phoneVerified && docsReady };
}

function carrierRow(id: string) {
  const row = getDb().prepare(`SELECT id, role FROM users WHERE id = ?`).get(id) as { id: string; role: string } | undefined;
  if (!row) throw new AppError("Usuario no encontrado.", 404);
  return row;
}

export function rejectCarrier(adminId: string, userId: string, note: string | null) {
  const row = carrierRow(userId);
  if (row.role === "admin") throw new AppError("La cuenta administradora se mantiene verificada.");
  const clean = note?.trim() || null;
  if (!clean) throw new AppError("Indica el motivo del rechazo.");
  if (clean.length > 500) throw new AppError("El motivo es demasiado largo.");
  getDb()
    .prepare(
      `UPDATE users SET verification_status = 'rechazado', verification_note = ?, verified_at = NULL, verified_by = ?,
         manual_readonly_until = NULL, manual_readonly_at = NULL, manual_readonly_by = NULL, manual_readonly_by_email = NULL
       WHERE id = ?`,
    )
    .run(clean, adminId, userId);
}

export function markContactVerified(userId: string, channel: "email" | "phone", verified: boolean) {
  carrierRow(userId);
  const column = channel === "email" ? "email_verified_at" : "phone_verified_at";
  getDb()
    .prepare(`UPDATE users SET ${column} = ? WHERE id = ?`)
    .run(verified ? new Date().toISOString() : null, userId);
}

/** Si un transportista rechazado sube un documento nuevo, su cuenta vuelve a revisión. */
export function reopenAfterUpload(user: PublicUser) {
  if (user.role === "transportista" && user.verificationStatus === "rechazado") {
    getDb().prepare(`UPDATE users SET verification_status = 'pendiente' WHERE id = ?`).run(user.id);
  }
}
