import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { profileFromBody, updateProfile } from "@/lib/auth";
import { startEmailVerification } from "@/lib/verification";

/** El usuario corrige sus propios datos. Si cambia el correo, se envía un enlace nuevo para confirmarlo. */
export const PATCH = guard(async (request) => {
  const current = await requireUser();
  const input = profileFromBody(await readJson(request));
  const { user, emailChanged } = updateProfile(current.id, input, "self");
  audit(current, "usuario.datos_propios", { type: "usuario", id: current.id }, { campos: Object.keys(input) });
  let delivery: string | null = null;
  if (emailChanged) {
    try {
      delivery = await startEmailVerification(user, { skipRate: true });
    } catch (error) {
      console.error("[carga360go] No se pudo enviar la verificación del correo nuevo", error);
    }
  }
  return NextResponse.json({ user, emailChanged, sent: delivery === "smtp" });
});
