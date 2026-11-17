import { assertSameOrigin, jsonError } from "../api";
import { assertEnabled } from "./flags";

type RouteCtx = { params: Promise<Record<string, string>> };

/**
 * Igual que guard(), pero el flag maestro se evalúa antes del control de origen:
 * con OPS_FEATURE_ENABLED apagado toda ruta /api/ops responde 404.
 */
export function opsGuard(handler: (request: Request, ctx: RouteCtx) => Promise<Response>) {
  return async (request: Request, ctx: RouteCtx) => {
    try {
      assertEnabled("OPS_FEATURE_ENABLED");
      if (request.method !== "GET" && request.method !== "HEAD") assertSameOrigin(request);
      return await handler(request, ctx);
    } catch (error) {
      return jsonError(error);
    }
  };
}
