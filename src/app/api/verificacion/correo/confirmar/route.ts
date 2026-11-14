import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { appUrl } from "@/lib/mail";
import { confirmEmailToken } from "@/lib/verification";

/** Confirma el correo con POST (botón en /verificar-correo). Un GET de un antivirus no consume el enlace. */
export const POST = guard(async (request) => {
  const type = request.headers.get("content-type") || "";
  let token = "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    token = String(body?.token ?? "");
    return NextResponse.json({ ok: confirmEmailToken(token) });
  }
  const form = await request.formData().catch(() => null);
  token = String(form?.get("token") ?? "");
  const ok = confirmEmailToken(token);
  return NextResponse.redirect(`${appUrl()}/verificar-correo?estado=${ok ? "ok" : "error"}`, 303);
});
