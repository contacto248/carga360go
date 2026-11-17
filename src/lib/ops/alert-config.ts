/**
 * Umbrales por defecto, en minutos.
 *
 * El plan de QA anota detención 30 y sin señal 20.
 * Este código conserva detención 20, sin señal 45 y atraso 30. Esos números se usan
 * si la variable falta, está vacía o no es un entero entre 1 y 10080.
 * Un umbral guardado en ops_alert_rules para ese envío pisa el default de la torre
 * (atraso, detencion, sin_senal). Las incidencias nuevas solo leen el entorno.
 */
export const DETENCION_MIN_DEFAULT = 20;
export const SIN_SENAL_MIN_DEFAULT = 45;
export const ATRASO_MIN_DEFAULT = 30;
export const RETIRO_MIN_DEFAULT = 30;
export const ESPERA_DESTINO_MIN_DEFAULT = 60;
export const DESVIO_MIN_DEFAULT = 15;
export const DESVIO_PUNTOS_DEFAULT = 3;
export const SIN_ASIGNAR_MIN_DEFAULT = 1440;
export const EVIDENCIA_MIN_DEFAULT = 120;
export const CIERRE_MIN_DEFAULT = 2880;
export const TEMPERATURA_MIN_DEFAULT = 15;
export const SIN_CONTACTO_INTENTOS_DEFAULT = 3;

const MAX_MIN = 10_080;

export function minutesFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim() ?? "";
  if (!/^[1-9]\d{0,4}$/.test(raw)) return fallback;
  const value = Number(raw);
  if (value > MAX_MIN) return fallback;
  return value;
}

/** Entero de 1 a max. Un valor ausente o inválido vuelve al default. */
export function countFromEnv(name: string, fallback: number, max: number): number {
  const raw = process.env[name]?.trim() ?? "";
  if (!/^[1-9]\d{0,4}$/.test(raw)) return fallback;
  const value = Number(raw);
  if (value > max) return fallback;
  return value;
}

/** Porcentaje entero de 1 a 100. Sin valor o inválido: null y la regla queda inactiva. */
export function percentFromEnv(name: string): number | null {
  const raw = process.env[name]?.trim() ?? "";
  if (!/^[1-9]\d{0,2}$/.test(raw)) return null;
  const value = Number(raw);
  if (value > 100) return null;
  return value;
}

export function detencionMinDefault(): number {
  return minutesFromEnv("OPS_ALERTA_DETENCION_MIN", DETENCION_MIN_DEFAULT);
}

export function sinSenalMinDefault(): number {
  return minutesFromEnv("OPS_ALERTA_SIN_SENAL_MIN", SIN_SENAL_MIN_DEFAULT);
}

export function atrasoMinDefault(): number {
  return minutesFromEnv("OPS_ALERTA_ATRASO_MIN", ATRASO_MIN_DEFAULT);
}

export function retiroMinDefault(): number {
  return minutesFromEnv("OPS_ALERTA_RETIRO_MIN", RETIRO_MIN_DEFAULT);
}

export function esperaDestinoMinDefault(): number {
  return minutesFromEnv("OPS_ALERTA_ESPERA_DESTINO_MIN", ESPERA_DESTINO_MIN_DEFAULT);
}

export function desvioMinDefault(): number {
  return minutesFromEnv("OPS_ALERTA_DESVIO_MIN", DESVIO_MIN_DEFAULT);
}

export function desvioPuntosDefault(): number {
  return countFromEnv("OPS_ALERTA_DESVIO_PUNTOS", DESVIO_PUNTOS_DEFAULT, 20);
}

export function sinAsignarMinDefault(): number {
  return minutesFromEnv("OPS_ALERTA_SIN_ASIGNAR_MIN", SIN_ASIGNAR_MIN_DEFAULT);
}

export function evidenciaMinDefault(): number {
  return minutesFromEnv("OPS_ALERTA_EVIDENCIA_MIN", EVIDENCIA_MIN_DEFAULT);
}

export function cierreMinDefault(): number {
  return minutesFromEnv("OPS_ALERTA_CIERRE_MIN", CIERRE_MIN_DEFAULT);
}

export function temperaturaMinDefault(): number {
  return minutesFromEnv("OPS_ALERTA_TEMPERATURA_MIN", TEMPERATURA_MIN_DEFAULT);
}

export function sinContactoIntentosDefault(): number {
  return countFromEnv("OPS_ALERTA_SIN_CONTACTO_INTENTOS", SIN_CONTACTO_INTENTOS_DEFAULT, 20);
}

export function diferenciaCostoPct(): number | null {
  return percentFromEnv("OPS_ALERTA_DIFERENCIA_COSTO_PCT");
}
