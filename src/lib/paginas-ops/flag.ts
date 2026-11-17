/**
 * Vistas nuevas de operación: Operaciones, Tracking y Transportistas.
 * Apagadas por defecto. Solo el texto exacto "true" enciende.
 * "TRUE", "1", "yes" y espacios quedan apagadas y el middleware responde 404.
 */
export const UI_PAGINAS_OPS_FLAG = "UI_PAGINAS_OPS_ENABLED";

export const PAGINAS_OPS_RUTAS = ["/operaciones", "/tracking", "/transportistas"] as const;

type FlagEnv = Record<string, string | undefined>;

export function paginasOpsEnabled(env: FlagEnv = process.env): boolean {
  return env.UI_PAGINAS_OPS_ENABLED === "true";
}

export function paginasOpsHidden(pathname: string, env: FlagEnv = process.env): boolean {
  const path = (pathname.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  if (!PAGINAS_OPS_RUTAS.some((ruta) => ruta === path)) return false;
  return !paginasOpsEnabled(env);
}
