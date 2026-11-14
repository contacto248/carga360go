import { quoteFromCache, publicView } from "./engine";

/** Dato de costo para tarjetas de cargas (componente de cliente): calculado en el servidor, sin red. */
export type CostHint = { total: number | null; complete: boolean; method: "motor" | "respaldo_linea_recta"; km: number | null; min: number | null; max: number | null };

export function costHintFor(load: { origin: string; destination: string; equipment: string; weightT?: number | null }): CostHint | null {
  try {
    const result = quoteFromCache({ origin: load.origin, destination: load.destination, equipment: load.equipment, weightT: load.weightT ?? null });
    if (!result) return null;
    const view = publicView(result, true);
    if (result.method === "motor") return { total: view.costoTotal, complete: view.complete, method: "motor", km: view.km, min: null, max: null };
    if (result.fallback) return { total: null, complete: false, method: "respaldo_linea_recta", km: result.fallback.km, min: result.fallback.min, max: result.fallback.max };
    return null;
  } catch {
    return null;
  }
}
