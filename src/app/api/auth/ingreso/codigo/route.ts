import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CHALLENGE_COOKIE, TRUST_COOKIE, trustCookieOptions, trustDevice, verifyAdminChallenge } from "@/lib/admin-2fa";
import { cookieOptions } from "@/lib/auth";
import { guard, readJson } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-auth";
import { setSessionCookie } from "@/lib/current-user";

/** Segundo paso del ingreso del administrador: código de 6 dígitos enviado por correo. */
export const POST = guard(async (request) => {
  const ip = clientIp(request.headers);
  rateLimit(`login-code:${ip}`, 15, 10 * 60 * 1000);
  const body = await readJson(request);
  const jar = await cookies();
  const result = verifyAdminChallenge(jar.get(CHALLENGE_COOKIE)?.value, body.code, ip);
  const secure = cookieOptions().secure;
  jar.set(CHALLENGE_COOKIE, "", { ...trustCookieOptions(secure), maxAge: 0 });
  await setSessionCookie(result.token);
  if (body.trustDevice === true) {
    jar.set(TRUST_COOKIE, trustDevice(result.user.id, ip, request.headers.get("user-agent")), trustCookieOptions(secure));
  }
  return NextResponse.json({ user: result.user });
});
