import type { EquipmentId } from "../types";

/**
 * Integración con el motor de costos de flete (lo construye otra rama, con su propio endpoint).
 * El costo real se calcula automáticamente con la ruta, los peajes según los ejes del camión,
 * el diésel y los costos operacionales. Aquí solo está la interfaz: PENDIENTE DE CONECTAR.
 * Cuando exista el endpoint, se implementa un FreightCostProvider y se registra con setFreightCostProvider.
 */
export type CostRequest = {
  origin: string;
  destination: string;
  equipment: EquipmentId | null;
  weightT: number | null;
  /** Ejes del camión, si se conocen (los peajes dependen de los ejes). */
  axles?: number | null;
  date?: string | null;
};

export type CostEstimate = {
  totalClp: number;
  breakdown: { ruta?: number; peajes?: number; diesel?: number; operacionales?: number };
  /** Distancia usada por el motor, en km. */
  km?: number;
  calculatedAt: string;
  source: string;
};

export type CostProviderStatus = { connected: boolean; state: string };

export interface FreightCostProvider {
  status(): CostProviderStatus;
  estimate(request: CostRequest): Promise<CostEstimate | null>;
}

class PendingCostEngine implements FreightCostProvider {
  status(): CostProviderStatus {
    return { connected: false, state: "PENDIENTE DE CONECTAR: el motor de costos (ruta, peajes por ejes, diésel y costos operacionales) se integra desde otra rama" };
  }
  async estimate(): Promise<CostEstimate | null> {
    return null;
  }
}

let provider: FreightCostProvider = new PendingCostEngine();

export function freightCostProvider(): FreightCostProvider {
  return provider;
}

/** Registra la implementación real (o una de prueba). null vuelve a "pendiente de conectar". */
export function setFreightCostProvider(next: FreightCostProvider | null) {
  provider = next ?? new PendingCostEngine();
}

/** Lo que el agente explica cuando preguntan por costos. Sin comisiones, modelos de cobro ni estrategia de precios. */
export const COST_EXPLANATION =
  "El costo real del flete se calcula automáticamente con la ruta, los peajes según los ejes del camión, el diésel y los costos operacionales.";

export const COST_PENDING_NOTE = "Ese cálculo automático todavía no está conectado a este asistente, así que no le daré cifras: un ejecutivo le responderá con el costo.";

export function formatClp(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CL")}`;
}
