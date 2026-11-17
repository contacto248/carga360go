import type { PublicUser } from "@/lib/types";
import { isEnabled, type OpsFlag } from "./flags";

const LOCATION_PATH = /^\/viajes\/[^/]+\/ubicacion\/?$/;
const TRACKING_PATH = /^\/seguimiento\/[^/]+\/?$/;

export type OpsPageRule = { flag: OpsFlag };

function barePath(pathname: string): string {
  return pathname.split("?")[0]?.split("#")[0] ?? "";
}

/**
 * Páginas OPS que no deben renderizarse si su flag está apagado o quien entra no es admin.
 * /admin/ops/** cubre las que vengan. Asignación usa su flag hijo.
 */
export function opsPageRule(pathname: string): OpsPageRule | null {
  const path = barePath(pathname);
  if (path === "/admin/ops/asignacion" || path.startsWith("/admin/ops/asignacion/")) {
    return { flag: "OPS_ALLOCATION_ENABLED" };
  }
  if (path === "/admin/ops" || path.startsWith("/admin/ops/")) {
    return { flag: "OPS_FEATURE_ENABLED" };
  }
  if (LOCATION_PATH.test(path)) return { flag: "OPS_FEATURE_ENABLED" };
  if (TRACKING_PATH.test(path)) return { flag: "OPS_FEATURE_ENABLED" };
  return null;
}

/** true: el middleware corta con 404 antes de renderizar. */
export function opsPageHidden(pathname: string, user: PublicUser | null): boolean {
  const rule = opsPageRule(pathname);
  if (!rule) return false;
  if (!isEnabled(rule.flag)) return true;
  // El enlace del cliente se abre con el token. No pide sesión de administración.
  if (TRACKING_PATH.test(barePath(pathname))) return false;
  return user?.role !== "admin";
}
