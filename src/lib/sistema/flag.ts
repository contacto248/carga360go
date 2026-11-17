/**
 * Vista del sistema de diseño. Apagada por defecto.
 * Solo el texto exacto "true" enciende. "TRUE", "1", "yes" y espacios quedan apagados.
 */
export const UI_SISTEMA_FLAG = "UI_SISTEMA_ENABLED";

type FlagEnv = Record<string, string | undefined>;

export function sistemaEnabled(env: FlagEnv = process.env): boolean {
  return env.UI_SISTEMA_ENABLED === "true";
}

export function sistemaPageHidden(pathname: string, env: FlagEnv = process.env): boolean {
  const path = (pathname.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  if (path !== "/sistema") return false;
  return !sistemaEnabled(env);
}
