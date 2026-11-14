import { cookies, headers } from "next/headers";
import { COOKIE_NAME, cookieOptions, revokeToken, userFromToken } from "./auth";
import { sessionTokenFrom } from "./request-auth";
import type { PublicUser } from "./types";

/**
 * Usuario de la solicitud actual. Acepta `Authorization: Bearer <token>` (apps móviles)
 * o la cookie httpOnly de la web. Ambas usan la misma tabla `sessions` y las mismas reglas de acceso.
 */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const hdrs = await headers();
  const fromHeader = sessionTokenFrom(hdrs);
  if (fromHeader.source === "bearer") return userFromToken(fromHeader.token);
  const jar = await cookies();
  return userFromToken(jar.get(COOKIE_NAME)?.value);
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, cookieOptions());
}

export async function clearSessionCookie() {
  const hdrs = await headers();
  const fromHeader = sessionTokenFrom(hdrs);
  if (fromHeader.source === "bearer") revokeToken(fromHeader.token);
  const jar = await cookies();
  revokeToken(jar.get(COOKIE_NAME)?.value);
  jar.set(COOKIE_NAME, "", { ...cookieOptions(), maxAge: 0 });
}
