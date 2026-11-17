import { assertSameOrigin, jsonError } from "../api";
import { assertEnabled, type OpsFlag } from "./flags";

type RouteCtx = { params: Promise<Record<string, string>> };

/**
 * Igual que guard(), pero el flag maestro se evalúa antes del control de origen:
 * con OPS_FEATURE_ENABLED apagado toda ruta /api/ops responde 404.
 */
export function opsGuard(handler: (request: Request, ctx: RouteCtx) => Promise<Response>, child?: OpsFlag) {
  return async (request: Request, ctx: RouteCtx) => {
    try {
      assertEnabled("OPS_FEATURE_ENABLED");
      if (child) assertEnabled(child);
      if (request.method !== "GET" && request.method !== "HEAD") assertSameOrigin(request);
      return await handler(request, ctx);
    } catch (error) {
      return jsonError(error);
    }
  };
}

/** Rutas de procurement: maestro y OPS_PROCUREMENT_ENABLED. Apagado ⇒ 404. */
export function procurementGuard(handler: (request: Request, ctx: RouteCtx) => Promise<Response>) {
  return opsGuard(handler, "OPS_PROCUREMENT_ENABLED");
}

/** Rutas de asignación: maestro y OPS_ALLOCATION_ENABLED. Apagado ⇒ 404. */
export function allocationGuard(handler: (request: Request, ctx: RouteCtx) => Promise<Response>) {
  return opsGuard(handler, "OPS_ALLOCATION_ENABLED");
}
