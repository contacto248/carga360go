import type { EquipmentId } from "../types";
import { ENGINE_VERSION, publicView, quote, type QuoteInput, type QuoteResult } from "../costos/engine";
import { saveQuote } from "../costos/quotes";

/**
 * Integración del agente comercial con el motor de costos de flete (src/lib/costos/engine.ts).
 * Se usa la función única del motor (`quote` → `computeQuote`), la misma del cotizador, la publicación de cargas,
 * el panel y la API de costos. El agente recibe la vista pública: costo de referencia desglosado (costo base + IVA), nunca el margen.
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
  /** Costo referencial en CLP con IVA (costo base + IVA, sin margen). null si el cálculo quedó incompleto. */
  totalClp: number | null;
  /** true solo si el motor calculó con ruta real y sin componentes pendientes ni vencidos. */
  complete: boolean;
  pending: string[];
  method: "motor" | "respaldo_linea_recta";
  breakdown: { ruta?: number; peajes?: number; diesel?: number; operacionales?: number };
  /** Distancia usada por el motor, en km. */
  km?: number;
  /** Fecha del dato de diésel (ISO) y nombre de la fuente. */
  dieselDate?: string | null;
  dieselSource?: string | null;
  tollCount?: number;
  vehicleLabel?: string;
  calculatedAt: string;
  source: string;
  /** Cotización guardada (cost_quotes, canal api_agente_voz) para revisión del equipo. */
  quoteId?: string | null;
};

export type CostProviderStatus = { connected: boolean; state: string };

export interface FreightCostProvider {
  status(): CostProviderStatus;
  estimate(request: CostRequest): Promise<CostEstimate | null>;
}

const sum = (values: (number | null)[]) => values.reduce<number>((acc, v) => acc + (v ?? 0), 0);

/** Convierte el resultado del motor en lo que el agente puede decir (sin margen ni parámetros internos). */
export function estimateFromQuote(result: QuoteResult, quoteId: string | null = null): CostEstimate {
  const view = publicView(result, true);
  const complete = result.method === "motor" && result.totals.complete && result.totals.pending.length === 0;
  const amountOf = (key: string) => result.components.find((c) => c.key === key)?.amount ?? null;
  const operational = result.components.filter((c) => c.group === "operacional").map((c) => c.amount);
  return {
    totalClp: complete ? view.costoTotal : null,
    complete,
    pending: result.totals.pending,
    method: result.method,
    breakdown: complete ? { peajes: amountOf("peajes") ?? undefined, diesel: amountOf("combustible") ?? undefined, operacionales: sum(operational) } : {},
    km: view.km ?? undefined,
    dieselDate: result.diesel?.fetchedAt ?? null,
    dieselSource: result.diesel?.source ?? null,
    tollCount: result.tolls.length,
    vehicleLabel: result.vehicle.label,
    calculatedAt: result.computedAt,
    source: ENGINE_VERSION,
    quoteId,
  };
}

/** Proveedor real: motor de costos de Carga360Go (rutas OSRM, peajes MOP por ejes, diésel CNE, parámetros operacionales). */
export class MotorCostProvider implements FreightCostProvider {
  status(): CostProviderStatus {
    return { connected: true, state: `Conectado al motor de costos (${ENGINE_VERSION}): ruta real, peajes por ejes (MOP), diésel (CNE) y costos operacionales.` };
  }
  async estimate(request: CostRequest): Promise<CostEstimate | null> {
    if (!request.origin || !request.destination) return null;
    const input: QuoteInput = { origin: request.origin, destination: request.destination, equipment: request.equipment ?? undefined, weightT: request.weightT };
    const result = await quote(input);
    let quoteId: string | null = null;
    try {
      quoteId = saveQuote(input, result, "api_agente_voz", null);
    } catch (error) {
      console.error("[carga360go] agente: no se pudo guardar la cotización", error instanceof Error ? error.message : error);
    }
    return estimateFromQuote(result, quoteId);
  }
}

let provider: FreightCostProvider = new MotorCostProvider();

export function freightCostProvider(): FreightCostProvider {
  return provider;
}

/** Cambia la implementación (pruebas). null vuelve al motor real. */
export function setFreightCostProvider(next: FreightCostProvider | null) {
  provider = next ?? new MotorCostProvider();
}

export { COST_EXPLANATION, COST_INCOMPLETE_NOTE, COST_PENDING_NOTE } from "./cost-copy";
import { COST_EXPLANATION, COST_INCOMPLETE_NOTE } from "./cost-copy";

export function formatClp(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CL")}`;
}

function formatDateCl(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Frase del agente con el costo referencial. Solo da cifra si la cotización está completa y sin pendientes.
 * Aclara que es referencial y con qué se calculó (ruta, peajes, diésel y fecha de la fuente). Nunca menciona margen ni comisiones.
 */
export function costSentence(estimate: CostEstimate | null): string {
  if (!estimate || !estimate.complete || estimate.totalClp === null || estimate.pending.length) {
    return `${COST_EXPLANATION} ${COST_INCOMPLETE_NOTE}`;
  }
  const km = estimate.km ? ` (${Math.round(estimate.km).toLocaleString("es-CL")} km)` : "";
  const dieselDate = formatDateCl(estimate.dieselDate);
  const diesel = dieselDate ? `el diésel publicado por la CNE al ${dieselDate}` : "el diésel publicado por la CNE";
  const vehicle = estimate.vehicleLabel ? ` para ${estimate.vehicleLabel.charAt(0).toLowerCase()}${estimate.vehicleLabel.slice(1)}` : "";
  return (
    `Costo referencial del flete${vehicle}: ${formatClp(estimate.totalClp)} con IVA. ` +
    `Lo calculó el sistema con la ruta real${km}, los peajes oficiales según los ejes del camión, ${diesel} y los costos operacionales del viaje. ` +
    "Es referencial, no un precio cerrado: el ejecutivo le confirmará el detalle."
  );
}
