import { NextResponse } from "next/server";
import { AppError } from "./errors";
import { getCurrentUser } from "./current-user";
import { bearerToken } from "./request-auth";
import type { PublicUser, Role, VerificationStatus } from "./types";

type RouteCtx = { params: Promise<Record<string, string>> };

export function jsonError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(error.code ? { error: error.message, code: error.code } : { error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Error interno." }, { status: 500 });
}

export function assertSameOrigin(request: Request) {
  // Con token Bearer no hay credencial ambiental (cookie), así que no aplica CSRF.
  if (bearerToken(request.headers)) return;
  // Navegadores modernos envían Sec-Fetch-Site: se rechaza todo POST con cookie que venga de otro sitio.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") throw new AppError("Origen no permitido.", 403);
  const origin = request.headers.get("origin");
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
