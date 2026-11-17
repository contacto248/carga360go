/**
 * Costo de referencia de la ruta (calculadora): diésel, peajes y viático.
 * No incluye comisiones, planes ni margen.
 *
 * Días de viaje — jornada razonable de camión:
 * 500 km por día. Equivale a unas 8 h de conducción efectiva a ~62 km/h,
 * por debajo del tope de 5 h continuas y del descanso de 8 h dentro de cada
 * 24 h del art. 25 bis del Código del Trabajo. Días = max(1, ceil(km / 500)).
 * Un tramo de hasta 500 km es 1 día; 500,1 km son 2 días.
 */
export const JORNADA_CAMION_KM = 500;
export const DEFAULT_VIATICO_CLP = 20_000;
export const ROUTE_COST_NOTICE = "Valor estimativo de referencia; el valor final lo acuerdan las partes.";

export type RouteCostInput = {
  km: number;
  /** Rendimiento en km por litro. Debe ser mayor que 0. */
  kmPerL: number;
  /** Precio del diésel en CLP por litro. Null si no hay valor guardado ni ingresado. */
  dieselPrice: number | null;
  tollsClp: number;
  viaticoDia: number;
};

export type RouteCost = {
  km: number;
  kmPerL: number;
  liters: number;
  days: number;
  dieselPrice: number | null;
  dieselClp: number | null;
  tollsClp: number;
  viaticoDia: number;
  viaticoClp: number;
  total: number | null;
};

export function travelDays(km: number): number {
  if (!(km > 0)) return 1;
  return Math.max(1, Math.ceil(km / JORNADA_CAMION_KM - 1e-9));
}

function roundClp(value: number): number {
  return Math.round(value);
}

/** Cálculo puro. Con precio de diésel el total es diésel + peajes + viático. Sin precio, el total queda pendiente. */
export function computeRouteCost(input: RouteCostInput): RouteCost {
  const km = Number.isFinite(input.km) && input.km > 0 ? input.km : 0;
  const kmPerL = Number.isFinite(input.kmPerL) && input.kmPerL > 0 ? input.kmPerL : 0;
  const liters = kmPerL > 0 ? km / kmPerL : 0;
  const days = travelDays(km);
  const dieselPrice = input.dieselPrice != null && Number.isFinite(input.dieselPrice) && input.dieselPrice > 0 ? input.dieselPrice : null;
  const dieselClp = dieselPrice == null || kmPerL <= 0 ? null : roundClp(liters * dieselPrice);
  const tollsClp = Number.isFinite(input.tollsClp) ? Math.max(0, roundClp(input.tollsClp)) : 0;
  const viaticoDia = Number.isFinite(input.viaticoDia) ? Math.max(0, roundClp(input.viaticoDia)) : 0;
  const viaticoClp = days * viaticoDia;
  const total = dieselClp == null ? null : dieselClp + tollsClp + viaticoClp;
  return { km, kmPerL, liters, days, dieselPrice, dieselClp, tollsClp, viaticoDia, viaticoClp, total };
}

export type RouteCostLines = { diesel: string; peajes: string; viatico: string; total: string };

/**
 * Textos del desglose. «Total pendiente» solo cuando no hay precio de diésel
 * (ni guardado ni ingresado). Con precio guardado el total es un monto.
 */
export function routeCostLines(cost: RouteCost): RouteCostLines {
  return {
    diesel: cost.dieselClp == null ? "Pendiente" : String(cost.dieselClp),
    peajes: String(cost.tollsClp),
    viatico: String(cost.viaticoClp),
    total: cost.total == null ? "Total pendiente" : String(cost.total),
  };
}
