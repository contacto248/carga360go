/**
 * Umbrales por defecto de detención y sin señal, en minutos.
 *
 * El plan de QA anota detención 30 y sin señal 20.
 * Este código conserva 20 y 45. Esos números se usan si la variable falta,
 * está vacía o no es un entero entre 1 y 10080. No cambian el comportamiento
 * de una instalación que no define las variables.
 * Un umbral guardado en ops_alert_rules para ese envío pisa este default.
 * El atraso sigue fijo en 30 minutos.
 */
export const DETENCION_MIN_DEFAULT = 20;
export const SIN_SENAL_MIN_DEFAULT = 45;

const MAX_MIN = 10_080;

export function minutesFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim() ?? "";
  if (!/^[1-9]\d{0,4}$/.test(raw)) return fallback;
  const value = Number(raw);
  if (value > MAX_MIN) return fallback;
  return value;
}

export function detencionMinDefault(): number {
  return minutesFromEnv("OPS_ALERTA_DETENCION_MIN", DETENCION_MIN_DEFAULT);
}

export function sinSenalMinDefault(): number {
  return minutesFromEnv("OPS_ALERTA_SIN_SENAL_MIN", SIN_SENAL_MIN_DEFAULT);
}
