import { liveStats, recentListings } from "../stats";

/**
 * Lectura pública de la operación para el prompt.
 * Conteos y rutas, sin contactos, sin presupuestos y sin pagos.
 */
export function contextoOperacion(): string {
  try {
    const stats = liveStats();
    const recientes = recentListings(6).map(
      (item) => `${item.kind === "carga" ? "Carga" : "Camión"}: ${item.origin} → ${item.destination}, ${item.equipment}, ${item.amount}.`,
    );
    return [
      `Cargas vigentes: ${stats.activeLoads}. Camiones vigentes: ${stats.activeTrucks}. Regiones con movimiento: ${stats.regionsActive}.`,
      "Corredor: Arica a Punta Arenas.",
      "Pantallas: /cargas, /camiones, /cargas-de-retorno-mineras y la torre en /admin/centro-control.",
      recientes.length ? `Publicaciones vigentes:\n${recientes.join("\n")}` : "No hay publicaciones vigentes en este momento.",
      "GPS en vivo, recibo digital y voz no están operativos en este cliente.",
    ].join("\n");
  } catch (error) {
    console.error("[carga360go] agente 360go contexto", error instanceof Error ? error.message : "error");
    return "Sin lectura de publicaciones en este momento. Oriente con /cargas, /camiones, /cargas-de-retorno-mineras y /admin/centro-control. GPS en vivo, recibo digital y voz no están operativos en este cliente.";
  }
}
