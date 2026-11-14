import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CHALLENGE_COOKIE, TRUST_COOKIE, challengeCookieOptions, isTrustedDevice, startAdminChallenge } from "@/lib/admin-2fa";
import { audit } from "@/lib/audit";
import { cookieOptions, createSession, verifyCredentials } from "@/lib/auth";
import { guard, readJson } from "@/lib/api";
import { LOGIN_LIMIT, rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-auth";
import { setSessionCookie } from "@/lib/current-user";

export const POST = guard(async (request) => {
  const ip = clientIp(request.headers);
  rateLimit(`login:${ip}`, LOGIN_LIMIT.limit, LOGIN_LIMIT.windowMs);
  const body = await readJson(request);
  const user = verifyCredentials(String(body.email ?? ""), String(body.password ?? ""));
  if (user.role !== "admin") {
    await setSessionCookie(createSession(user.id));
    return NextResponse.json({ user });
  }
  // Administrador: dispositivo de confianza (30 días) o código de 6 dígitos por correo.
  const jar = await cookies();
  if (isTrustedDevice(user.id, jar.get(TRUST_COOKIE)?.value)) {
    await setSessionCookie(createSession(user.id, { mfa: true }));
    audit(user, "admin.ingreso_dispositivo_confiable", { type: "usuario", id: user.id }, null, ip);
    return NextResponse.json({ user });
  }
  const challenge = await startAdminChallenge(user, ip);
  jar.set(CHALLENGE_COOKIE, challenge.challengeId, challengeCookieOptions(cookieOptions().secure));
  return NextResponse.json({ twoFactor: true, sentTo: challenge.sentTo, expiresInMinutes: 10 });
});
