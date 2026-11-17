import { AppError } from "../errors";
import { rateLimit } from "../rate-limit";
import { dailySpendCapUsd, ROUTER_RATE_WINDOW_MS, routerTenantLimit, routerUserLimit } from "./config";
import { routerSpendUsd } from "./usage-store";

/** Cupo por usuario y por tenant, y tope diario de gasto antes de llamar al proveedor. */
export function assertRouterLimits(userId: string, tenantId: string | null, now = new Date()): void {
  rateLimit(`ai-router:user:${userId}`, routerUserLimit(), ROUTER_RATE_WINDOW_MS);
  rateLimit(`ai-router:tenant:${tenantId ?? "sin-tenant"}`, routerTenantLimit(), ROUTER_RATE_WINDOW_MS);
  if (routerSpendUsd(userId, tenantId, now) >= dailySpendCapUsd()) {
    throw new AppError("Tope diario de gasto alcanzado.", 429, "tope_diario");
  }
}
