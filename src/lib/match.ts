import { cityByName } from "./catalog";
import { costForMatch } from "./costos/match";
import { getSettings } from "./settings";
import { daysBetween } from "./format";
import type { LoadCore, MatchResult, MatchTripCost, TruckCore } from "./types";

function num(specs: LoadCore["specs"] | TruckCore["specs"], key: string): number | undefined {
  const value = specs[key];
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function flag(specs: LoadCore["specs"] | TruckCore["specs"], key: string): boolean {
  return specs[key] === true;
}

function corridorScore(loadCity: string, truckCity: string, same: number, region: number, zone: number): number {
  if (loadCity === truckCity) return same;
  const a = cityByName(loadCity);
  const b = cityByName(truckCity);
  if (!a || !b) return 0;
  if (a.region === b.region) return region;
  if (a.zone === b.zone) return zone;
  return 0;
}

function assertEquipment(id: never): never {
  throw new Error(`Equipo no manejado: ${String(id)}`);
}

export function matchLoadToTruck(load: LoadCore, truck: TruckCore): MatchResult | null {
  if (load.equipment !== truck.equipment || truck.tonnage < load.weightT) return null;

  const reasons = [
    `Equipo: ${truck.equipment.replace("_", " ")}`,
    `Capacidad ${truck.tonnage} t ≥ ${load.weightT} t`,
  ];
  const warnings: string[] = [];
  const loadSpecs = load.specs;
  const truckSpecs = truck.specs;
  let score = 30;

  switch (load.equipment) {
    case "cama_baja": {
      const width = num(loadSpecs, "anchoM");
      const bed = Math.max(num(truckSpecs, "anchoExtM") ?? 0, num(truckSpecs, "anchoM") ?? 0);
      if (width !== undefined && bed && width > bed) return null;
      const length = num(loadSpecs, "largoM");
      const bedLength = num(truckSpecs, "largoM");
      if (length !== undefined && bedLength !== undefined && length > bedLength) return null;
      const minAxles = num(loadSpecs, "ejesMin");
      const axles = num(truckSpecs, "ejes");
      if (
        (minAxles !== undefined && axles !== undefined && axles < minAxles) ||
        (flag(loadSpecs, "requiereRampas") && !flag(truckSpecs, "rampas")) ||
        (flag(loadSpecs, "requiereWinche") && !flag(truckSpecs, "winche"))
      ) {
        return null;
      }
      if (width !== undefined || length !== undefined) reasons.push("Dimensiones de la carga caben en la cama");
      if (flag(loadSpecs, "requiereAcreditacion")) {
        warnings.push("Ingreso con acreditación: confirma acreditación vigente del conductor y equipo");
      }
      break;
    }
    case "rampla_plana": {
      const width = num(loadSpecs, "anchoM");
      const truckWidth = num(truckSpecs, "anchoM");
      if (width !== undefined && truckWidth !== undefined && width > truckWidth) return null;
      const length = num(loadSpecs, "largoM");
      const truckLength = num(truckSpecs, "largoM");
      if (length !== undefined && truckLength !== undefined && length > truckLength) return null;
      if (flag(loadSpecs, "requiereCarpa") && !flag(truckSpecs, "carpa")) {
        warnings.push("La carga pide carpa y el camión no la declara");
      }
      break;
    }
    case "sider":
    case "furgon_seco": {
      const pallets = num(loadSpecs, "pallets");
      const capacity = num(truckSpecs, "pallets");
      if (pallets !== undefined && capacity !== undefined && pallets > capacity) return null;
      const volume = num(loadSpecs, "volumenM3");
      const truckVolume = num(truckSpecs, "volumenM3");
      if (volume !== undefined && truckVolume !== undefined && volume > truckVolume) return null;
      break;
    }
    case "refrigerado": {
      const required = num(loadSpecs, "tempReq");
      const min = num(truckSpecs, "tempMin");
      const max = num(truckSpecs, "tempMax");
      if (required !== undefined && min !== undefined && max !== undefined) {
        if (required < min || required > max) return null;
        reasons.push(`Rango de frío ${min}°C a ${max}°C cubre ${required}°C`);
      }
      const pallets = num(loadSpecs, "pallets");
      const capacity = num(truckSpecs, "pallets");
      if (pallets !== undefined && capacity !== undefined && pallets > capacity) return null;
      if (!flag(truckSpecs, "resSanitaria")) warnings.push("Confirma resolución sanitaria vigente");
      break;
    }
    case "tolva": {
      const volume = num(loadSpecs, "volumenM3");
      const capacity = num(truckSpecs, "volumenM3");
      if (volume !== undefined && capacity !== undefined && volume > capacity) return null;
      break;
    }
    case "estanque": {
      const volume = num(loadSpecs, "volumenM3");
      const capacity = num(truckSpecs, "volumenM3");
      if (volume !== undefined && capacity !== undefined && volume > capacity) return null;
      const product = loadSpecs.producto;
      const allowed = truckSpecs.producto;
      if (
        (product && allowed && allowed !== "Multiproducto" && allowed !== product) ||
        (flag(loadSpecs, "requiereBomba") && !flag(truckSpecs, "bomba"))
      ) {
        return null;
      }
      break;
    }
    case "portacontenedor": {
      const size = loadSpecs.tamano;
      const truckSize = truckSpecs.tamano;
      if (size && truckSize && truckSize !== size && truckSize !== "20' y 40'") return null;
      break;
    }
    case "portaautos": {
      const vehicles = num(loadSpecs, "vehiculos");
      const capacity = num(truckSpecs, "vehiculos");
      if (vehicles !== undefined && capacity !== undefined && vehicles > capacity) return null;
      break;
    }
    case "peligrosa": {
      const hazard = num(loadSpecs, "clase");
      const classes = String(truckSpecs.clases ?? "")
        .split(/[,\s]+/)
        .map((item) => Number.parseInt(item, 10))
        .filter((item) => !Number.isNaN(item));
      if (hazard !== undefined && classes.length && !classes.includes(hazard)) return null;
      if (!flag(truckSpecs, "autorizacion")) {
        warnings.push("Confirma autorización de transporte de sustancias peligrosas");
      }
      break;
    }
    case "camion_34":
    case "otro":
      break;
    default:
      return assertEquipment(load.equipment);
  }

  if (load.origin === truck.destination && load.destination === truck.origin) return null;

  const originScore = corridorScore(load.origin, truck.origin, 25, 15, 5);
  const destinationScore = corridorScore(load.destination, truck.destination, 25, 15, 5);
  if (originScore + destinationScore < 20) return null;

  score += originScore + destinationScore;
  if (originScore === 25) reasons.push(`Mismo origen: ${load.origin}`);
  else if (originScore) reasons.push(`Origen cercano: ${load.origin} ↔ ${truck.origin}`);
  if (destinationScore === 25) reasons.push(`Mismo destino: ${load.destination}`);
  else if (destinationScore) reasons.push(`Destino cercano: ${load.destination} ↔ ${truck.destination}`);

  if (load.pickupDate >= truck.availableFrom && load.pickupDate <= truck.availableTo) {
    score += 20;
    reasons.push("Fecha de retiro dentro de la disponibilidad");
  } else {
    const gap =
      load.pickupDate < truck.availableFrom
        ? daysBetween(load.pickupDate, truck.availableFrom)
        : daysBetween(truck.availableTo, load.pickupDate);
    if (gap > 5) return null;
    score += Math.max(2, 12 - 2 * gap);
    warnings.push(`Fechas desfasadas por ${gap} día(s)`);
  }

  return { score: Math.min(100, score), reasons, warnings };
}

/** Versión del calce usado por la asignación. El listado público sigue en matchLoadToTruck. */
export const MATCH_VERSION = "match-v1" as const;

export type BlockingCheck = {
  code: "CARGA_PELIGROSA" | "CARGA_REFRIGERADA" | "CARGA_MINERA";
  detail: string;
};

export type LoadTruckEvaluation = {
  version: typeof MATCH_VERSION;
  compatible: boolean;
  /** Null solo si el par calza. Todo descarte trae un código. */
  reasonCode: string | null;
  score: number | null;
  reasons: string[];
  warnings: string[];
  blockingChecks: BlockingCheck[];
};

function specText(specs: LoadCore["specs"], key: string): string {
  const value = specs[key];
  return typeof value === "string" ? value : "";
}

/** Concentrado, faena o la marca explícita. Áridos y granos no cuentan como minería. */
export function isMiningLoad(load: Pick<LoadCore, "equipment" | "specs">): boolean {
  if (load.specs.minera === true) return true;
  if (/concentrad/i.test(specText(load.specs, "material"))) return true;
  const rubro = `${specText(load.specs, "rubro")} ${specText(load.specs, "sector")} ${specText(load.specs, "faena")}`;
  return /miner/i.test(rubro);
}

/**
 * Controles que impiden confirmar. El listado público sigue avisando y no los usa.
 * Si el camión ya declara el requisito, no hay control pendiente.
 */
export function blockingChecksFor(load: LoadCore, truck: TruckCore): BlockingCheck[] {
  const checks: BlockingCheck[] = [];
  if (load.equipment === "peligrosa" && !flag(truck.specs, "autorizacion")) {
    checks.push({ code: "CARGA_PELIGROSA", detail: "Falta autorización de transporte de sustancias peligrosas." });
  }
  if (load.equipment === "refrigerado" && !flag(truck.specs, "resSanitaria")) {
    checks.push({ code: "CARGA_REFRIGERADA", detail: "Falta resolución sanitaria vigente." });
  }
  if (isMiningLoad(load) && !flag(truck.specs, "acreditacionMinera")) {
    checks.push({ code: "CARGA_MINERA", detail: "Falta acreditación minera del equipo." });
  }
  return checks;
}

/** Primer motivo por el que matchLoadToTruck devolvería null. Nunca null. */
function discardCode(load: LoadCore, truck: TruckCore): string {
  if (load.equipment !== truck.equipment) return "EQUIPO";
  if (truck.tonnage < load.weightT) return "TONELAJE";
  const loadSpecs = load.specs;
  const truckSpecs = truck.specs;
  switch (load.equipment) {
    case "cama_baja": {
      const width = num(loadSpecs, "anchoM");
      const bed = Math.max(num(truckSpecs, "anchoExtM") ?? 0, num(truckSpecs, "anchoM") ?? 0);
      if (width !== undefined && bed && width > bed) return "ANCHO";
      const length = num(loadSpecs, "largoM");
      const bedLength = num(truckSpecs, "largoM");
      if (length !== undefined && bedLength !== undefined && length > bedLength) return "LARGO";
      const minAxles = num(loadSpecs, "ejesMin");
      const axles = num(truckSpecs, "ejes");
      if (minAxles !== undefined && axles !== undefined && axles < minAxles) return "EJES";
      if (flag(loadSpecs, "requiereRampas") && !flag(truckSpecs, "rampas")) return "RAMPAS";
      if (flag(loadSpecs, "requiereWinche") && !flag(truckSpecs, "winche")) return "WINCHE";
      break;
    }
    case "rampla_plana": {
      const width = num(loadSpecs, "anchoM");
      const truckWidth = num(truckSpecs, "anchoM");
      if (width !== undefined && truckWidth !== undefined && width > truckWidth) return "ANCHO";
      const length = num(loadSpecs, "largoM");
      const truckLength = num(truckSpecs, "largoM");
      if (length !== undefined && truckLength !== undefined && length > truckLength) return "LARGO";
      break;
    }
    case "sider":
    case "furgon_seco": {
      const pallets = num(loadSpecs, "pallets");
      const capacity = num(truckSpecs, "pallets");
      if (pallets !== undefined && capacity !== undefined && pallets > capacity) return "PALLETS";
      const volume = num(loadSpecs, "volumenM3");
      const truckVolume = num(truckSpecs, "volumenM3");
      if (volume !== undefined && truckVolume !== undefined && volume > truckVolume) return "VOLUMEN";
      break;
    }
    case "refrigerado": {
      const required = num(loadSpecs, "tempReq");
      const min = num(truckSpecs, "tempMin");
      const max = num(truckSpecs, "tempMax");
      if (required !== undefined && min !== undefined && max !== undefined && (required < min || required > max)) return "TEMPERATURA";
      const pallets = num(loadSpecs, "pallets");
      const capacity = num(truckSpecs, "pallets");
      if (pallets !== undefined && capacity !== undefined && pallets > capacity) return "PALLETS";
      break;
    }
    case "tolva": {
      const volume = num(loadSpecs, "volumenM3");
      const capacity = num(truckSpecs, "volumenM3");
      if (volume !== undefined && capacity !== undefined && volume > capacity) return "VOLUMEN";
      break;
    }
    case "estanque": {
      const volume = num(loadSpecs, "volumenM3");
      const capacity = num(truckSpecs, "volumenM3");
      if (volume !== undefined && capacity !== undefined && volume > capacity) return "VOLUMEN";
      const product = loadSpecs.producto;
      const allowed = truckSpecs.producto;
      if (product && allowed && allowed !== "Multiproducto" && allowed !== product) return "PRODUCTO";
      if (flag(loadSpecs, "requiereBomba") && !flag(truckSpecs, "bomba")) return "BOMBA";
      break;
    }
    case "portacontenedor": {
      const size = loadSpecs.tamano;
      const truckSize = truckSpecs.tamano;
      if (size && truckSize && truckSize !== size && truckSize !== "20' y 40'") return "TAMANO";
      break;
    }
    case "portaautos": {
      const vehicles = num(loadSpecs, "vehiculos");
      const capacity = num(truckSpecs, "vehiculos");
      if (vehicles !== undefined && capacity !== undefined && vehicles > capacity) return "VEHICULOS";
      break;
    }
    case "peligrosa": {
      const hazard = num(loadSpecs, "clase");
      const classes = String(truckSpecs.clases ?? "")
        .split(/[,\s]+/)
        .map((item) => Number.parseInt(item, 10))
        .filter((item) => !Number.isNaN(item));
      if (hazard !== undefined && classes.length && !classes.includes(hazard)) return "CLASE_PELIGRO";
      break;
    }
    case "camion_34":
    case "otro":
      break;
    default:
      return "EQUIPO";
  }
  if (load.origin === truck.destination && load.destination === truck.origin) return "CORREDOR_INVERSO";
  const originScore = corridorScore(load.origin, truck.origin, 25, 15, 5);
  const destinationScore = corridorScore(load.destination, truck.destination, 25, 15, 5);
  if (originScore + destinationScore < 20) return "CORREDOR";
  if (!(load.pickupDate >= truck.availableFrom && load.pickupDate <= truck.availableTo)) {
    const gap =
      load.pickupDate < truck.availableFrom
        ? daysBetween(load.pickupDate, truck.availableFrom)
        : daysBetween(truck.availableTo, load.pickupDate);
    if (gap > 5) return "FECHA";
  }
  return "NO_COMPATIBLE";
}

/**
 * Calce con código de descarte. No reemplaza a matchLoadToTruck: el listado público no llama aquí.
 * Si el par calza, el puntaje es el de matchLoadToTruck. Si no, reasonCode nunca es null.
 */
export function evaluateLoadTruck(load: LoadCore, truck: TruckCore): LoadTruckEvaluation {
  const blockingChecks = blockingChecksFor(load, truck);
  const match = matchLoadToTruck(load, truck);
  if (match) {
    return {
      version: MATCH_VERSION,
      compatible: true,
      reasonCode: null,
      score: match.score,
      reasons: match.reasons,
      warnings: match.warnings,
      blockingChecks,
    };
  }
  return {
    version: MATCH_VERSION,
    compatible: false,
    reasonCode: discardCode(load, truck),
    score: null,
    reasons: [],
    warnings: [],
    blockingChecks,
  };
}

/**
 * Costo de referencia desglosado del viaje (motor de costos, solo rutas en caché, sin red) para cada par del listado.
 * Solo se calcula si la administración muestra costos (ajuste "Mostrar costo referencial"); si falla, queda null.
 */
function tripCostsEnabled(): boolean {
  try {
    return getSettings().showSuggestedPrice;
  } catch {
    return false;
  }
}

export function tripCostFor(load: LoadCore, truck: TruckCore, memo?: Map<string, MatchTripCost | null>): MatchTripCost | null {
  const key = `${load.origin}|${load.destination}|${load.equipment}|${load.weightT}|${truck.equipment}`;
  if (memo?.has(key)) return memo.get(key) ?? null;
  let cost: MatchTripCost | null = null;
  try {
    const view = costForMatch(load, { equipment: truck.equipment });
    if (view) {
      cost = { total: view.complete && view.method === "motor" ? view.costoTotal : null, complete: view.complete && view.method === "motor", km: view.km, method: view.method };
    }
  } catch {
    cost = null;
  }
  memo?.set(key, cost);
  return cost;
}

export function matchTrucksForLoad<T extends TruckCore>(load: LoadCore, trucks: T[]): { truck: T; match: MatchResult }[] {
  const withCost = tripCostsEnabled();
  const memo = new Map<string, MatchTripCost | null>();
  return trucks
    .map((truck) => ({ truck, match: matchLoadToTruck(load, truck) }))
    .filter((item): item is { truck: T; match: MatchResult } => item.match !== null)
    .map((item) => (withCost ? { ...item, match: { ...item.match, tripCost: tripCostFor(load, item.truck, memo) } } : item))
    .sort((a, b) => b.match.score - a.match.score);
}

export function matchLoadsForTruck<T extends LoadCore>(truck: TruckCore, loads: T[]): { load: T; match: MatchResult }[] {
  const withCost = tripCostsEnabled();
  const memo = new Map<string, MatchTripCost | null>();
  return loads
    .map((load) => ({ load, match: matchLoadToTruck(load, truck) }))
    .filter((item): item is { load: T; match: MatchResult } => item.match !== null)
    .map((item) => (withCost ? { ...item, match: { ...item.match, tripCost: tripCostFor(item.load, truck, memo) } } : item))
    .sort((a, b) => b.match.score - a.match.score);
}
