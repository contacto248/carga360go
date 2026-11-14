import { NextResponse } from "next/server";
import { acceptPrivacyFor } from "@/lib/accreditation";
import { guard, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { assertLegalAccepted } from "@/lib/privacy";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

/** Cuentas existentes aceptan la versión vigente de la Política de Privacidad y de los Términos de uso (web con cookie o app con Bearer). */
export const POST = guard(async (request) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  const { privacyVersion: version, termsVersion } = assertLegalAccepted(await readJson(request));
  acceptPrivacyFor(user.id);
  audit(user, "usuario.privacidad_aceptada", { type: "usuario", id: user.id }, { version, terminos: termsVersion, momento: "ingreso" }, clientIp(request.headers));
  return NextResponse.json({ ok: true, version, termsVersion });
});
