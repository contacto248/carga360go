import type { EquipmentId } from "../types";

/**
 * Clases de vehículo del motor. Los ejes y el remolque definen la categoría de peaje de cada concesión
 * (las concesiones interurbanas cobran por "dos ejes" / "más de dos ejes"; los pórticos free flow de
 * Nueva Aconcagua, Autopista Central y Costanera Norte cobran por "buses y camiones" / "con remolque").
 */
export type VehicleClassId = "camion_2_ejes" | "camion_3_ejes" | "tracto_semirremolque_5_ejes" | "tracto_semirremolque_6_ejes";

export type VehicleClass = {
  id: VehicleClassId;
  label: string;
  axles: number;
  trailer: boolean;
  /** Capacidad de carga útil de referencia (t) para interpolar el rendimiento según la carga. Parámetro configurable. */
  payloadT: number;
};

export const VEHICLE_CLASSES: Record<VehicleClassId, VehicleClass> = {
  camion_2_ejes: { id: "camion_2_ejes", label: "Camión simple de 2 ejes (rígido, sin remolque)", axles: 2, trailer: false, payloadT: 10 },
  camion_3_ejes: { id: "camion_3_ejes", label: "Camión simple de 3 ejes (rígido, sin remolque)", axles: 3, trailer: false, payloadT: 15 },
  tracto_semirremolque_5_ejes: {
    id: "tracto_semirremolque_5_ejes",
    label: "Tracto camión + semirremolque, 5 ejes en total",
    axles: 5,
    trailer: true,
    payloadT: 27,
  },
  tracto_semirremolque_6_ejes: {
    id: "tracto_semirremolque_6_ejes",
    label: "Tracto camión + semirremolque, 6 ejes en total",
    axles: 6,
    trailer: true,
    payloadT: 29,
  },
};

export function isVehicleClassId(value: unknown): value is VehicleClassId {
  return typeof value === "string" && value in VEHICLE_CLASSES;
}

/** Clase de vehículo por defecto para cada tipo de equipo del catálogo del sitio. */
export function vehicleForEquipment(equipment: string): VehicleClassId {
  const light: EquipmentId[] = ["camion_34"];
  return (light as string[]).includes(equipment) ? "camion_2_ejes" : "tracto_semirremolque_5_ejes";
}

/** Esquema tarifario de una plaza: por ejes o por remolque. */
export type TollScheme = "ejes" | "remolque";

export const TOLL_CATEGORY_LABELS: Record<string, string> = {
  camion_2_ejes: "Camiones de dos ejes",
  camion_mas_2_ejes: "Camiones de más de dos ejes",
  camion_sin_remolque: "Buses y camiones (sin remolque)",
  camion_con_remolque: "Buses y camiones con remolque",
};

export function tollCategory(vehicle: VehicleClass, scheme: TollScheme): string {
  if (scheme === "remolque") return vehicle.trailer ? "camion_con_remolque" : "camion_sin_remolque";
  return vehicle.axles <= 2 ? "camion_2_ejes" : "camion_mas_2_ejes";
}
