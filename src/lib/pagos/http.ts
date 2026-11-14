import { NextResponse } from "next/server";
import { AppError } from "../errors";
import { assertSameOrigin, readJson } from "../api";
import { userFromHeaders } from "../request-auth";
import type { PublicUser, Role } from "../types";
import { paymentsEnabled } from "./config";
import { MpError } from "./mp-client";

type RouteCtx = { params: Promise<Record<string, string>> };

/** Errores en el formato de la spec: { error: "codigo", message: "texto" }. Sin stack ni secretos. */
export function payError(error: unknown) {
  if (error instanceof AppError) return NextResponse.json({ error: error.code ?? "solicitud_invalida", message: error.message }, { status: error.status });
  if (error instanceof MpError) {
    return NextResponse.json({ error: error.code, message: "No se pudo completar la operación con Mercado Pago." }, { status: error.status >= 500 ? 502 : error.status });
  }
  console.error("[carga360go] pagos:", error instanceof Error ? error.message : "error");
  return NextResponse.json({ error: "error_interno", message: "Error interno." }, { status: 500 });
}

export const DISABLED_RESPONSE = () =>
  NextResponse.json({ error: "pagos_deshabilitados", message: "El pago en plataforma no está habilitado." }, { status: 403 });

/**
 * Envoltorio de las rutas /api/pagos con sesión. Con el flag apagado responde 403 sin tocar la base.
 * Lee la sesión desde la propia Request (cookie o Bearer), igual que el resto del sitio.
 */
export function payRoute(roles: Role[] | "any", handler: (request: Request, user: PublicUser, ctx: RouteCtx) => Promise<Response>) {
  return async (request: Request, ctx: RouteCtx) => {
    if (!paymentsEnabled()) return DISABLED_RESPONSE();
    try {
      if (request.method !== "GET" && request.method !== "HEAD") assertSameOrigin(request);
      const user = userFromHeaders(request.headers);
      if (!user) throw new AppError("Debes iniciar sesión.", 401, "sin_sesion");
      if (roles !== "any" && !roles.includes(user.role)) throw new AppError("No tienes permiso para esta acción.", 403, "sin_permiso");
      return await handler(request, user, ctx);
    } catch (error) {
      return payError(error);
    }
  };
}

export { readJson };
