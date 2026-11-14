import { cityByName } from "./catalog";
import { daysBetween } from "./format";
import { equipmentList, listLoads, listTrucks } from "./listings";
import type { LoadFilters, LoadListItem, TruckFilters, TruckListItem } from "./types";

/** Corredores piloto para concentrar actividad real al arrancar. */
export const PILOT_CORRIDORS = "Calama–Antofagasta, Calama–Copiapó y Antofagasta–Copiapó";

export const PILOT_EMPTY_MESSAGE =
  `Estamos activando los corredores ${PILOT_CORRIDORS}. Tu alerta nos ayuda a avisarte apenas haya un aviso compatible.`;

const PILOT_REGION_IDS = new Set(["antofagasta", "atacama"]);
const PILOT_CITIES = new Set(["Calama", "Antofagasta", "Copiapó", "Mejillones", "Tocopilla", "Caldera", "Taltal"]);

export type FilterPlaces = {
  regionOrigen?: string;
  regionDestino?: string;
  origen?: string;
  destino?: string;
};

export function isPilotCorridorFilter(filters: FilterPlaces): boolean {
  for (const id of [filters.regionOrigen, filters.regionDestino]) {
    if (id && PILOT_REGION_IDS.has(id)) return true;
  }
  for (const name of [filters.origen, filters.destino]) {
    if (!name) continue;
    if (PILOT_CITIES.has(name)) return true;
    const region = cityByName(name)?.regionId;
    if (region && PILOT_REGION_IDS.has(region)) return true;
  }
  return false;
}

export type NearbyHit<T> = { item: T; why: string };

function regionOf(city: string): string | undefined {
  return cityByName(city)?.regionId;
}

function originRegion(filters: FilterPlaces): string | undefined {
  return filters.regionOrigen || (filters.origen ? regionOf(filters.origen) : undefined);
}

function destRegion(filters: FilterPlaces): string | undefined {
  return filters.regionDestino || (filters.destino ? regionOf(filters.destino) : undefined);
}

function dateClose(filterDate: string | undefined, listingDate: string): boolean {
  if (!filterDate) return false;
  return Math.abs(daysBetween(filterDate, listingDate)) <= 7;
}

const LIMIT = 4;

/** Avisos cercanos cuando una búsqueda exacta sale vacía. Solo se devuelven si existen de verdad. */
export function nearbyLoads(filters: LoadFilters, excludeIds: Iterable<string> = []): NearbyHit<LoadListItem>[] {
  const excluded = new Set(excludeIds);
  const wantOrigin = originRegion(filters);
  const wantDest = destRegion(filters);
  const wantEq = equipmentList(filters.equipo);
  const date = filters.desde;
  if (!wantOrigin && !wantDest && !wantEq.length && !date) return [];
  const hits: NearbyHit<LoadListItem>[] = [];
  for (const load of listLoads({})) {
    if (excluded.has(load.id) || load.isDemo) continue;
    const reasons: string[] = [];
    if (wantOrigin && regionOf(load.origin) === wantOrigin) reasons.push("Misma región de origen");
    if (wantDest && regionOf(load.destination) === wantDest) reasons.push("Misma región de destino");
    if (dateClose(date, load.pickupDate)) reasons.push("Fecha próxima");
    if (wantEq.length && !wantEq.includes(load.equipment) && reasons.length) reasons.push("Otro equipo");
    if (!reasons.some((reason) => reason.startsWith("Misma") || reason.startsWith("Fecha"))) continue;
    hits.push({ item: load, why: reasons.join(" · ") });
    if (hits.length >= LIMIT) break;
  }
  return hits;
}

export function nearbyTrucks(filters: TruckFilters, excludeIds: Iterable<string> = []): NearbyHit<TruckListItem>[] {
  const excluded = new Set(excludeIds);
  const wantOrigin = originRegion(filters);
  const wantDest = destRegion(filters);
  const wantEq = equipmentList(filters.equipo);
  const date = filters.dia;
  if (!wantOrigin && !wantDest && !wantEq.length && !date) return [];
  const hits: NearbyHit<TruckListItem>[] = [];
  for (const truck of listTrucks({})) {
    if (excluded.has(truck.id) || truck.isDemo) continue;
    const reasons: string[] = [];
    if (wantOrigin && regionOf(truck.origin) === wantOrigin) reasons.push("Misma región de origen");
    if (wantDest && regionOf(truck.destination) === wantDest) reasons.push("Misma región de destino");
    if (date && truck.availableFrom <= date && truck.availableTo >= date) reasons.push("Fecha dentro de la disponibilidad");
    else if (date && dateClose(date, truck.availableFrom)) reasons.push("Fecha próxima");
    if (wantEq.length && !wantEq.includes(truck.equipment) && reasons.length) reasons.push("Otro equipo");
    if (!reasons.some((reason) => reason.startsWith("Misma") || reason.startsWith("Fecha"))) continue;
    hits.push({ item: truck, why: reasons.join(" · ") });
    if (hits.length >= LIMIT) break;
  }
  return hits;
}
