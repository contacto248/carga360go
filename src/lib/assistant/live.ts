import { equipmentById } from "../catalog";
import { formatDateCL } from "../format";
import { liveStats, recentListings } from "../stats";
import type { LiveContext } from "../whatsapp/intents";

/** Contexto en vivo para el asistente (sin datos de contacto). */
export function liveContext(): LiveContext {
  try {
    const stats = liveStats();
    const recent = recentListings(8);
    const line = (item: (typeof recent)[number]) =>
      `${item.origin} → ${item.destination} · ${equipmentById(item.equipment)?.label ?? item.equipment} · ${item.amount} · ${formatDateCL(item.date)}`;
    return {
      activeLoads: stats.activeLoads,
      activeTrucks: stats.activeTrucks,
      recentLoads: recent.filter((item) => item.kind === "carga").slice(0, 3).map(line),
      recentTrucks: recent.filter((item) => item.kind === "camion").slice(0, 3).map(line),
    };
  } catch (error) {
    console.error("[carga360go] liveContext", error);
    return { activeLoads: 0, activeTrucks: 0, recentLoads: [], recentTrucks: [] };
  }
}
