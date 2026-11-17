import { NextResponse } from "next/server";
import { AppError } from "./errors";
import { getCurrentUser } from "./current-user";
import { bearerToken } from "./request-auth";
import type { PublicUser, Role, VerificationStatus } from "./types";

type RouteCtx = { params: Promise<Record<string, string>> };

export function jsonError(error: unknown) {
  if (error instanceof AppError) {
    const body: { error: string; code?: string; regla_policy?: string } = { error: error.message };
    if (error.code) body.code = error.code;
    if (error.reglaPolicy) body.regla_policy = error.reglaPolicy;
    return NextResponse.json(body, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Error interno." }, { status: 500 });
}

export function assertSameOrigin(request: Request) {
  const cookie = request.headers.get("cookie")?.trim() ?? "";
  // Exime solo Bearer sin cookie (app móvil / server-to-server): no hay credencial ambiental.
  // Si la petición también trae cookie, no se exime y sigue el control de origen.
  if (bearerToken(request.headers) && !cookie) return;
  // Navegadores modernos envían Sec-Fetch-Site: se rechaza todo POST con cookie que venga de otro sitio.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") throw new AppError("Origen no permitido.", 403);
  const origin = request.headers.get("origin");
  // Mutaciones con cookie de sesión sin Origin ni Sec-Fetch-Site: clientes no-browser deben usar Bearer.
  // Cierra CSRF clásico cuando el navegador omite señales de origen.
  if (!origin && !fetchSite && /(?:^|;\s*)c360_session=/.test(cookie)) {
    throw new AppError("Origen no permitido.", 403);
  }
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("Origen no permitido.", 403);
  }
  if (originHost !== host) throw new AppError("Origen no permitido.", 403);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new AppError("El cuerpo de la solicitud no es JSON válido.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("El cuerpo de la solicitud no es JSON válido.");
  }
  return value as Record<string, unknown>;
}

export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

export async function requireRoles(roles: Role[]): Promise<PublicUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AppError("No tienes permiso para esta acción.", 403);
  return user;
}

export function asStatus(value: unknown): VerificationStatus {
  if (value === "pendiente" || value === "verificado" || value === "rechazado") return value;
  throw new AppError("Estado de verificación no válido.");
}

export function guard(handler: (request: Request, ctx: RouteCtx) => Promise<Response>) {
  return async (request: Request, ctx: RouteCtx) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") assertSameOrigin(request);
      return await handler(request, ctx);
    } catch (error) {
      return jsonError(error);
    }
  };
}
