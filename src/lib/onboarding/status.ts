import { REQUIRED_CARRIER_DOCS, type ChecklistDoc } from "../carrier";
import { addDaysIso, FREE_DAYS } from "../campaign";
import { getDb } from "../db";
import { todayChile } from "../format";
import { phoneChannelReady } from "../notify";
import { roleLabel } from "../roles";
import type { Role } from "../types";
import { docsDeadlineDays } from "./config";

export type OnboardingDocProgress = {
  uploaded: number;
  total: number;
  items: ChecklistDoc[];
};

export type OnboardingStatus = {
  userId: string;
  role: Role;
  roleLabel: string;
  contactName: string;
  email: string;
  whatsapp: string;
  createdAt: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  /** Si es false, no se menciona el teléfono en los correos (la verificación no está disponible). */
  phoneFeatureOn: boolean;
  docs: OnboardingDocProgress;
  /** YYYY-MM-DD en calendario de Chile, o null si no hay plazo configurado. */
  docsDeadline: string | null;
  freeDays: number;
  pending: OnboardingPendingItem[];
  complete: boolean;
};

export type OnboardingPendingItem = "email" | "phone" | "documents";

type UserRow = {
  id: string;
  email: string;
  role: Role;
  contact_name: string;
  whatsapp: string;
  created_at: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
};

function docsForRole(userId: string, role: Role, now = new Date()): OnboardingDocProgress {
  if (role !== "transportista") return { uploaded: 0, total: 0, items: [] };
  const rows = getDb()
    .prepare(`SELECT type, verification_status, expiry FROM documents WHERE user_id = ?`)
    .all(userId) as { type: string; verification_status: string; expiry: string | null }[];
  const today = todayChile(now);
  const items: ChecklistDoc[] = REQUIRED_CARRIER_DOCS.map((type) => {
    let status: ChecklistDoc["status"] = "falta";
    const rank: Record<string, number> = { verificado: 4, pendiente: 3, vencido: 2, rechazado: 1 };
    for (const row of rows) {
      if (row.type !== type) continue;
      const current: ChecklistDoc["status"] =
        row.verification_status === "verificado" && row.expiry && row.expiry < today ? "vencido" : (row.verification_status as ChecklistDoc["status"]);
      if (status === "falta" || rank[current] > rank[status]) status = current;
    }
    return { type, label: type, status };
  });
  // "Cargado" = hay un archivo en revisión o aprobado y vigente. Rechazado o vencido no cuenta.
  const uploaded = items.filter((item) => item.status === "pendiente" || item.status === "verificado").length;
  return { uploaded, total: items.length, items };
}

export function onboardingStatusOf(userId: string, now = new Date()): OnboardingStatus | null {
  const row = getDb()
    .prepare(
      `SELECT id, email, role, contact_name, whatsapp, created_at, email_verified_at, phone_verified_at FROM users WHERE id = ?`,
    )
    .get(userId) as UserRow | undefined;
  if (!row || row.role === "admin") return null;
  const phoneFeatureOn = phoneChannelReady();
  const docs = docsForRole(row.id, row.role, now);
  const deadlineDays = docsDeadlineDays();
  const createdDay = todayChile(new Date(row.created_at));
  const docsDeadline = deadlineDays && docs.total > 0 ? addDaysIso(createdDay, deadlineDays) : null;
  const pending: OnboardingPendingItem[] = [];
  if (!row.email_verified_at) pending.push("email");
  if (phoneFeatureOn && !row.phone_verified_at) pending.push("phone");
  if (docs.total > 0 && docs.uploaded < docs.total) pending.push("documents");
  return {
    userId: row.id,
    role: row.role,
    roleLabel: roleLabel(row.role).toLowerCase(),
    contactName: row.contact_name,
    email: row.email,
    whatsapp: row.whatsapp,
    createdAt: row.created_at,
    emailVerified: Boolean(row.email_verified_at),
    phoneVerified: Boolean(row.phone_verified_at),
    phoneFeatureOn,
    docs,
    docsDeadline,
    freeDays: FREE_DAYS,
    pending,
    complete: pending.length === 0,
  };
}
