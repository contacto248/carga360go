/**
 * Vistas nuevas del recorrido. Apagadas por defecto.
 * Solo el texto exacto "true" enciende. El hijo además exige UI_OPS_ENABLED "true".
 * "TRUE", "1", "yes" y espacios quedan apagados.
 * No enciende OPS_*, pagos ni KYC.
 */

export const UI_OPS_MASTER = "UI_OPS_ENABLED";

export const UI_VISTA_FLAGS = {
  "/torre/analytics": "UI_ANALYTICS_ENABLED",
  "/torre/copiloto": "UI_COPILOTO_ENABLED",
  "/torre/administracion": "UI_ADMIN_ENABLED",
} as const;

export type UiVistaPath = keyof typeof UI_VISTA_FLAGS;

type FlagEnv = Record<string, string | undefined>;

export function uiExactTrue(name: string, env: FlagEnv = process.env): boolean {
  return env[name] === "true";
}

/** true solo si el maestro y el hijo son el texto exacto "true". */
export function uiVistaEnabled(flag: string, env: FlagEnv = process.env): boolean {
  return uiExactTrue(UI_OPS_MASTER, env) && uiExactTrue(flag, env);
}

export function uiVistaHidden(pathname: string, env: FlagEnv = process.env): boolean {
  const path = (pathname.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  const flag = UI_VISTA_FLAGS[path as UiVistaPath];
  if (!flag) return false;
  return !uiVistaEnabled(flag, env);
}
