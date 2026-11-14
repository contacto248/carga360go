import { COOKIE_NAME, userFromToken } from "./auth";
import type { PublicUser } from "./types";

/** Token de `Authorization: Bearer <token>` (apps móviles). */
export function bearerToken(headers: Headers): string | null {
  const header = headers.get("authorization") ?? "";
  const match = /^Bearer\s+([A-Za-z0-9_\-.~+/=]{20,200})\s*$/i.exec(header);
  return match?.[1] ?? null;
}

function cookieToken(headers: Headers): string | null {
  const raw = headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === COOKIE_NAME) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim()) || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Token de sesión de la solicitud. Si viene un encabezado Bearer se usa solo ese
 * (la cookie se ignora), así una solicitud con token nunca depende de credenciales ambientales.
 */
export function sessionTokenFrom(headers: Headers): { token: string | null; source: "bearer" | "cookie" | null } {
  const bearer = bearerToken(headers);
  if (bearer) return { token: bearer, source: "bearer" };
  if (headers.get("authorization")) return { token: null, source: "bearer" };
  const cookie = cookieToken(headers);
  return cookie ? { token: cookie, source: "cookie" } : { token: null, source: null };
}

export function userFromHeaders(headers: Headers): PublicUser | null {
  return userFromToken(sessionTokenFrom(headers).token);
}

export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return forwarded || "local";
}
