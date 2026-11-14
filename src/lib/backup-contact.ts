import { carrierChecklist } from "./carrier";
import { getDb } from "./db";
import { AppError } from "./errors";
import { formatWhatsappDisplay, isValidEmail, normalizeWhatsapp } from "./format";
import { kycEnabled } from "./kyc/config";

/**
 * Contacto de respaldo (teléfono o correo) para cuentas cuya verificación está pendiente.
 * Sirve para ubicar a la persona si no termina de inscribirse (correo o teléfono sin confirmar, o documentos
 * sin aprobar). Se pide al registrarse y, mientras falte algo de la verificación, en el panel y en /cuenta-en-revision.
 * Es privado: solo lo ven el propio usuario y los administradores (no forma parte de PublicUser).
 */
export type BackupContactType = "email" | "telefono";

export type BackupContact = { value: string; type: BackupContactType; display: string; updatedAt: string | null };

/**
 * Teléfono chileno: celular +56 9 XXXX XXXX o fijo +56 + 9 dígitos que empiezan en 2 a 8 (p. ej. +56 2 2345 6789).
 * Acepta el número con o sin +56. Devuelve solo dígitos con 56 adelante, o null.
 */
export function normalizeChilePhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `56${digits}`;
  const mobile = normalizeWhatsapp(digits);
  if (mobile) return mobile;
  return /^56[2-8]\d{8}$/.test(digits) ? digits : null;
}

export function formatBackupContact(value: string, type: BackupContactType): string {
  if (type === "email") return value;
  if (/^569\d{8}$/.test(value)) return formatWhatsappDisplay(value);
  return `+56 ${value.slice(2, 3)} ${value.slice(3, 7)} ${value.slice(7)}`;
}

/** Valida y normaliza. Debe ser distinto del correo y del WhatsApp principales de la cuenta. */
export function parseBackupContact(raw: unknown, primary: { email: string; whatsapp: string }): { value: string; type: BackupContactType } {
  const text = String(raw ?? "").trim();
  if (!text) throw new AppError("Indica un teléfono o correo de respaldo.", 400, "respaldo_requerido");
  if (text.length > 160) throw new AppError("El contacto de respaldo es demasiado largo.", 400, "respaldo_invalido");
  if (text.includes("@")) {
    const email = text.toLowerCase();
    if (!isValidEmail(email)) throw new AppError("El correo de respaldo no es válido.", 400, "respaldo_invalido");
    if (email === primary.email.trim().toLowerCase()) {
      throw new AppError("El correo de respaldo debe ser distinto de tu correo principal.", 400, "respaldo_igual");
    }
    return { value: email, type: "email" };
  }
  const phone = normalizeChilePhone(text);
  if (!phone) {
    throw new AppError(
      "El teléfono de respaldo debe ser chileno: celular +56 9 XXXX XXXX o fijo +56 2 XXXX XXXX. También puedes dejar un correo.",
      400,
      "respaldo_invalido",
    );
  }
  if (phone === primary.whatsapp.replace(/\D/g, "")) {
    throw new AppError("El teléfono de respaldo debe ser distinto de tu WhatsApp principal.", 400, "respaldo_igual");
  }
  return { value: phone, type: "telefono" };
}

type Row = {
  role: string;
  email: string;
  whatsapp: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  verification_status: string;
  backup_contact: string | null;
  backup_contact_type: string | null;
  backup_contact_at: string | null;
};

function rowOf(userId: string): Row | undefined {
  return getDb()
    .prepare(
      `SELECT role, email, whatsapp, email_verified_at, phone_verified_at, verification_status, backup_contact, backup_contact_type, backup_contact_at
       FROM users WHERE id = ?`,
    )
    .get(userId) as Row | undefined;
}

export function backupContactOf(userId: string): BackupContact | null {
  const row = rowOf(userId);
  if (!row?.backup_contact) return null;
  const type: BackupContactType = row.backup_contact_type === "email" ? "email" : "telefono";
  return { value: row.backup_contact, type, display: formatBackupContact(row.backup_contact, type), updatedAt: row.backup_contact_at };
}

/** Guarda (o reemplaza) el contacto de respaldo. */
export function setBackupContact(userId: string, raw: unknown, now = new Date()): BackupContact {
  const row = rowOf(userId);
  if (!row) throw new AppError("Usuario no encontrado.", 404);
  const parsed = parseBackupContact(raw, { email: row.email, whatsapp: row.whatsapp });
  getDb()
    .prepare(`UPDATE users SET backup_contact = ?, backup_contact_type = ?, backup_contact_at = ? WHERE id = ?`)
    .run(parsed.value, parsed.type, now.toISOString(), userId);
  return { ...parsed, display: formatBackupContact(parsed.value, parsed.type), updatedAt: now.toISOString() };
}

/**
 * ¿La verificación de la cuenta sigue pendiente? Correo sin confirmar, teléfono sin confirmar (transportistas, o todas
 * con KYC activo), documentos obligatorios sin aprobar (transportistas) o cuenta no aprobada. Los administradores nunca.
 */
export function verificationPending(userId: string): boolean {
  const row = rowOf(userId);
  if (!row || row.role === "admin") return false;
  if (!row.email_verified_at) return true;
  // El teléfono es obligatorio para transportistas, y para todas las cuentas con la verificación de identidad (KYC) activa.
  if ((row.role === "transportista" || kycEnabled()) && !row.phone_verified_at) return true;
  if (row.role === "transportista" && !carrierChecklist(userId).docsReady) return true;
  return row.verification_status !== "verificado";
}

/** Hay que pedirle el contacto de respaldo: verificación pendiente y aún no lo deja. */
export function needsBackupContact(userId: string): boolean {
  const row = rowOf(userId);
  if (!row || row.role === "admin" || row.backup_contact) return false;
  return verificationPending(userId);
}
