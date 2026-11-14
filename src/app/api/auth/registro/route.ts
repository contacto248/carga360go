import { NextResponse } from "next/server";
import { registerUser } from "@/lib/auth";
import { guard, readJson } from "@/lib/api";
import { REGISTER_LIMIT, rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-auth";
import { setSessionCookie } from "@/lib/current-user";
import { startEmailVerification } from "@/lib/verification";
import { audit } from "@/lib/audit";
import { notifyNewRegistration } from "@/lib/admin-notify";
import { assertHuman } from "@/lib/security";
import { assertLegalAccepted } from "@/lib/privacy";

export const POST = guard(async (request) => {
  rateLimit(`register:${clientIp(request.headers)}`, REGISTER_LIMIT.limit, REGISTER_LIMIT.windowMs);
  const body = await readJson(request);
  assertHuman(body);
  const { privacyVersion, termsVersion } = assertLegalAccepted(body);
  const result = registerUser({
    role: String(body.role ?? ""),
    razonSocial: String(body.razonSocial ?? ""),
    rut: String(body.rut ?? ""),
    contactName: String(body.contactName ?? ""),
    email: String(body.email ?? ""),
    password: String(body.password ?? ""),
    whatsapp: String(body.whatsapp ?? ""),
    city: String(body.city ?? ""),
    privacyVersion,
    termsVersion,
  });
  await setSessionCookie(result.token);
  const ip = clientIp(request.headers);
  audit(result.user, "usuario.registro", { type: "usuario", id: result.user.id }, { role: result.user.role }, ip);
  audit(result.user, "usuario.privacidad_aceptada", { type: "usuario", id: result.user.id }, { version: privacyVersion, terminos: termsVersion }, ip);
  notifyNewRegistration(result.user);
  // Todas las cuentas confirman su correo (para publicar se exige el correo verificado).
  try {
    await startEmailVerification(result.user, { skipRate: true });
  } catch (error) {
    console.error("[carga360go] No se pudo iniciar la verificación de correo", error);
  }
  return NextResponse.json({ user: result.user });
});
