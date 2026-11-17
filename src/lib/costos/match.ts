import { quoteFromCache, publicView } from "./engine";
import { vehicleForEquipment, type VehicleClassId } from "./vehicles";

/**
 * Punto de integración con CARGA360 Match (src/lib/match.ts): costo aproximado del viaje para un par carga–camión,
 * calculado con el mismo motor (sin red: usa rutas ya calculadas). El transportista ve el costo de referencia desglosado
 * de su viaje; no es un precio prometido.
 */
export function costForMatch(load: { origin: string; destination: string; equipment: string; weightT: number }, truck?: { equipment: string; axles?: number | null }) {
  const vehicle: VehicleClassId = truck ? vehicleForEquipment(truck.equipment) : vehicleForEquipment(load.equipment);
  const result = quoteFromCache({ origin: load.origin, destination: load.destination, equipment: load.equipment, vehicle, weightT: load.weightT });
  return result ? publicView(result, true) : null;
}
