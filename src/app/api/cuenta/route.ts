import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { profileFromBody, updateProfile } from "@/lib/auth";
import { startEmailVerification } from "@/lib/verification";
import { setBackupContact } from "@/lib/backup-contact";

/** El usuario corrige sus propios datos. Si cambia el correo, se envía un enlace nuevo para confirmarlo. */
export const PATCH = guard(async (request) => {
  const current = await requireUser();
  const body = await readJson(request);
  const input = profileFromBody(body);
  const { user, emailChanged } = updateProfile(current.id, input, "self");
  if (Object.keys(input).length > 0) {
    audit(current, "usuario.datos_propios", { type: "usuario", id: current.id }, { campos: Object.keys(input) });
  }
  // Contacto de respaldo (teléfono chileno o correo), distinto del principal. Se valida en el servidor.
  let backupContact: { display: string; type: string } | null = null;
  if (body.backupContact !== undefined && body.backupContact !== null) {
    const saved = setBackupContact(current.id, body.backupContact);
    backupContact = { display: saved.display, type: saved.type };
    audit(current, "usuario.respaldo", { type: "usuario", id: current.id }, { tipo: saved.type, origen: "cuenta" });
  }
  let delivery: string | null = null;
  if (emailChanged) {
    try {
      delivery = await startEmailVerification(user, { skipRate: true });
    } catch (error) {
      console.error("[carga360go] No se pudo enviar la verificación del correo nuevo", error);
    }
  }
  return NextResponse.json({ user, emailChanged, sent: delivery === "smtp", backupContact });
});
