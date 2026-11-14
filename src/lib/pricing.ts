import { roadKm } from "./geo";
import type { EquipmentId } from "./types";

/**
 * Precio sugerido REFERENCIAL. Fórmula: distancia vial estimada (km) × tarifa por km del tipo de equipo,
 * con un mínimo por viaje. Valores netos, sin IVA ni peajes.
 *
 * Base pública de las tarifas (consultada nov-2026):
 *  - Guías de mercado chilenas informan carga general nacional entre ~$800 y ~$1.500 CLP/km y
 *    carga especial (cama baja, con equipos) entre ~$2.000 y ~$3.500 CLP/km.
 *  - El mínimo por viaje toma como referencia tarifas publicadas de fletes urbanos con camión (~$120.000).
 * Equipos con requisitos extra (frío, estanque, peligrosa) aplican un recargo sobre carga general.
 * Se puede ajustar sin tocar el código con la variable PRICE_RATES_JSON, ej: {"rampla_plana":[900,1500]}.
 */
export const DEFAULT_RATES: Record<EquipmentId, [number, number]> = {
  rampla_plana: [900, 1500],
  sider: [900, 1500],
  furgon_seco: [900, 1500],
  portacontenedor: [900, 1500],
  tolva: [950, 1600],
  otro: [900, 1500],
  camion_34: [800, 1200],
  refrigerado: [1100, 1800],
  estanque: [1100, 1800],
  portaautos: [1000, 1600],
  peligrosa: [1300, 2200],
  cama_baja: [2000, 3500],
};

export const MIN_TRIP_CLP: Record<"liviano" | "pesado", number> = { liviano: 60000, pesado: 120000 };

function rates(): Record<string, [number, number]> {
  const raw = process.env.PRICE_RATES_JSON;
  if (!raw) return DEFAULT_RATES;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const merged: Record<string, [number, number]> = { ...DEFAULT_RATES };
    for (const [key, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number" && n > 0) && value[0] <= value[1]) {
        merged[key] = [value[0], value[1]];
      }
    }
    return merged;
  } catch {
    return DEFAULT_RATES;
  }
}

export type PriceEstimate = { km: number; min: number; max: number; rateMin: number; rateMax: number };

function round(value: number): number {
  return Math.round(value / 10000) * 10000;
}

export function estimateByKm(km: number, equipment: string): PriceEstimate | null {
  if (!Number.isFinite(km) || km <= 0) return null;
  const table = rates();
  const [rateMin, rateMax] = table[equipment] ?? table.otro;
  const floor = equipment === "camion_34" ? MIN_TRIP_CLP.liviano : MIN_TRIP_CLP.pesado;
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
