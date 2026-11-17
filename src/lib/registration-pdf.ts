import { accreditationOf } from "./accreditation";
import { freePeriodOf } from "./campaign";
import { BRAND } from "./catalog";
import { getDb } from "./db";
import { AppError } from "./errors";
import { formatRut, formatWhatsappDisplay } from "./format";
import { kycEnabled } from "./kyc/config";
import { kycOf, KYC_STATUS_LABELS } from "./kyc/service";
import { appUrl } from "./mail";
import { type Delivery, sendEmail } from "./notify";
import { buildWelcomeEmail } from "./onboarding/messages";
import { onboardingStatusOf } from "./onboarding/status";
import { A4, SimplePdf, wrapText } from "./pdf/simple-pdf";
import { roleLabel } from "./roles";
import type { Role } from "./types";

/**
 * Copia en PDF de la inscripción (pedido de Bastián: "mandar una copia en PDF a los clientes después de inscritos").
 * Va detrás de REGISTRATION_PDF_ENABLED (independiente de Didit, OTP y la acreditación).
 * Se adjunta al correo de bienvenida que sale cuando la persona confirma su correo, y se puede descargar desde el panel.
 * Nunca incluye contraseñas, tokens ni imágenes. No se reenvía a quienes ya estaban inscritos.
 */

export function registrationPdfEnabled(): boolean {
  return process.env.REGISTRATION_PDF_ENABLED === "true";
}

type UserRow = {
  id: string;
  email: string;
  role: Role;
  razon_social: string;
  rut: string;
  contact_name: string;
  whatsapp: string;
  city: string;
  created_at: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  privacy_accepted_at: string | null;
  privacy_version: string | null;
  terms_accepted_at: string | null;
  terms_version: string | null;
  free_until: string | null;
  verification_status: string;
};

export type RegistrationData = {
  folio: string;
  role: string;
  razonSocial: string;
  rut: string;
  contactName: string;
  email: string;
  whatsapp: string;
  city: string;
  registeredAt: string;
  freeUntil: string | null;
  privacy: string;
  terms: string;
  emailStatus: string;
  phoneStatus: string;
  identityStatus: string;
  accountStatus: string;
  issuedAt: string;
};

function chileDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${new Date(iso).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })} (hora de Chile)`;
}

export function registrationDataOf(userId: string, now = new Date()): RegistrationData {
  const row = getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as UserRow | undefined;
  if (!row) throw new AppError("Usuario no encontrado.", 404);
  if (row.role === "admin") throw new AppError("La cuenta administradora no tiene comprobante de inscripción.");
  const acc = accreditationOf(userId);
  const kyc = kycEnabled() ? kycOf(userId) : null;
  const free = freePeriodOf(row.free_until);
  return {
    folio: `C360-${row.created_at.slice(0, 10).replace(/-/g, "")}-${row.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    role: roleLabel(row.role),
    razonSocial: row.razon_social,
    rut: formatRut(row.rut),
    contactName: row.contact_name,
    email: row.email,
    whatsapp: formatWhatsappDisplay(row.whatsapp),
    city: row.city,
    registeredAt: chileDateTime(row.created_at),
    freeUntil: free ? free.label : null,
    privacy: row.privacy_version ? `Versión ${row.privacy_version}, aceptada el ${chileDateTime(row.privacy_accepted_at)}` : "Pendiente de aceptar",
    terms: row.terms_version ? `Versión ${row.terms_version}, aceptados el ${chileDateTime(row.terms_accepted_at)}` : "Pendientes de aceptar",
    emailStatus: row.email_verified_at ? `Confirmado el ${chileDateTime(row.email_verified_at)}` : "Pendiente",
    phoneStatus: row.phone_verified_at ? `Confirmado el ${chileDateTime(row.phone_verified_at)}` : "Pendiente",
    identityStatus: kyc
      ? kyc.status === "aprobado" && kyc.decidedAt
        ? `${KYC_STATUS_LABELS.aprobado} el ${chileDateTime(kyc.decidedAt)}`
        : KYC_STATUS_LABELS[kyc.status]
      : "No aplica",
    accountStatus: acc.accredited ? "Acreditada" : `En acreditación (${acc.done} de ${acc.total} pasos listos)`,
    issuedAt: chileDateTime(now.toISOString()),
  };
}

const NAVY: [number, number, number] = [0.06, 0.16, 0.32];
const ORANGE: [number, number, number] = [0.96, 0.45, 0.09];
const GRAY: [number, number, number] = [0.38, 0.4, 0.45];

export function buildRegistrationPdf(data: RegistrationData): Buffer {
  const pdf = new SimplePdf();
  const left = 50;
  const right = A4.width - 50;
  const width = right - left;
  let y = A4.height - 50;

  pdf.rect(0, A4.height - 96, A4.width, 96, NAVY);
  pdf.rect(0, A4.height - 100, A4.width, 4, ORANGE);
  pdf.text(left, A4.height - 52, "Carga360go", { size: 24, bold: true, color: [1, 1, 1] });
  pdf.text(left, A4.height - 74, "Comprobante de inscripción", { size: 13, color: [1, 1, 1] });
  pdf.text(right - 170, A4.height - 52, `Folio ${data.folio}`, { size: 9, bold: true, color: [1, 1, 1] });
  pdf.text(right - 170, A4.height - 66, `Emitido: ${data.issuedAt}`, { size: 7.5, color: [1, 1, 1] });
  y = A4.height - 130;

  const intro = `Hola ${data.contactName}: este documento es la copia de tu inscripción en Carga360go (carga360go.cl). Guárdalo como respaldo de los datos que registraste y de lo que aceptaste.`;
  for (const line of wrapText(intro, 10, width)) {
    pdf.text(left, y, line, { size: 10 });
    y -= 14;
  }
  y -= 8;

  const section = (title: string, rows: [string, string][]) => {
    if (y < 140) {
      pdf.addPage();
      y = A4.height - 60;
    }
    pdf.text(left, y, title, { size: 12, bold: true, color: NAVY });
    y -= 6;
    pdf.line(left, y, right, y, ORANGE, 1);
    y -= 16;
    for (const [label, value] of rows) {
      const lines = wrapText(value, 10, width - 170);
      pdf.text(left, y, label, { size: 9.5, bold: true, color: GRAY });
      lines.forEach((line, index) => pdf.text(left + 170, y - index * 13, line, { size: 10 }));
      y -= Math.max(1, lines.length) * 13 + 5;
    }
    y -= 10;
  };

  section("Datos de la cuenta", [
    ["Tipo de cuenta", data.role],
    ["Razón social / nombre", data.razonSocial],
    ["RUT", data.rut],
    ["Persona de contacto", data.contactName],
    ["Correo registrado", data.email],
    ["WhatsApp / teléfono", data.whatsapp],
    ["Ciudad", data.city],
    ["Fecha de inscripción", data.registeredAt],
  ]);
  section("Documentos aceptados", [
    ["Política de Privacidad", data.privacy],
    ["Términos de uso", data.terms],
  ]);
  section("Estado de verificación", [
    ["Correo", data.emailStatus],
    ["Teléfono", data.phoneStatus],
    ["Identidad (cédula + rostro)", data.identityStatus],
    ["Acreditación de la cuenta", data.accountStatus],
  ]);

  const notes = [
    kycEnabled()
      ? "Para publicar cargas o camiones y ofertar, tu cuenta debe estar 100% acreditada: correo y teléfono confirmados, identidad verificada con tu cédula y reconocimiento facial, y la revisión de Carga360go. Los transportistas además deben tener sus documentos vigentes."
      : "Para publicar cargas o camiones y ofertar, tu cuenta debe estar 100% acreditada: correo confirmado, la revisión de Carga360go y, si eres transportista, teléfono confirmado y documentos vigentes.",
    "Los datos de contacto se comparten solo entre el mandante y el transportista elegido cuando se adjudica una oferta.",
    `Revisa o corrige tus datos en ${appUrl()}/cuenta-en-revision. Si algo no corresponde, escríbenos a ${BRAND.email}.`,
  ];
  if (y < 160) {
    pdf.addPage();
    y = A4.height - 60;
  }
  for (const note of notes) {
    for (const line of wrapText(note, 9, width)) {
      pdf.text(left, y, line, { size: 9, color: GRAY });
      y -= 12;
    }
    y -= 6;
  }

  pdf.line(left, 70, right, 70);
  pdf.text(left, 56, `${BRAND.company} · RUT ${BRAND.rut} · ${BRAND.address}`, { size: 8, color: GRAY });
  pdf.text(left, 44, `${BRAND.email} · WhatsApp ${BRAND.whatsappDisplay} · www.carga360go.cl`, { size: 8, color: GRAY });
  return pdf.toBuffer({ title: `Comprobante de inscripción ${data.folio}`, author: BRAND.company });
}

export function registrationPdfFor(userId: string): { filename: string; content: Buffer } {
  const data = registrationDataOf(userId);
  return { filename: `carga360go-inscripcion-${data.folio}.pdf`, content: buildRegistrationPdf(data) };
}

/** Correo de bienvenida (estado real + copia en PDF). Solo con REGISTRATION_PDF_ENABLED=true; nunca lanza. */
export async function sendRegistrationCopy(userId: string): Promise<Delivery | "apagado"> {
  if (!registrationPdfEnabled()) return "apagado";
  try {
    const row = getDb().prepare(`SELECT email, contact_name, role FROM users WHERE id = ?`).get(userId) as
      | { email: string; contact_name: string; role: string }
      | undefined;
    if (!row || row.role === "admin") return "error";
    const file = registrationPdfFor(userId);
    const status = onboardingStatusOf(userId);
    if (!status) return "error";
    const mail = buildWelcomeEmail(status, { withPdf: true });
    return await sendEmail(row.email, mail.subject, mail.text, [
      { filename: file.filename, content: file.content, contentType: "application/pdf" },
    ], { html: mail.html });
  } catch (error) {
    console.error("[carga360go] No se pudo enviar la copia de inscripción", error);
    return "error";
  }
}
