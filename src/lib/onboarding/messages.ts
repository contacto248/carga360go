import { BRAND, docTypeLabel } from "../catalog";
import { formatDateCL, formatWhatsappDisplay, todayChile } from "../format";
import { appUrl } from "../mail";
import type { OnboardingStage } from "./config";
import type { OnboardingStatus } from "./status";

export type BuiltEmail = { subject: string; text: string; html: string };

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function panelUrl(): string {
  return `${appUrl()}/panel`;
}

function statusLines(status: OnboardingStatus): { text: string[]; html: string[] } {
  const text: string[] = [];
  const html: string[] = [];
  text.push(`• Correo: ${status.emailVerified ? "Verificado" : "Pendiente"}`);
  html.push(`<li><strong>Correo:</strong> ${status.emailVerified ? "Verificado" : "Pendiente"}</li>`);
  if (status.phoneFeatureOn) {
    const phone = formatWhatsappDisplay(status.whatsapp);
    const value = status.phoneVerified ? "Verificado" : "Pendiente";
    text.push(`• WhatsApp ${phone}: ${value}`);
    html.push(`<li><strong>WhatsApp ${esc(phone)}:</strong> ${value}</li>`);
  }
  if (status.docs.total > 0) {
    let docs = `• Documentos: ${status.docs.uploaded} de ${status.docs.total} cargados`;
    let docsHtml = `<li><strong>Documentos:</strong> ${status.docs.uploaded} de ${status.docs.total} cargados`;
    if (status.docsDeadline) {
      docs += `. Fecha límite: ${formatDateCL(status.docsDeadline)}`;
      docsHtml += `. Fecha límite: ${esc(formatDateCL(status.docsDeadline))}`;
    }
    text.push(docs);
    html.push(`${docsHtml}</li>`);
  }
  return { text, html };
}

/** Texto para pedir el contacto de respaldo mientras la verificación siga pendiente. */
export const BACKUP_CONTACT_LINE =
  "dejar un teléfono o correo de respaldo (distinto del principal) en tu panel, sección «Contacto de respaldo», por si no alcanzas a terminar la inscripción";

export function pendingList(status: OnboardingStatus): string[] {
  const items: string[] = [];
  if (status.pending.includes("email")) items.push("confirmar tu correo");
  if (status.pending.includes("phone")) items.push("confirmar tu WhatsApp");
  if (status.pending.includes("documents")) {
    const missing = status.docs.items
      .filter((item) => item.status !== "pendiente" && item.status !== "verificado")
      .map((item) => docTypeLabel(item.type));
    items.push(
      missing.length
        ? `subir los documentos que faltan (${missing.join(", ")}; van ${status.docs.uploaded} de ${status.docs.total})`
        : `subir los documentos que faltan (${status.docs.uploaded} de ${status.docs.total})`,
    );
  }
  if (status.backupContactMissing) items.push(BACKUP_CONTACT_LINE);
  return items;
}

const NAVY = "#0f2947";
const ORANGE = "#f57317";

function wrapHtml(title: string, body: string, buttonLabel = "Completar mi registro"): string {
  const btn = panelUrl();
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:${NAVY};padding:20px 28px;border-bottom:4px solid ${ORANGE};">
              <div style="font-size:22px;font-weight:bold;color:#ffffff;">Carga360go</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:16px;line-height:1.5;">
              ${body}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 8px;">
                <tr>
                  <td style="background:${ORANGE};border-radius:6px;">
                    <a href="${esc(btn)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;">${esc(buttonLabel)}</a>
                  </td>
                </tr>
              </table>
              <p style="font-size:13px;color:#555;margin:0 0 16px;">O abre este enlace: <a href="${esc(btn)}" style="color:${NAVY};">${esc(btn)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;font-size:13px;color:#555;border-top:1px solid #eee;">
              Equipo Carga360go<br>
              <a href="https://www.carga360go.cl" style="color:${NAVY};">www.carga360go.cl</a>
              · ${esc(BRAND.email)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const WELCOME_SUBJECT_PENDING = "Bienvenido a Carga360go — completa tu registro";
export const WELCOME_SUBJECT_COMPLETE = "Bienvenido a Carga360go — copia de tu inscripción";

export function buildWelcomeEmail(status: OnboardingStatus, opts: { withPdf: boolean }): BuiltEmail {
  const subject = status.complete ? WELCOME_SUBJECT_COMPLETE : WELCOME_SUBJECT_PENDING;
  const lines = statusLines(status);
  const pdfLine = opts.withPdf ? "Adjuntamos el PDF con la copia de tu inscripción." : "";
  const text = [
    `Hola ${status.contactName}:`,
    "",
    `Gracias por inscribirte en Carga360go como ${status.roleLabel}.`,
    "En Carga360go el costo real del flete se calcula de forma automática, con trazabilidad de cada viaje.",
    "",
    "Estado de tu registro:",
    ...lines.text,
    "",
    status.complete
      ? "En lo que te corresponde, tu registro ya está completo. Revisa tu panel cuando quieras."
      : "Para terminar, entra a tu panel:",
    panelUrl(),
    "",
    status.backupContactMissing ? `Mientras terminas, te pedimos ${BACKUP_CONTACT_LINE}.` : "",
    pdfLine,
    "",
    "Equipo Carga360go",
    "www.carga360go.cl",
  ]
    .filter((line, index, arr) => line !== "" || arr[index - 1] !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  const htmlBody = `
    <p>Hola ${esc(status.contactName)}:</p>
    <p>Gracias por inscribirte en Carga360go como ${esc(status.roleLabel)}.
    En Carga360go el costo real del flete se calcula de forma automática, con trazabilidad de cada viaje.</p>
    <p><strong>Estado de tu registro:</strong></p>
    <ul style="padding-left:20px;margin:0 0 16px;">${lines.html.join("")}</ul>
    ${
      status.complete
        ? "<p>En lo que te corresponde, tu registro ya está completo. Revisa tu panel cuando quieras.</p>"
        : "<p>Para terminar, entra a tu panel con el botón de abajo.</p>"
    }
    ${status.backupContactMissing ? `<p>Mientras terminas, te pedimos ${esc(BACKUP_CONTACT_LINE)}.</p>` : ""}
    ${opts.withPdf ? "<p>Adjuntamos el PDF con la copia de tu inscripción.</p>" : ""}
  `;
  return { subject, text, html: wrapHtml(subject, htmlBody) };
}

export function buildReminderEmail(status: OnboardingStatus, stage: OnboardingStage): BuiltEmail {
  const subject = "Completa tu registro en Carga360go";
  const pending = pendingList(status);
  const listed = pending.map((item) => `• ${item}`).join("\n");
  const listedHtml = pending.map((item) => `<li>${esc(item)}</li>`).join("");
  const when =
    stage === "24h" ? "Ya pasó un día desde tu inscripción" : stage === "3d" ? "Ya pasaron tres días desde tu inscripción" : "Se acerca la fecha límite para subir tus documentos";
  const text = [
    `Hola ${status.contactName}:`,
    "",
    `${when} y todavía falta algo para completar tu registro en Carga360go:`,
    listed,
    "",
    "Entra a tu panel para resolverlo:",
    panelUrl(),
    "",
    "Equipo Carga360go",
    "www.carga360go.cl",
  ].join("\n");
  const htmlBody = `
    <p>Hola ${esc(status.contactName)}:</p>
    <p>${esc(when)} y todavía falta algo para completar tu registro en Carga360go:</p>
    <ul style="padding-left:20px;margin:0 0 16px;">${listedHtml}</ul>
    <p>Entra a tu panel para resolverlo.</p>
  `;
  return { subject, text, html: wrapHtml(subject, htmlBody) };
}

/** Textos de WhatsApp (solo armado; el envío queda detrás de WHATSAPP_ONBOARDING_ENABLED). */
export function whatsappWelcomeChecklist(status: OnboardingStatus): string {
  const lines = statusLines(status).text.map((line) => line.replace(/^• /, ""));
  return [
    `Hola ${status.contactName}, gracias por inscribirte en Carga360go como ${status.roleLabel}.`,
    "En Carga360go el costo real del flete se calcula de forma automática, con trazabilidad de cada viaje.",
    "",
    "Estado de tu registro:",
    ...lines.map((line) => `• ${line}`),
    "",
    ...(status.backupContactMissing ? [`Mientras terminas, te pedimos ${BACKUP_CONTACT_LINE}.`, ""] : []),
    `Completa tu registro aquí: ${panelUrl()}`,
  ].join("\n");
}

export function whatsappPhoneOtp(code: string): string {
  return `Tu código de verificación de Carga360go es *${code}*. Vence en 10 minutos. No lo compartas con nadie.`;
}

export function whatsappPendingDocuments(status: OnboardingStatus): string {
  const pending = pendingList(status);
  return [
    `Hola ${status.contactName}, todavía falta algo para completar tu registro en Carga360go:`,
    ...pending.map((item) => `• ${item}`),
    "",
    `Entra a tu panel: ${panelUrl()}`,
  ].join("\n");
}

export function whatsappAllComplete(nombre: string): string {
  return `¡Listo, ${nombre}! ✅ Tu cuenta quedó verificada. Revisaremos tus documentos y te avisaremos cuando estés acreditado para publicar u ofertar cargas.`;
}


/** Fecha de vencimiento en calendario de Chile, dd-mm-aaaa. */
export function formatUntilDateCL(untilIso: string): string {
  return formatDateCL(todayChile(new Date(untilIso)));
}

export function accreditationMissingItems(status: OnboardingStatus | null, verificationStatus?: string | null): string[] {
  const items = status ? pendingList(status) : [];
  if (items.length === 0 && verificationStatus && verificationStatus !== "verificado") {
    items.push("completar la acreditación: el equipo revisará tu cuenta");
  }
  if (items.length === 0) items.push("completar tu acreditación en el panel");
  return items;
}

/** Versión corta para variables de plantilla de WhatsApp (máx. 200 caracteres). */
export function accreditationMissingShort(items: string[]): string {
  const text = items
    .map((item) => (item.startsWith("dejar un teléfono") || item.startsWith("dejar un")) ? "dejar un contacto de respaldo en tu panel" : item)
    .join("; ");
  return text.length <= 200 ? text : `${text.slice(0, 197).trim()}...`;
}

export type ManualReadonlyNoticeInput = {
  contactName: string;
  untilIso: string;
  missing: string[];
};

export const MANUAL_READONLY_GRANT_SUBJECT_PREFIX = "Verificación provisional en Carga360go";
export const MANUAL_READONLY_REVOKE_SUBJECT = "Se revocó el acceso de solo lectura en Carga360go";
export const MANUAL_READONLY_MAX_DAYS = 30;
const WA_GRANTED_MAX_CHARS = 400;

/** Pasa a trato de usted los pendientes armados con «tu» en el onboarding. */
export function formalMissingItems(items: string[]): string[] {
  return items.map((item) =>
    item
      .replace(/\btu correo\b/gi, "su correo")
      .replace(/\btu WhatsApp\b/g, "su WhatsApp")
      .replace(/\ben tu panel\b/g, "en su panel")
      .replace(/\btu inscripción\b/g, "su inscripción")
      .replace(/\btu acreditación\b/g, "su acreditación")
      .replace(/\btu cuenta\b/g, "su cuenta")
      .replace(/\btu registro\b/g, "su registro")
      .replace(/por si no alcanzas a terminar/, "por si no alcanza a terminar"),
  );
}

/** Resumen corto de documentación pendiente para WhatsApp o variable {{3}} de la plantilla. */
export function manualReadonlyPendingBrief(items: string[]): string {
  const formal = formalMissingItems(items);
  if (formal.length === 0) return "queda documentación pendiente";
  const short = accreditationMissingShort(formal);
  if (short.length <= 160) return short;
  const n = formal.length;
  return `${n} ${n === 1 ? "pendiente" : "pendientes"}`;
}

export function buildManualReadonlyGrantedEmail(input: ManualReadonlyNoticeInput): BuiltEmail {
  const until = formatUntilDateCL(input.untilIso);
  const subject = `${MANUAL_READONLY_GRANT_SUBJECT_PREFIX} — plazo máximo de ${MANUAL_READONLY_MAX_DAYS} días, hasta el ${until}`;
  const missing = formalMissingItems(input.missing);
  const missingLines = missing.map((item) => `• ${item}`);
  const missingHtml = missing.map((item) => `<li>${esc(item)}</li>`).join("");
  const text = [
    `Estimado/a ${input.contactName}:`,
    "",
    "Le informamos que un administrador de Carga360go ha otorgado a su cuenta una verificación provisional.",
    "",
    `Esta verificación provisional tiene un plazo máximo de ${MANUAL_READONLY_MAX_DAYS} días, hasta el ${until}.`,
    "",
    "Durante este período, usted podrá ingresar a la plataforma y consultar las cargas y los camiones publicados. No podrá publicar cargas, ofertar ni tomar cargas hasta completar su acreditación y quedar verificada por completo.",
    "",
    "Documentación pendiente:",
    ...missingLines,
    "",
    "Al vencer el plazo máximo, si la documentación sigue incompleta, la verificación provisional caducará de forma automática y su cuenta volverá a quedar pendiente, sin acceso a los movimientos de la plataforma, hasta que complete su acreditación.",
    "",
    "Para continuar, ingrese a su panel:",
    panelUrl(),
    "",
    "Atentamente,",
    "Equipo Carga360go",
    "www.carga360go.cl",
  ].join("\n");
  const htmlBody = `
    <p>Estimado/a ${esc(input.contactName)}:</p>
    <p>Le informamos que un administrador de Carga360go ha otorgado a su cuenta una verificación provisional.</p>
    <p>Esta verificación provisional tiene un <strong>plazo máximo de ${MANUAL_READONLY_MAX_DAYS} días, hasta el ${esc(until)}</strong>.</p>
    <p>Durante este período, usted podrá ingresar a la plataforma y consultar las cargas y los camiones publicados. <strong>No podrá publicar cargas, ofertar ni tomar cargas</strong> hasta completar su acreditación y quedar verificada por completo.</p>
    <p><strong>Documentación pendiente:</strong></p>
    <ul style="padding-left:20px;margin:0 0 16px;">${missingHtml}</ul>
    <p>Al vencer el plazo máximo, si la documentación sigue incompleta, la verificación provisional caducará de forma automática y su cuenta volverá a quedar pendiente, sin acceso a los movimientos de la plataforma, hasta que complete su acreditación.</p>
    <p>Para continuar, ingrese a su panel.</p>
  `;
  return { subject, text, html: wrapHtml(subject, htmlBody, "Ir a mi panel") };
}

export function manualReadonlyGrantedWhatsapp(input: ManualReadonlyNoticeInput): string {
  const until = formatUntilDateCL(input.untilIso);
  const prefix = `Estimado/a ${input.contactName}: se aprobó su verificación provisional en Carga360go por un plazo máximo de ${MANUAL_READONLY_MAX_DAYS} días, hasta el ${until}.`;
  const suffix = `Ingrese a su panel: ${panelUrl()}`;
  const brief = manualReadonlyPendingBrief(input.missing);
  const withList = `${prefix} Documentación pendiente: ${brief}. ${suffix}`;
  if (withList.length <= WA_GRANTED_MAX_CHARS) return withList;
  const n = Math.max(input.missing.length, 1);
  const counted = `${prefix} Queda pendiente documentación (${n} ${n === 1 ? "pendiente" : "pendientes"}). ${suffix}`;
  if (counted.length <= WA_GRANTED_MAX_CHARS) return counted;
  return `${prefix} Queda pendiente documentación. ${suffix}`.slice(0, WA_GRANTED_MAX_CHARS);
}

export function buildManualReadonlyRevokedEmail(contactName: string): BuiltEmail {
  const subject = MANUAL_READONLY_REVOKE_SUBJECT;
  const text = [
    `Hola ${contactName}:`,
    "",
    "El acceso de solo lectura a Carga360go fue revocado. Ya no puedes ver los movimientos de la plataforma hasta completar tu acreditación.",
    "",
    "Entra a tu panel para continuar:",
    panelUrl(),
    "",
    "Equipo Carga360go",
    "www.carga360go.cl",
  ].join("\n");
  const htmlBody = `
    <p>Hola ${esc(contactName)}:</p>
    <p>El acceso de solo lectura a Carga360go fue revocado. Ya no puedes ver los movimientos de la plataforma hasta completar tu acreditación.</p>
    <p>Entra a tu panel para continuar.</p>
  `;
  return { subject, text, html: wrapHtml(subject, htmlBody, "Ir a mi panel") };
}

export function manualReadonlyRevokedWhatsapp(contactName: string): string {
  return `Hola ${contactName}: el acceso de solo lectura a Carga360go fue revocado. Ya no puedes ver los movimientos de la plataforma hasta completar tu acreditación. Entra a tu panel: ${panelUrl()}`;
}

/**
 * Plantillas de WhatsApp propuestas (categoría Utility, idioma es).
 * Estado: pendiente de aprobación de Meta. No se envían hasta que existan en la cuenta
 * de WhatsApp Business y se configure WA_READONLY_TEMPLATE / WA_READONLY_REVOKE_TEMPLATE.
 */
export const WA_TEMPLATE_READONLY_GRANTED = {
  name: "verificacion_manual_solo_lectura",
  language: "es",
  category: "UTILITY",
  status: "pendiente_aprobacion_meta",
  body: "Estimado/a {{1}}: se aprobó su verificación provisional en Carga360go por un plazo máximo de 30 días, hasta el {{2}}. Documentación pendiente: {{3}}.",
  button: { type: "URL", text: "Ir al panel", url: "https://www.carga360go.cl/panel" },
} as const;

export const WA_TEMPLATE_READONLY_REVOKED = {
  name: "verificacion_manual_revocada",
  language: "es",
  category: "UTILITY",
  status: "pendiente_aprobacion_meta",
  body: "Hola {{1}}: el acceso de solo lectura a Carga360go fue revocado. Ya no puedes ver los movimientos de la plataforma hasta completar tu acreditación.",
  button: { type: "URL", text: "Ir al panel", url: "https://www.carga360go.cl/panel" },
} as const;
