import { cityByName } from "./catalog";
import { daysBetween } from "./format";
import type { LoadCore, MatchResult, TruckCore } from "./types";

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

export function matchTrucksForLoad<T extends TruckCore>(load: LoadCore, trucks: T[]): { truck: T; match: MatchResult }[] {
  return trucks
    .map((truck) => ({ truck, match: matchLoadToTruck(load, truck) }))
    .filter((item): item is { truck: T; match: MatchResult } => item.match !== null)
    .sort((a, b) => b.match.score - a.match.score);
}

export function matchLoadsForTruck<T extends LoadCore>(truck: TruckCore, loads: T[]): { load: T; match: MatchResult }[] {
  return loads
    .map((load) => ({ load, match: matchLoadToTruck(load, truck) }))
    .filter((item): item is { load: T; match: MatchResult } => item.match !== null)
    .sort((a, b) => b.match.score - a.match.score);
}
