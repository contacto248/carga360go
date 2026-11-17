import type { EquipmentId } from "./types";

/**
 * Semilla y respaldo del cálculo vigente: distancia en línea recta × 1,25,
 * tarifa por km según el equipo y un mínimo por viaje.
 * /api/estimacion lee la base; si falta un valor, usa estas constantes.
 */
export const ROAD_FACTOR = 1.25;

export const MIN_TRIP_CLP: Record<"liviano" | "pesado", number> = { liviano: 60000, pesado: 120000 };

export const DEFAULT_RATES: Record<EquipmentId, [number, number]> = {
  rampla_plana: [900, 1500],
  sider: [900, 1500],
  furgon_seco: [900, 1500],
  portacontenedor: [900, 1500],
  tolva: [950, 1600],
  otro: [900, 1500],
  camion_34: [800, 1200],
  refrigerado: [1100, 1800],
  estanque: [1100, 1800],
  portaautos: [1000, 1600],
  peligrosa: [1300, 2200],
  cama_baja: [2000, 3500],
};

export const FREIGHT_SETTING_KEYS = ["road_factor", "min_trip_liviano", "min_trip_pesado"] as const;
export type FreightSettingKey = (typeof FREIGHT_SETTING_KEYS)[number];
