/** Tipos del motor de costos logísticos (transporte terrestre de carga en Chile). */

/** Estado de cada dato o componente: nunca se presenta un valor estimado o pendiente como verificado. */
export type DataStatus = "verificado" | "estimado" | "pendiente" | "vencido";

export type LatLon = { lat: number; lon: number };

export type Place = LatLon & { label: string; region: string | null; source: string };

export type RouteStep = { name: string; ref: string; distanceM: number; toll: boolean; motorway: boolean };

export type RouteResult = {
  provider: string;
  profile: string;
  /** El perfil usado no es específico para camiones (OSRM público usa perfil de auto). */
  truckAware: boolean;
  distanceM: number;
  durationS: number;
  /** Geometría como lista [lon, lat]. */
  geometry: [number, number][];
  steps: RouteStep[];
  alternatives: { distanceM: number; durationS: number }[];
  via: LatLon[];
  viaLabel: string | null;
  fetchedAt: string;
  cached: boolean;
  attribution: string;
};

export type Component = {
  key: string;
  label: string;
  group: "obligatorio" | "operacional" | "margen" | "impuesto";
  /** Monto neto en CLP (null si está pendiente). */
  amount: number | null;
  status: DataStatus;
  source: string;
  date: string | null;
  detail: string;
};

export type TollLine = {
  plazaId: string;
  name: string;
  concession: string;
  route: string;
  category: string;
  categoryLabel: string;
  amountGross: number | null;
  amountNet: number | null;
  rateType: string;
  status: DataStatus;
  sourceUrl: string | null;
  checkedAt: string | null;
  validTo: string | null;
  distanceToRouteM: number;
  note: string;
};
