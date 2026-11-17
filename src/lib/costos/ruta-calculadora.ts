import { lastDiesel } from "./diesel";
import { DEFAULT_VIATICO_CLP, ROUTE_COST_NOTICE, computeRouteCost, routeCostLines, type RouteCostLines } from "./ruta-costo";
import type { QuoteResult } from "./engine";

export type RutaToll = {
  name: string;
  route: string;
  concession: string;
  category: string;
  amount: number;
  sourceUrl: string | null;
  validTo: string | null;
  checkedAt: string | null;
};

/** Datos que la calculadora muestra y deja editar. El total no lleva comisiones ni planes. */
export type RutaCalculadora = {
  notice: string;
  km: number | null;
  kmPerL: number;
  days: number;
  viaticoDia: number;
  dieselPrice: number | null;
  dieselDate: string | null;
  dieselSource: string;
  dieselZone: string | null;
  tollsClp: number;
  tollsPartial: boolean;
  tollsNote: string | null;
  provider: string | null;
  attribution: string | null;
  tolls: RutaToll[];
  lines: RouteCostLines;
};

/** Arma el desglose de la calculadora. Si hay un precio de diésel guardado, el total no queda pendiente. */
export function rutaCalculadoraDe(result: QuoteResult, now = new Date()): RutaCalculadora {
  const zone = result.diesel?.zone ?? null;
  const stored = zone ? lastDiesel(zone, now) : null;
  const known = result.tolls.filter((toll) => toll.amountGross != null);
  const missing = result.tolls.filter((toll) => toll.amountGross == null);
  const peajes = result.components.find((component) => component.key === "peajes");
  const tollsPartial = missing.length > 0 || peajes?.status === "pendiente" || peajes?.status === "vencido";
  const tollsClp = known.reduce((sum, toll) => sum + (toll.amountGross as number), 0);
  const km = result.route?.km ?? null;
  const kmPerL = result.diesel?.kmPerL && result.diesel.kmPerL > 0 ? result.diesel.kmPerL : 2.6;
  const cost = computeRouteCost({
    km: km ?? 0,
    kmPerL,
    dieselPrice: km == null ? null : (stored?.price ?? null),
    tollsClp,
    viaticoDia: DEFAULT_VIATICO_CLP,
  });
  const note = tollsPartial
    ? "La suma incluye solo plazas con tarifa pública verificada. Las que no tienen dato comprobable no se inventan ni se suman."
    : known.length
      ? null
      : "La ruta no cruza plazas de peaje con tarifa pública cargada.";
  return {
    notice: ROUTE_COST_NOTICE,
    km,
    kmPerL,
    days: cost.days,
    viaticoDia: DEFAULT_VIATICO_CLP,
    dieselPrice: stored?.price ?? null,
    dieselDate: stored?.fetchedAt ? stored.fetchedAt.slice(0, 10) : null,
    dieselSource: stored?.sourceLabel ?? "Sin datos",
    dieselZone: zone,
    tollsClp,
    tollsPartial,
    tollsNote: note,
    provider: result.route?.provider ?? null,
    attribution: result.route?.attribution ?? null,
    tolls: known.map((toll) => ({
      name: toll.name,
      route: toll.route,
      concession: toll.concession,
      category: toll.categoryLabel,
      amount: toll.amountGross as number,
      sourceUrl: toll.sourceUrl,
      validTo: toll.validTo,
      checkedAt: toll.checkedAt,
    })),
    lines: routeCostLines(cost),
  };
}
