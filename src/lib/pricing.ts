import { roadKm } from "./geo";
import { DEFAULT_RATES, MIN_TRIP_CLP } from "./freight-defaults";

export { DEFAULT_RATES, MIN_TRIP_CLP };

/**
 * Precio sugerido REFERENCIAL. Fórmula: distancia vial estimada (km) × tarifa por km del tipo de equipo,
 * con un mínimo por viaje. Valores netos, sin IVA ni peajes.
 *
 * Base pública de las tarifas (consultada nov-2026):
 *  - Guías de mercado chilenas informan carga general nacional entre ~$800 y ~$1.500 CLP/km y
 *    carga especial (cama baja, con equipos) entre ~$2.000 y ~$3.500 CLP/km.
 *  - El mínimo por viaje toma como referencia tarifas publicadas de fletes urbanos con camión (~$120.000).
 * Equipos con requisitos extra (frío, estanque, peligrosa) aplican un recargo sobre carga general.
 * /api/estimacion lee tarifa, factor de ruta y mínimo desde la base (migración 16).
 * Estas constantes son la semilla y el respaldo si la base no tiene el valor.
 * PRICE_RATES_JSON sigue pudiendo ajustar esta función pura, no la lectura de la API.
 */
export type RateOverride = {
  rates?: Record<string, [number, number]>;
  minLiviano?: number;
  minPesado?: number;
  /** La API lo activa para usar solo las tarifas de la base, sin PRICE_RATES_JSON. */
  soloEstasTarifas?: boolean;
};

function validRates(input?: Record<string, [number, number]>): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number" && n > 0) && value[0] <= value[1]) {
      out[key] = [value[0], value[1]];
    }
  }
  return out;
}

function rates(extra?: Record<string, [number, number]>, soloEstas?: boolean): Record<string, [number, number]> {
  const merged: Record<string, [number, number]> = { ...DEFAULT_RATES, ...validRates(extra) };
  if (soloEstas) return merged;
  const raw = process.env.PRICE_RATES_JSON;
  if (!raw) return merged;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number" && n > 0) && value[0] <= value[1]) {
        merged[key] = [value[0], value[1]];
      }
    }
    return merged;
  } catch {
    return merged;
  }
}

export type PriceEstimate = { km: number; min: number; max: number; rateMin: number; rateMax: number };

function round(value: number): number {
  return Math.round(value / 10000) * 10000;
}

export function estimateByKm(km: number, equipment: string, override?: RateOverride): PriceEstimate | null {
  if (!Number.isFinite(km) || km <= 0) return null;
  const table = rates(override?.rates, override?.soloEstasTarifas);
  const [rateMin, rateMax] = table[equipment] ?? table.otro;
  const floorLiviano = override?.minLiviano ?? MIN_TRIP_CLP.liviano;
  const floorPesado = override?.minPesado ?? MIN_TRIP_CLP.pesado;
  const floor = equipment === "camion_34" ? floorLiviano : floorPesado;
  return {
    km,
    rateMin,
    rateMax,
    min: round(Math.max(floor, km * rateMin)),
    max: round(Math.max(floor * 1.3, km * rateMax)),
  };
}

export function estimatePrice(origin: string, destination: string, equipment: string): PriceEstimate | null {
  const km = roadKm(origin, destination);
  if (km === null || km === 0) return null;
  return estimateByKm(km, equipment);
}

export const PRICE_DISCLAIMER =
  "Rango referencial: km estimados (línea recta × 1,25) × tarifa por km según el equipo, con mínimo por viaje. Neto, sin IVA ni peajes. No es una cotización: el precio lo acuerdan las partes.";
