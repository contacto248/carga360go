import { REGIONS, cityByName } from "./catalog";
import { getDb } from "./db";
import { todayChile } from "./format";
import { allListings } from "./listings";
import { matchLoadToTruck } from "./match";
import { publicVerifiedSeal } from "./public-trust";
import type { LoadPublic, TruckPublic } from "./types";

export type LiveStats = {
  activeLoads: number;
  activeTrucks: number;
  verifiedCarriers: number;
  companies: number;
  regionsActive: number;
  matches: number;
};

export type RegionActivity = { id: string; numeral: string; name: string; loads: number; trucks: number; total: number };

export type RecentItem =
  | { kind: "carga"; id: string; origin: string; destination: string; equipment: string; amount: string; date: string; createdAt: string; verified: boolean }
  | { kind: "camion"; id: string; origin: string; destination: string; equipment: string; amount: string; date: string; createdAt: string; verified: boolean };

/** Solo publicaciones reales (no demo) y vigentes. */
export function activeListings(today = todayChile()): { loads: LoadPublic[]; trucks: TruckPublic[] } {
  const { loads, trucks } = allListings();
  return {
    loads: loads.filter((load) => !load.isDemo && load.pickupDate >= today),
    trucks: trucks.filter((truck) => !truck.isDemo && truck.availableTo >= today),
  };
}

export function liveStats(today = todayChile()): LiveStats {
  const db = getDb();
  const { loads, trucks } = activeListings(today);
  const regions = new Set<string>();
  for (const item of [...loads, ...trucks]) {
    const a = cityByName(item.origin)?.regionId;
    const b = cityByName(item.destination)?.regionId;
    if (a) regions.add(a);
    if (b) regions.add(b);
  }
  let matches = 0;
  for (const load of loads) for (const truck of trucks) if (truck.ownerId !== load.ownerId && matchLoadToTruck(load, truck)) matches += 1;
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    activeLoads: loads.length,
    activeTrucks: trucks.length,
    verifiedCarriers: count(`SELECT COUNT(*) AS n FROM users WHERE role = 'transportista' AND verification_status = 'verificado'`),
    companies: count(`SELECT COUNT(*) AS n FROM users WHERE role = 'mandante'`),
    regionsActive: regions.size,
    matches,
  };
}

/** Actividad por región: publicaciones que salen o llegan a cada región. */
export function regionActivity(today = todayChile()): RegionActivity[] {
  const { loads, trucks } = activeListings(today);
  return REGIONS.map((region) => {
    const touches = (item: { origin: string; destination: string }) =>
      cityByName(item.origin)?.regionId === region.id || cityByName(item.destination)?.regionId === region.id;
    const l = loads.filter(touches).length;
    const t = trucks.filter(touches).length;
    return { id: region.id, numeral: region.numeral, name: region.name, loads: l, trucks: t, total: l + t };
  });
}

/** Cantidad de publicaciones por región de origen (para los filtros). */
export function originCounts(kind: "cargas" | "camiones", today = todayChile()): Record<string, number> {
  const { loads, trucks } = activeListings(today);
  const items = kind === "cargas" ? loads : trucks;
  const out: Record<string, number> = {};
  for (const item of items) {
    const id = cityByName(item.origin)?.regionId;
    if (id) out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

export function recentListings(limit = 5, today = todayChile()): RecentItem[] {
  const { loads, trucks } = activeListings(today);
  const items: RecentItem[] = [
    ...loads.map((load) => ({
      kind: "carga" as const,
      id: load.id,
      origin: load.origin,
      destination: load.destination,
      equipment: load.equipment,
      amount: `${load.weightT} t`,
      date: load.pickupDate,
      createdAt: load.createdAt,
      verified: publicVerifiedSeal(load.ownerVerification, load.ownerDocsOk),
    })),
    ...trucks.map((truck) => ({
      kind: "camion" as const,
      id: truck.id,
      origin: truck.origin,
      destination: truck.destination,
      equipment: truck.equipment,
      amount: `${truck.tonnage} t`,
      date: truck.availableFrom,
      createdAt: truck.createdAt,
      verified: publicVerifiedSeal(truck.ownerVerification, truck.ownerDocsOk),
    })),
  ];
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
}

export type RegionIndicators = {
  id: string;
  numeral: string;
  name: string;
  /** Cargas vigentes que salen de la región. */
  loadsFrom: number;
  /** Cargas vigentes con destino en la región. */
  loadsTo: number;
  /** Camiones o retornos vigentes que parten desde la región. */
  trucks: number;
  /** Transportistas con cuenta verificada cuya ciudad está en la región. */
  verifiedCarriers: number;
  /** Para el color del mapa: cargas de origen + camiones disponibles. */
  activity: number;
};

/** Indicadores reales por región (norte → sur) para el panel de regiones. Excluye avisos demo y vencidos. */
export function regionIndicators(today = todayChile()): RegionIndicators[] {
  const { loads, trucks } = activeListings(today);
  const regionOf = (city: string) => cityByName(city)?.regionId;
  const carriers = getDb()
    .prepare(`SELECT city FROM users WHERE role = 'transportista' AND verification_status = 'verificado'`)
    .all() as { city: string }[];
  return REGIONS.map((region) => {
    const loadsFrom = loads.filter((load) => regionOf(load.origin) === region.id).length;
    const loadsTo = loads.filter((load) => regionOf(load.destination) === region.id).length;
    const truckCount = trucks.filter((truck) => regionOf(truck.origin) === region.id).length;
    const verifiedCarriers = carriers.filter((carrier) => regionOf(carrier.city) === region.id).length;
    return {
      id: region.id,
      numeral: region.numeral,
      name: region.name,
      loadsFrom,
      loadsTo,
      trucks: truckCount,
      verifiedCarriers,
      activity: loadsFrom + truckCount,
    };
  });
}
