import { BRAND } from "./catalog";
import { appUrl } from "./mail";
import { sendEmail } from "./notify";
import { roleLabel } from "./roles";
import type { PublicUser } from "./types";

function adminEmail(): string {
  return process.env.ADMIN_NOTIFY_EMAIL || BRAND.email;
}

/** Aviso al administrador; nunca bloquea ni rompe la acción que lo origina. */
export function notifyAdmin(subject: string, lines: string[]) {
  sendEmail(adminEmail(), `[Carga360go] ${subject}`, [...lines, "", `Panel: ${appUrl()}/admin`].join("\n")).catch((error) =>
    console.error("[carga360go] No se pudo avisar al administrador", error),
  );
}

export function notifyNewRegistration(user: PublicUser) {
  notifyAdmin(`Nueva cuenta: ${user.razonSocial} (${roleLabel(user.role).toLowerCase()})`, [
    "Se registró una cuenta nueva:",
    `${roleLabel(user.role)} · ${user.razonSocial} · RUT ${user.rut}`,
    `Contacto: ${user.contactName} · ${user.email} · WhatsApp +${user.whatsapp} · ${user.city}`,
    user.role === "transportista"
      ? `Queda bloqueada hasta que apruebes sus documentos: ${appUrl()}/admin/transportistas?estado=pendiente`
      : "Puede publicar cargas apenas confirme su correo.",
  ]);
}

const DOC_NOTICE_WINDOW_MS = 30 * 60 * 1000;
const lastDocNotice = new Map<string, number>();

/** Un aviso por transportista cada 30 minutos: quien sube 6 documentos seguidos genera un solo correo. */
export function notifyDocumentUploaded(user: PublicUser, docLabel: string, now = Date.now()) {
  if (user.role !== "transportista") return;
  const last = lastDocNotice.get(user.id);
  if (last && now - last < DOC_NOTICE_WINDOW_MS) return;
  lastDocNotice.set(user.id, now);
  notifyAdmin(`Documentos para revisar: ${user.razonSocial}`, [
    `${user.razonSocial} (${user.email}) está subiendo documentos (el primero: ${docLabel}).`,
    "Espera unos minutos a que termine y revisa todos juntos.",
    `Revísalo y apruébalo: ${appUrl()}/admin/transportistas?estado=pendiente`,
  ]);
}
