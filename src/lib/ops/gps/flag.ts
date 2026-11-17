import { isEnabled } from "../flags";

/** OPS-301 sigue el flag maestro. No hay un flag propio de GPS. */
export function opsGpsEnabled(): boolean {
  return isEnabled("OPS_FEATURE_ENABLED");
}

/** Enlace de la web del conductor. Null con el maestro apagado: la ficha de la carga no cambia. */
export function driverLocationHref(loadId: string, enabled = opsGpsEnabled()): string | null {
  if (!enabled || !loadId) return null;
  return `/viajes/${loadId}/ubicacion`;
}
