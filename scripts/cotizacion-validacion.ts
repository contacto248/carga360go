/**
 * Cotización de validación Antofagasta → Santiago con el motor de costos (red real: OSRM, CNE/Bencina en Línea, PDF MOP).
 * Uso (BD temporal, nunca la de producción):
 *   DATABASE_PATH=/tmp/c360-cot.sqlite OUT_DIR=/tmp/salida npx tsx scripts/cotizacion-validacion.ts
 * Escribe COTIZACION_ANTOFAGASTA_SANTIAGO.md y .json en OUT_DIR.
 */
import fs from "node:fs";
import path from "node:path";
import { MotorCostProvider, costSentence } from "../src/lib/agent/costs";
import { getDb } from "../src/lib/db";
import { publicView, quote, type QuoteResult } from "../src/lib/costos/engine";
import { getParams } from "../src/lib/costos/params";
import { runCostRefresh } from "../src/lib/costos/refresh";
import type { VehicleClassId } from "../src/lib/costos/vehicles";
import { matchTrucksForLoad } from "../src/lib/match";
import { saveSettings } from "../src/lib/settings";

const OUT = process.env.OUT_DIR || process.cwd();
const VEHICLES: VehicleClassId[] = ["camion_2_ejes", "tracto_semirremolque_5_ejes"];
const clp = (n: number | null | undefined) => (n === null || n === undefined ? "PENDIENTE" : `$${Math.round(n).toLocaleString("es-CL")}`);

if (!process.env.DATABASE_PATH || /opt\/carga360go|data\/carga360go\.sqlite/.test(process.env.DATABASE_PATH)) {
  console.error("Usa DATABASE_PATH con una base temporal (no la de producción).");
  process.exit(1);
}

function section(id: VehicleClassId, r: QuoteResult): string {
  const lines: string[] = [];
  lines.push(`## ${r.vehicle.label} (\`${id}\`)`, "");
  lines.push(`- Clasificación: ${r.vehicle.axles} ejes, remolque: ${r.vehicle.trailer ? "sí" : "no"}. Categorías de peaje: ${r.vehicle.tollClassification.join("; ")}.`);
  lines.push(`- Origen: ${r.origin.label} (${r.origin.lat}, ${r.origin.lon}), fuente ${r.origin.source}. Destino: ${r.destination.label} (${r.destination.lat}, ${r.destination.lon}).`);
  if (r.route) {
    lines.push(
      `- Ruta: ${r.route.provider} perfil \`${r.route.profile}\` (apto camión: ${r.route.truckAware ? "sí" : "no"})${r.route.viaLabel ? `, vía ${r.route.viaLabel}` : ""}. **${r.route.km} km**, duración del proveedor ${r.route.durationProviderH} h, ajustada a camión ${r.route.durationTruckH} h. Consultada ${r.route.fetchedAt}. ${r.route.attribution}`,
    );
  } else lines.push("- Ruta: PENDIENTE (proveedor de rutas no disponible).");
  if (r.driving) lines.push(`- Conducción y descanso (${r.driving.rule}; ${r.driving.sourceUrl}): ${r.driving.serviceDays} día(s) de servicio.`);
  if (r.diesel) {
    lines.push(
      `- Diésel: ${r.diesel.source} — ${r.diesel.zone ?? "sin zona"}, ${clp(r.diesel.priceGross)}/L público (con IVA) → ${r.diesel.priceNet ?? "PENDIENTE"} $/L neto; estado **${r.diesel.status}**; fecha del dato ${r.diesel.fetchedAt ?? "—"} (UTC); ${r.diesel.sourceUrl ?? ""}.`,
    );
    lines.push(`- Rendimiento ${r.diesel.kmPerL} km/L (parámetro configurable) → **${r.diesel.liters} L** (estimación).`);
  }
  lines.push("", "### Peajes detectados", "", "| # | Plaza | Concesión | Categoría | Tarifa (con IVA) | Neto | Tipo | Estado | Fuente |", "|---|---|---|---|---|---|---|---|---|");
  r.tolls.forEach((t, i) =>
    lines.push(`| ${i + 1} | ${t.name} | ${t.concession} | ${t.categoryLabel} | ${clp(t.amountGross)} | ${clp(t.amountNet)} | ${t.rateType} | ${t.status} | ${t.sourceUrl ? `[PDF MOP](${t.sourceUrl})` : "—"} consultado ${t.checkedAt?.slice(0, 10) ?? "—"} |`),
  );
  lines.push("", "### Desglose", "", "| Grupo | Componente | Monto neto | Estado | Detalle | Fuente | Fecha |", "|---|---|---|---|---|---|---|");
  for (const c of r.components) lines.push(`| ${c.group} | ${c.label} | ${clp(c.amount)} | ${c.status} | ${c.detail.replace(/\|/g, "/")} | ${c.source} | ${c.date ?? "—"} |`);
  const t = r.totals;
  lines.push(
    "",
    `**Obligatorios ${clp(t.obligatorios)} · Operacionales estimados ${clp(t.operacionales)} · Costo base ${clp(t.costoBase)} · Margen ${clp(t.margen)} · Neto ${clp(t.precioNeto)} · IVA ${clp(t.iva)} · Precio referencial ${clp(t.precioTotal)}** (completo: ${t.complete ? "sí" : "no"}${t.pending.length ? `; pendientes: ${t.pending.join(", ")}` : ""}).`,
  );
  const pub = publicView(r, true);
  lines.push("", `Vista pública (cliente y transportista, sin margen): costo base ${clp(pub.costoBase)} + IVA ${clp(pub.iva)} = **${clp(pub.costoTotal)}**.`);
  if (r.warnings.length) lines.push("", `Advertencias: ${r.warnings.join(" ")}`);
  lines.push("");
  return lines.join("\n");
}

async function main() {
  getDb();
  const refresh = await runCostRefresh("admin");
  const params = getParams();
  const results: Record<string, QuoteResult> = {};
  for (const v of VEHICLES) results[v] = await quote({ origin: "Antofagasta", destination: "Santiago", vehicle: v });

  // Integraciones: agente comercial (misma función del motor) y Match (costo aproximado del viaje, desde caché).
  const agentEstimate = await new MotorCostProvider().estimate({ origin: "Antofagasta", destination: "Santiago", equipment: "rampla_plana", weightT: null });
  const agentSentence = costSentence(agentEstimate);
  saveSettings({ showSuggestedPrice: true });
  const load = { equipment: "rampla_plana" as const, weightT: 20, origin: "Antofagasta", destination: "Santiago", pickupDate: "2026-11-20", specs: {} };
  const truck = { equipment: "rampla_plana" as const, tonnage: 28, origin: "Antofagasta", destination: "Santiago", availableFrom: "2026-11-18", availableTo: "2026-11-25", specs: {} };
  const match = matchTrucksForLoad(load, [truck])[0]?.match ?? null;
  saveSettings({ showSuggestedPrice: false });

  const generated = new Date().toISOString();
  const md: string[] = [
    "# Cotización de validación: Antofagasta → Santiago",
    "",
    `Generada: ${generated} (UTC) con la rama integrada \`release/2026-11-15\`. Entorno: BD temporal, red real (OSRM público, Bencina en Línea export_zonal, PDF MOP DGC). Versión de parámetros: ${results[VEHICLES[0]].paramsVersion}.`,
    "",
    `${results[VEHICLES[0]].notice} El margen interno está en ${params.margenPct} % (parámetro de administración) y no aparece en vistas públicas ni en el agente.`,
    "",
    "## Refresco de fuentes previo",
    "",
    ...refresh.diesel.map((d) => `- \`${d.id}\`: ${d.result}`),
    ...refresh.tolls.map((d) => `- \`${d.id}\`: ${d.result}`),
    "",
    ...VEHICLES.map((v) => section(v, results[v])),
    "## Integración con el agente comercial y Match",
    "",
    `- Agente (equipo rampla plana → ${agentEstimate?.vehicleLabel ?? "—"}): cotización completa: ${agentEstimate?.complete ? "sí" : "no"}; costo con IVA ${clp(agentEstimate?.totalClp)}; guardada como borrador \`${agentEstimate?.quoteId ?? "—"}\` (canal api_agente_voz).`,
    `- Lo que dice el agente: «${agentSentence}»`,
    `- Match (carga rampla 20 t ↔ camión rampla 28 t, Antofagasta → Santiago): ${match ? `${match.score} % de compatibilidad; costo real aproximado del viaje ${clp(match.tripCost?.total ?? null)} (completo: ${match.tripCost?.complete ? "sí" : "no"}, ${match.tripCost?.km ?? "—"} km)` : "sin coincidencia"}.`,
    "",
    "## Qué es verificado y qué es estimado",
    "",
    "- Verificado: distancia y trazado (OSRM sobre OpenStreetMap), tarifas de peaje (PDF oficiales MOP DGC 2026, hash SHA-256), precio diésel por zona (archivo público CNE del día), regla art. 25 bis (BCN), tasa de IVA.",
    "- Estimado: duración de camión (factor sobre perfil auto), litros (rendimiento configurable), identidad de algunos pórticos ubicados por cercanía en OSM y todos los costos operacionales (conductor, seguros, neumáticos, mantenimiento, depreciación, esperas, carga y descarga), que son **parámetros configurables, no datos oficiales**.",
    "",
  ];
  const json = {
    generado: generated,
    rama: "release/2026-11-15",
    entorno: "BD temporal, red real (OSRM público, Bencina en Línea export_zonal, PDF MOP DGC)",
    refresco: refresh,
    parametros: params,
    cotizaciones: Object.fromEntries(VEHICLES.map((v) => [v, { completo: results[v].totals, vistaPublica: publicView(results[v], true), resultado: results[v] }])),
    agente: { estimacion: agentEstimate, frase: agentSentence },
    match,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "COTIZACION_ANTOFAGASTA_SANTIAGO.md"), md.join("\n").replace(/\r?\n/g, "\r\n"));
  fs.writeFileSync(path.join(OUT, "COTIZACION_ANTOFAGASTA_SANTIAGO.json"), JSON.stringify(json, null, 2));
  for (const v of VEHICLES) {
    const t = results[v].totals;
    console.log(`${v}: km=${results[v].route?.km} base=${t.costoBase} iva=${t.iva} referencial=${t.precioTotal} completo=${t.complete} pendientes=${t.pending.join(",") || "-"}`);
  }
  console.log(`agente: ${agentSentence}`);
  console.log(`match: ${JSON.stringify(match?.tripCost)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
