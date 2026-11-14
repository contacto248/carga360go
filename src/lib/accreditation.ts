import { carrierChecklist, type ChecklistDoc } from "./carrier";
import { getDb } from "./db";
import { AppError } from "./errors";
import { kycEnabled } from "./kyc/config";
import { kycOf, KYC_STATUS_LABELS } from "./kyc/service";
import { graceOf, type KycGrace } from "./kyc/grace";
import { privacyVersion, termsVersion } from "./privacy";
import { REQUIREMENTS, REQUIREMENT_STATUSES, REQUIREMENT_STATUS_LABELS, type RequirementKey, type RequirementStatus } from "./requirements";
import type { PublicUser } from "./types";

/**
 * Acreditación 100%: solo las cuentas que cumplen todo pueden publicar cargas o camiones y ofertar.
 * - Todas: Política de Privacidad vigente aceptada, correo confirmado, requisitos de calidad, seguridad
 *   y medio ambiente revisados por un administrador ("cumple" o "no aplica") y cuenta aprobada.
 * - Transportistas además: teléfono confirmado y documentos obligatorios aprobados y vigentes.
 * - Con KYC_FEATURE_ENABLED=true (verificación de identidad con Didit), TODAS las cuentas (mandantes y transportistas)
 *   exigen además teléfono confirmado e identidad verificada (cédula + prueba de vida + rostro).
 * Los administradores quedan acreditados siempre.
 */
export { REQUIREMENTS, REQUIREMENT_STATUSES, REQUIREMENT_STATUS_LABELS, type RequirementKey, type RequirementStatus };

export type AccreditationItem = {
  key: string;
  label: string;
  ok: boolean;
  /** Qué falta o qué hacer, en palabras simples. */
  hint: string;
  /** Quién lo resuelve: el usuario o el administrador. */
  by: "usuario" | "admin";
  status?: string;
};

export type Accreditation = {
  items: AccreditationItem[];
  docs: ChecklistDoc[];
  requirements: Record<RequirementKey, RequirementStatus>;
  privacyAccepted: boolean;
  /** Todo listo salvo la aprobación final del administrador. */
  ready: boolean;
  accredited: boolean;
  done: number;
  total: number;
  missing: string[];
  /** Plazo de gracia si la cuenta ya estaba acreditada al encender el KYC. */
  grace: KycGrace | null;
};

type Row = {
  role: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  verification_status: string;
  privacy_version: string | null;
  terms_version: string | null;
  req_calidad: string | null;
  req_seguridad: string | null;
  req_medioambiente: string | null;
};

function asRequirement(value: string | null | undefined): RequirementStatus {
  return (REQUIREMENT_STATUSES as readonly string[]).includes(value ?? "") ? (value as RequirementStatus) : "pendiente";
}

export function accreditationOf(userId: string): Accreditation {
  const row = getDb()
    .prepare(
      `SELECT role, email_verified_at, phone_verified_at, verification_status, privacy_version, terms_version, req_calidad, req_seguridad, req_medioambiente
       FROM users WHERE id = ?`,
    )
    .get(userId) as Row | undefined;
  if (!row) throw new AppError("Usuario no encontrado.", 404);
  const requirements = {
    calidad: asRequirement(row.req_calidad),
    seguridad: asRequirement(row.req_seguridad),
    medioambiente: asRequirement(row.req_medioambiente),
  };
  // Política de Privacidad y Términos de uso vigentes, aceptados juntos.
  const privacyAccepted = row.privacy_version === privacyVersion() && row.terms_version === termsVersion();
  if (row.role === "admin") {
    return { items: [], docs: [], requirements, privacyAccepted, ready: true, accredited: true, done: 0, total: 0, missing: [], grace: null };
  }
  const carrier = row.role === "transportista";
  const items: AccreditationItem[] = [
    {
      key: "privacidad",
      label: "Política de Privacidad y Términos de uso aceptados",
      ok: privacyAccepted,
      hint: "Lee y acepta la Política de Privacidad y los Términos de uso vigentes.",
      by: "usuario",
    },
    {
      key: "correo",
      label: "Correo confirmado",
      ok: Boolean(row.email_verified_at),
      hint: "Abre el enlace que te enviamos por correo o pide otro.",
      by: "usuario",
    },
  ];
  let docs: ChecklistDoc[] = [];
  const kyc = kycEnabled();
  if (carrier || kyc) {
    items.push({
      key: "telefono",
      label: "Teléfono / WhatsApp confirmado",
      ok: Boolean(row.phone_verified_at),
      hint: "Confirma tu número con el código o espera que te contactemos.",
      by: "usuario",
    });
  }
  if (kyc) {
    const identity = kycOf(userId);
    items.push({
      key: "identidad",
      label: "Identidad verificada (cédula + reconocimiento facial)",
      ok: identity.status === "aprobado",
      status: identity.status,
      hint:
        identity.status === "en_revision"
          ? "Tu verificación está en revisión. Te avisaremos cuando termine."
          : identity.status === "en_curso"
            ? "Termina la verificación en tu celular o vuelve a abrirla."
            : identity.status === "rechazado"
              ? "La verificación no se aprobó. Inténtalo de nuevo con buena luz y tu cédula vigente."
              : `${KYC_STATUS_LABELS[identity.status]}: verifica tu identidad con tu cédula y una selfie.`,
      by: "usuario",
    });
  }
  if (carrier) {
    const check = carrierChecklist(userId);
    docs = check.docs;
    const pendingDocs = docs.filter((doc) => doc.status !== "verificado");
    items.push({
      key: "documentos",
      label: "Documentos obligatorios aprobados y vigentes",
      ok: pendingDocs.length === 0,
      hint: pendingDocs.length
        ? `Falta: ${pendingDocs
            .map((doc) => `${doc.label} (${doc.status === "falta" ? "subir" : doc.status === "pendiente" ? "en revisión" : doc.status === "vencido" ? "vencido" : "rechazado"})`)
            .join(", ")}.`
        : "Todos aprobados.",
      by: "usuario",
    });
  }
  for (const req of REQUIREMENTS) {
    const status = requirements[req.key];
    items.push({
      key: req.key,
      label: req.label,
      ok: status === "cumple" || status === "no_aplica",
      status,
      hint:
        status === "no_cumple"
          ? "Un administrador indicó que no cumple. Escríbenos a contacto@carga360go.cl para revisarlo."
          : status === "pendiente"
            ? "Lo revisa un administrador de Carga360go."
            : REQUIREMENT_STATUS_LABELS[status],
      by: "admin",
    });
  }
  const grace = kyc ? graceOf(userId) : null;
  const kycPending = items.filter((item) => (item.key === "telefono" || item.key === "identidad") && !item.ok);
  const otherPending = items.filter((item) => item.key !== "telefono" && item.key !== "identidad" && !item.ok);
  // Durante el plazo de gracia, teléfono e identidad no impiden seguir operando.
  const ready = grace?.active ? otherPending.length === 0 : items.every((item) => item.ok);
  const approved = row.verification_status === "verificado";
  items.push({
    key: "aprobacion",
    label: "Cuenta aprobada por un administrador",
    ok: approved,
    hint: approved
      ? grace?.active && kycPending.length
        ? `Aprobada, con ${grace.daysLeft} ${grace.daysLeft === 1 ? "día" : "días"} de plazo para completar teléfono e identidad.`
        : "Aprobada."
      : row.verification_status === "rechazado"
        ? "Cuenta rechazada: revisa el motivo y corrige lo indicado."
        : ready
          ? "Todo listo: un administrador la aprobará pronto."
          : "Se aprueba cuando todo lo anterior está completo.",
    by: "admin",
  });
  const accredited = ready && approved;
  return {
    items,
    docs,
    requirements,
    privacyAccepted,
    ready,
    accredited,
    done: items.filter((item) => item.ok).length,
    total: items.length,
    missing: items.filter((item) => !item.ok).map((item) => item.label),
    grace,
  };
}

export function isAccredited(user: PublicUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return accreditationOf(user.id).accredited;
}

/** Publicar cargas/camiones y ofertar exige acreditación 100%. */
export function assertAccredited(user: PublicUser, action: string) {
  if (user.role === "admin") return;
  const acc = accreditationOf(user.id);
  if (acc.accredited) return;
  throw new AppError(
    `Para ${action} tu cuenta debe estar 100% acreditada. Falta: ${acc.missing.join(", ")}. Revisa "Acreditación" en tu panel.`,
    403,
    "sin_acreditacion",
  );
}

/** El administrador aprueba la cuenta solo cuando todo lo demás está completo. */
export function approveCarrier(adminId: string, userId: string) {
  const acc = accreditationOf(userId);
  const pending = acc.items.filter((item) => item.key !== "aprobacion" && !item.ok).map((item) => item.label.toLowerCase());
  if (pending.length > 0) throw new AppError(`No se puede aprobar todavía. Falta: ${pending.join(", ")}.`);
  getDb()
    .prepare(`UPDATE users SET verification_status = 'verificado', verification_note = NULL, verified_at = ?, verified_by = ? WHERE id = ?`)
    .run(new Date().toISOString(), adminId, userId);
}
export const approveAccount = approveCarrier;

export function setRequirement(userId: string, key: string, status: string) {
  const req = REQUIREMENTS.find((item) => item.key === key);
  if (!req) throw new AppError("Requisito desconocido.");
  if (!(REQUIREMENT_STATUSES as readonly string[]).includes(status)) throw new AppError("Estado de requisito no válido.");
  const row = getDb().prepare(`SELECT role FROM users WHERE id = ?`).get(userId) as { role: string } | undefined;
  if (!row) throw new AppError("Usuario no encontrado.", 404);
  if (row.role === "admin") throw new AppError("La cuenta administradora no requiere acreditación.");
  getDb().prepare(`UPDATE users SET ${req.column} = ? WHERE id = ?`).run(status, userId);
  // Si deja de cumplir un requisito, la cuenta aprobada vuelve a revisión.
  if (status === "pendiente" || status === "no_cumple") {
    getDb().prepare(`UPDATE users SET verification_status = 'pendiente' WHERE id = ? AND verification_status = 'verificado'`).run(userId);
  }
}

/** Si la cuenta con sesión debe aceptar la versión vigente de la Política de Privacidad y/o de los Términos de uso. */
export function privacyGateFor(user: PublicUser | null | undefined): { required: boolean; firstTime: boolean; privacy: boolean; terms: boolean } {
  const none = { required: false, firstTime: false, privacy: false, terms: false };
  if (!user) return none;
  const row = getDb().prepare(`SELECT privacy_version, terms_version FROM users WHERE id = ?`).get(user.id) as
    | { privacy_version: string | null; terms_version: string | null }
    | undefined;
  if (!row) return none;
  const privacy = row.privacy_version !== privacyVersion();
  const terms = row.terms_version !== termsVersion();
  return { required: privacy || terms, firstTime: !row.privacy_version && !row.terms_version, privacy, terms };
}

/** Guarda la aceptación de las versiones vigentes de la Política de Privacidad y de los Términos de uso. */
export function acceptPrivacyFor(userId: string) {
  const stamp = new Date().toISOString();
  getDb()
    .prepare(`UPDATE users SET privacy_accepted_at = ?, privacy_version = ?, terms_accepted_at = ?, terms_version = ? WHERE id = ?`)
    .run(stamp, privacyVersion(), stamp, termsVersion(), userId);
}
