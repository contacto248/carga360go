import { BRAND, docTypeLabel } from "../catalog";
import { formatDateCL, formatWhatsappDisplay } from "../format";
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

function pendingList(status: OnboardingStatus): string[] {
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

function wrapHtml(title: string, body: string): string {
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
                    <a href="${esc(btn)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;">Completar mi registro</a>
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
    `Tus primeros ${status.freeDays} días son gratis, contados desde tu inscripción.`,
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
    Tus primeros ${status.freeDays} días son gratis, contados desde tu inscripción.</p>
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
    `Recuerda: tus primeros ${status.freeDays} días son gratis, contados desde tu inscripción.`,
    "",
    "Equipo Carga360go",
    "www.carga360go.cl",
  ].join("\n");
  const htmlBody = `
    <p>Hola ${esc(status.contactName)}:</p>
    <p>${esc(when)} y todavía falta algo para completar tu registro en Carga360go:</p>
    <ul style="padding-left:20px;margin:0 0 16px;">${listedHtml}</ul>
    <p>Entra a tu panel para resolverlo.</p>
    <p>Recuerda: tus primeros ${status.freeDays} días son gratis, contados desde tu inscripción.</p>
  `;
  return { subject, text, html: wrapHtml(subject, htmlBody) };
}

/** Textos de WhatsApp (solo armado; el envío queda detrás de WHATSAPP_ONBOARDING_ENABLED). */
export function whatsappWelcomeChecklist(status: OnboardingStatus): string {
  const lines = statusLines(status).text.map((line) => line.replace(/^• /, ""));
  return [
    `Hola ${status.contactName}, gracias por inscribirte en Carga360go como ${status.roleLabel}.`,
    `Tus primeros ${status.freeDays} días son gratis, contados desde tu inscripción.`,
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
