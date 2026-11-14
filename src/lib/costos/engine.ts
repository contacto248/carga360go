import { CITIES, cityByName } from "../catalog";
import { estimatePrice } from "../pricing";
import { dieselZoneFor, resolveDiesel, type DieselZone } from "./diesel";
import { DRIVING_RULE, planDriving, type DrivingPlan } from "./driving-rules";
import { haversineM } from "./geometry";
import { getParams, type CostParams } from "./params";
import { cachedRoute, geocode, getRoute } from "./routing";
import { detectTolls } from "./tolls";
import type { Component, DataStatus, LatLon, Place, RouteResult, TollLine } from "./types";
import { isVehicleClassId, TOLL_CATEGORY_LABELS, VEHICLE_CLASSES, vehicleForEquipment, type VehicleClassId } from "./vehicles";
import { cityCoords } from "../geo";

export const ENGINE_VERSION = "motor-costos-1.0";

/** Texto obligatorio en toda vista del costo: nunca es un precio prometido. */
export { REFERENCE_NOTICE } from "./notice";
import { REFERENCE_NOTICE } from "./notice";

export type QuoteInput = {
  origin: string | (LatLon & { label?: string });
  destination: string | (LatLon & { label?: string });
  vehicle?: VehicleClassId;
  equipment?: string;
  weightT?: number | null;
};

export type QuoteResult = {
  engineVersion: string;
  method: "motor" | "respaldo_linea_recta";
  computedAt: string;
  paramsVersion: string;
  origin: Place;
  destination: Place;
  vehicle: { id: VehicleClassId; label: string; axles: number; trailer: boolean; tollClassification: string[] };
  weightT: number | null;
  route: {
    provider: string;
    profile: string;
    truckAware: boolean;
    km: number;
    durationProviderH: number;
    durationTruckH: number;
    viaLabel: string | null;
    roads: { name: string; km: number }[];
    tollRoadKm: number;
    alternatives: { km: number; durationH: number }[];
    fetchedAt: string;
    cached: boolean;
    attribution: string;
  } | null;
  driving: (DrivingPlan & { rule: string; sourceUrl: string; sourceUrl2: string }) | null;
  tolls: TollLine[];
  diesel: {
    zone: DieselZone | null;
    priceGross: number | null;
    priceNet: number | null;
    status: DataStatus;
    fetchedAt: string | null;
    source: string;
    sourceUrl: string | null;
    warning: string | null;
    kmPerL: number;
    liters: number;
    returnLiters: number;
  } | null;
  components: Component[];
  totals: {
    obligatorios: number;
    operacionales: number;
    costoBase: number;
    margen: number;
    precioNeto: number;
    iva: number;
    precioTotal: number;
    complete: boolean;
    pending: string[];
  };
  warnings: string[];
  notice: string;
  fallback: { min: number; max: number; km: number; note: string } | null;
};

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

function siteRegionOf(place: Place): { regionId: string | null; zone: string | null } {
  // Ciudad del catálogo por nombre; si no, la ciudad del catálogo más cercana.
  const city = cityByName(place.label);
  if (city) return { regionId: city.regionId, zone: city.zone };
  let best: { regionId: string; zone: string; d: number } | null = null;
  for (const c of CITIES) {
    const coords = cityCoords(c.name);
    if (!coords) continue;
    const d = haversineM(place, { lat: coords[0], lon: coords[1] });
    if (!best || d < best.d) best = { regionId: c.regionId, zone: c.zone, d };
  }
  return best && best.d < 150_000 ? { regionId: best.regionId, zone: best.zone } : { regionId: null, zone: null };
}

function roadsSummary(route: RouteResult) {
  const out: { name: string; km: number }[] = [];
  for (const s of route.steps) {
    const name = [s.name, s.ref && !s.name.includes(s.ref) ? `(${s.ref})` : ""].filter(Boolean).join(" ") || "(sin nombre)";
    const last = out[out.length - 1];
    if (last && last.name === name) last.km += s.distanceM / 1000;
    else out.push({ name, km: s.distanceM / 1000 });
  }
  return out.filter((r) => r.km >= 5).map((r) => ({ name: r.name, km: r1(r.km) }));
}

function resolveVehicle(input: QuoteInput): VehicleClassId {
  if (input.vehicle && isVehicleClassId(input.vehicle)) return input.vehicle;
  return vehicleForEquipment(input.equipment ?? "");
}

function statusOf(parts: DataStatus[]): DataStatus {
  if (parts.includes("vencido")) return "vencido";
  if (parts.includes("pendiente")) return "pendiente";
  if (parts.includes("estimado")) return "estimado";
  return "verificado";
}

/** Cálculo puro (sin red): misma función para cotizador, publicación, panel y API. */
export function computeQuote(input: QuoteInput, origin: Place, destination: Place, route: RouteResult | null, params: CostParams = getParams(), now = new Date()): QuoteResult {
  const vehicleId = resolveVehicle(input);
  const vehicle = VEHICLE_CLASSES[vehicleId];
  const vp = params.vehicles[vehicleId];
  const warnings: string[] = [];
  const iva = params.ivaPct / 100;
  const toNet = (gross: number) => (params.preciosPublicosConIva ? gross / (1 + iva) : gross);
  const weightT = typeof input.weightT === "number" && input.weightT > 0 ? input.weightT : null;
  const components: Component[] = [];
  const paramSrc = "Parámetro configurable (no es dato oficial)";
  const today = now.toISOString().slice(0, 10);

  const tollClassification = [
    `Concesiones interurbanas: ${TOLL_CATEGORY_LABELS[vehicle.axles <= 2 ? "camion_2_ejes" : "camion_mas_2_ejes"]}`,
    `Pórticos free flow: ${TOLL_CATEGORY_LABELS[vehicle.trailer ? "camion_con_remolque" : "camion_sin_remolque"]}`,
  ];

  if (!route) {
    const legacy = typeof input.origin === "string" && typeof input.destination === "string" ? estimatePrice(input.origin, input.destination, input.equipment ?? "otro") : null;
    warnings.push("No se pudo calcular la ruta real: el motor no tiene datos. Se muestra el cálculo antiguo (línea recta × 1,25 × tarifa por km) solo como respaldo.");
    return {
      engineVersion: ENGINE_VERSION,
      method: "respaldo_linea_recta",
      computedAt: now.toISOString(),
      paramsVersion: params.version,
      origin,
      destination,
      vehicle: { id: vehicleId, label: vehicle.label, axles: vehicle.axles, trailer: vehicle.trailer, tollClassification },
      weightT,
      route: null,
      driving: null,
      tolls: [],
      diesel: null,
      components: [],
      totals: { obligatorios: 0, operacionales: 0, costoBase: 0, margen: 0, precioNeto: 0, iva: 0, precioTotal: 0, complete: false, pending: ["ruta"] },
      warnings,
      notice: REFERENCE_NOTICE,
      fallback: legacy ? { min: legacy.min, max: legacy.max, km: legacy.km, note: "Cálculo antiguo de respaldo: no es costo real del motor." } : null,
    };
  }

  const km = route.distanceM / 1000;
  const returnPct = params.retornoVacioPct / 100;
  const returnKm = km * returnPct;
  const truckH = (route.durationS / 3600) * params.factorDuracionCamion;
  const workH = params.horasCargaDescarga + params.horasEspera;
  const driving = planDriving(truckH, workH);
  const returnPlan = returnPct > 0 ? planDriving(truckH * returnPct, 0) : null;
  if (!route.truckAware) warnings.push("Ruta calculada con perfil de auto (OSRM público): no considera restricciones para camiones; la duración se ajusta con un factor configurable.");
  if (route.viaLabel) warnings.push(`Ruta forzada por corredor de carga: ${route.viaLabel}.`);

  // Combustible
  const loadShare = weightT === null ? 1 : Math.min(1, weightT / vehicle.payloadT);
  if (weightT === null) warnings.push("Sin peso informado: el rendimiento se calcula con el camión a plena carga.");
  const kmPerL = vp.rendVacioKmL - (vp.rendVacioKmL - vp.rendCargadoKmL) * loadShare;
  const liters = km / kmPerL;
  const returnLiters = returnKm / vp.rendVacioKmL;
  const o = siteRegionOf(origin);
  const d = siteRegionOf(destination);
  const zoneO = dieselZoneFor(o.regionId, o.zone);
  const zoneD = dieselZoneFor(d.regionId, d.zone);
  const zones = (params.puntoAbastecimiento === "destino" ? [zoneD] : params.puntoAbastecimiento === "promedio" ? [zoneO, zoneD] : [zoneO]).filter(Boolean) as DieselZone[];
  const resolutions = zones.map((z) => resolveDiesel(z, params.dieselFrescoHoras, params.dieselVigenciaDias, now));
  const usable = resolutions.filter((r) => r.price !== null);
  const dieselGross = usable.length === resolutions.length && usable.length > 0 ? usable.reduce((s, r) => s + (r.price as number), 0) / usable.length : null;
  const dieselStatus: DataStatus = zones.length === 0 ? "pendiente" : statusOf(resolutions.map((r) => r.status));
  for (const r of resolutions) if (r.warning) warnings.push(`Diésel ${r.zone}: ${r.warning}`);
  if (zones.length === 0) warnings.push("No se pudo asignar una zona de precio del diésel al origen/destino: combustible PENDIENTE.");
  const dieselNet = dieselGross === null ? null : Math.max(0, toNet(dieselGross) - params.recuperoImpEspecificoClpL);
  const fuelAmount = dieselNet === null ? null : r0(liters * dieselNet);
  const fuelDate = resolutions.map((r) => r.fetchedAt).filter(Boolean).sort()[0] ?? null;
  components.push({
    key: "combustible",
    label: "Combustible (diésel)",
    group: "obligatorio",
    amount: fuelAmount,
    status: dieselNet === null ? dieselStatus : "estimado",
    source: resolutions.map((r) => r.sourceLabel).join(" + ") || "Sin fuente",
    date: fuelDate,
    detail:
      dieselNet === null
        ? `${r1(liters)} L estimados; falta precio del diésel vigente.`
        : `${r1(km)} km ÷ ${r1(kmPerL)} km/L = ${r1(liters)} L (estimación) × $${r1(dieselNet)}/L neto` +
          (params.preciosPublicosConIva ? ` (precio público $${r1(dieselGross as number)}/L ÷ ${1 + iva})` : "") +
          `. Zona CNE: ${zones.join(" y ")}.`,
  });

  // Peajes
  const tolls = detectTolls(route, vehicle, params.umbralPeajeMetros, now).map((t) => ({ ...t, amountNet: t.amountGross === null ? null : Math.round(toNet(t.amountGross) * 100) / 100 }));
  const tollGross = tolls.reduce((s, t) => s + (t.amountGross ?? 0), 0);
  const tollNet = tolls.reduce((s, t) => s + (t.amountNet ?? 0), 0);
  const tollPending = tolls.filter((t) => t.amountGross === null);
  const tollStatus = tolls.length ? statusOf(tolls.map((t) => t.status)) : "estimado";
  if (tollPending.length) warnings.push(`Peajes PENDIENTES (sin tarifa verificada): ${tollPending.map((t) => t.name).join(", ")}. El total de peajes es parcial.`);
  if (!tolls.length) warnings.push("La ruta no cruza plazas de peaje registradas en la base (la base cubre la Ruta 5 Norte Caldera–Santiago y pórticos indicados).");
  const urbanSteps = route.steps.filter((s) => s.toll && /autopista|costanera|vespucio|general velásquez/i.test(s.name));
  if (urbanSteps.length) warnings.push(`La ruta usa autopistas urbanas con cobro free flow (${[...new Set(urbanSteps.map((s) => s.name))].join(", ")}); solo se suman los pórticos cargados en la base.`);
  components.push({
    key: "peajes",
    label: `Peajes (${tolls.length} ${tolls.length === 1 ? "plaza" : "plazas/pórticos"})`,
    group: "obligatorio",
    amount: r0(tollNet),
    status: tollPending.length ? "pendiente" : tollStatus,
    source: "MOP – Dirección General de Concesiones, tarifas 2026",
    date: tolls.map((t) => t.checkedAt).filter(Boolean).sort()[0] ?? null,
    detail: `Tarifas publicadas suman $${r0(tollGross).toLocaleString("es-CL")} (con IVA); neto $${r0(tollNet).toLocaleString("es-CL")}.`,
  });

  // Conductor y viáticos
  const days = driving.serviceDays;
  components.push({
    key: "conductor",
    label: "Conductor y viáticos",
    group: "obligatorio",
    amount: r0(days * (vp.conductorClpDia + vp.viaticoClpDia)),
    status: "estimado",
    source: paramSrc,
    date: today,
    detail: `${days} ${days === 1 ? "día" : "días"} de servicio × ($${vp.conductorClpDia.toLocaleString("es-CL")} remuneración + $${vp.viaticoClpDia.toLocaleString("es-CL")} viático). Jornada según art. 25 bis del Código del Trabajo.`,
  });
  components.push({
    key: "seguros",
    label: "Seguros y otros costos asignables",
    group: "obligatorio",
    amount: r0(days * vp.seguroClpDia),
    status: "estimado",
    source: paramSrc,
    date: today,
    detail: `${days} × $${vp.seguroClpDia.toLocaleString("es-CL")} por día (prorrateo de seguros del vehículo y de la carga).`,
  });

  const perKm = (key: string, label: string, rate: number) =>
    components.push({ key, label, group: "operacional", amount: r0(km * rate), status: "estimado", source: paramSrc, date: today, detail: `${r1(km)} km × $${rate}/km.` });
  perKm("neumaticos", "Desgaste de neumáticos", vp.neumaticosClpKm);
  perKm("mantenimiento", "Mantenimiento preventivo", vp.mantenimientoClpKm);
  perKm("depreciacion", "Depreciación del vehículo", vp.depreciacionClpKm);
  components.push({
    key: "esperas",
    label: "Tiempos de espera",
    group: "operacional",
    amount: r0(params.horasEspera * vp.esperaClpHora),
    status: "estimado",
    source: paramSrc,
    date: today,
    detail: `${params.horasEspera} h × $${vp.esperaClpHora.toLocaleString("es-CL")}/h.`,
  });
  components.push({
    key: "carga_descarga",
    label: "Carga y descarga",
    group: "operacional",
    amount: r0(params.horasCargaDescarga * vp.esperaClpHora),
    status: "estimado",
    source: paramSrc,
    date: today,
    detail: `${params.horasCargaDescarga} h × $${vp.esperaClpHora.toLocaleString("es-CL")}/h.`,
  });
  components.push({
    key: "adicionales",
    label: "Gastos adicionales",
    group: "operacional",
    amount: r0(params.adicionalesClp),
    status: "estimado",
    source: paramSrc,
    date: today,
    detail: params.adicionalesClp ? "Monto fijo por viaje." : "Sin gastos adicionales configurados.",
  });
  // Retorno vacío
  let returnAmount = 0;
  let returnDetail = "No aplicado (parámetro retorno vacío = 0%).";
  if (returnPct > 0 && returnPlan) {
    const fuelR = dieselNet === null ? 0 : returnLiters * dieselNet;
    const tollsR = tollNet * returnPct;
    const perKmR = returnKm * (vp.neumaticosClpKm + vp.mantenimientoClpKm + vp.depreciacionClpKm);
    const driverR = returnPlan.serviceDays * (vp.conductorClpDia + vp.viaticoClpDia + vp.seguroClpDia) * 1;
    returnAmount = fuelR + tollsR + perKmR + driverR;
    returnDetail = `${params.retornoVacioPct}% del trayecto (${r1(returnKm)} km vacío): combustible ${r1(returnLiters)} L, peajes proporcionales (supuesto: mismas plazas), desgaste y ${returnPlan.serviceDays} día(s) de conductor.`;
  }
  components.push({
    key: "retorno",
    label: "Retorno vacío",
    group: "operacional",
    amount: r0(returnAmount),
    status: returnPct > 0 && dieselNet === null ? "pendiente" : "estimado",
    source: paramSrc,
    date: today,
    detail: returnDetail,
  });

  const sum = (group: Component["group"]) => components.filter((c) => c.group === group).reduce((s, c) => s + (c.amount ?? 0), 0);
  const obligatorios = sum("obligatorio");
  const operacionales = sum("operacional");
  const costoBase = obligatorios + operacionales;
  const margen = r0((costoBase * params.margenPct) / 100);
  const precioNeto = costoBase + margen;
  const ivaAmount = params.aplicaIva ? r0(precioNeto * iva) : 0;
  components.push({ key: "margen", label: "Margen interno", group: "margen", amount: margen, status: "estimado", source: "Parámetro interno (solo administración)", date: today, detail: `${params.margenPct}% sobre el costo base.` });
  components.push({ key: "iva", label: `IVA (${params.ivaPct}%)`, group: "impuesto", amount: ivaAmount, status: "verificado", source: "Tasa de IVA vigente en Chile", date: today, detail: params.aplicaIva ? "Sobre el precio neto." : "No aplicado." });
  const pending = components.filter((c) => c.status === "pendiente" || c.status === "vencido").map((c) => c.key);

  return {
    engineVersion: ENGINE_VERSION,
    method: "motor",
    computedAt: now.toISOString(),
    paramsVersion: params.version,
    origin,
    destination,
    vehicle: { id: vehicleId, label: vehicle.label, axles: vehicle.axles, trailer: vehicle.trailer, tollClassification },
    weightT,
    route: {
      provider: route.provider,
      profile: route.profile,
      truckAware: route.truckAware,
      km: r1(km),
      durationProviderH: r1(route.durationS / 3600),
      durationTruckH: r1(truckH),
      viaLabel: route.viaLabel,
      roads: roadsSummary(route),
      tollRoadKm: r1(route.steps.filter((s) => s.toll).reduce((s, x) => s + x.distanceM, 0) / 1000),
      alternatives: route.alternatives.map((a) => ({ km: r1(a.distanceM / 1000), durationH: r1(a.durationS / 3600) })),
      fetchedAt: route.fetchedAt,
      cached: route.cached,
      attribution: route.attribution,
    },
    driving: { ...driving, rule: DRIVING_RULE.citation, sourceUrl: DRIVING_RULE.sourceUrl, sourceUrl2: DRIVING_RULE.sourceUrl2 },
    tolls,
    diesel: {
      zone: zones[0] ?? null,
      priceGross: dieselGross === null ? null : r1(dieselGross),
      priceNet: dieselNet === null ? null : r1(dieselNet),
      status: dieselStatus,
      fetchedAt: fuelDate,
      source: resolutions.map((r) => r.sourceLabel).join(" + "),
      sourceUrl: resolutions[0]?.sourceUrl ?? null,
      warning: resolutions.map((r) => r.warning).filter(Boolean).join(" ") || null,
      kmPerL: r1(kmPerL),
      liters: r1(liters),
      returnLiters: r1(returnLiters),
    },
    components,
    totals: { obligatorios, operacionales, costoBase, margen, precioNeto, iva: ivaAmount, precioTotal: precioNeto + ivaAmount, complete: pending.length === 0, pending },
    warnings,
    notice: REFERENCE_NOTICE,
    fallback: null,
  };
}

async function toPlace(value: QuoteInput["origin"]): Promise<Place> {
  if (typeof value === "string") return geocode(value);
  return { lat: value.lat, lon: value.lon, label: value.label ?? `${value.lat.toFixed(4)}, ${value.lon.toFixed(4)}`, region: null, source: "coordenadas entregadas" };
}

function placeSync(value: QuoteInput["origin"]): Place | null {
  if (typeof value !== "string") return { lat: value.lat, lon: value.lon, label: value.label ?? `${value.lat}, ${value.lon}`, region: null, source: "coordenadas entregadas" };
  const c = cityCoords(value);
  return c ? { lat: c[0], lon: c[1], label: value, region: null, source: "catálogo Carga360go (centro urbano aproximado)" } : null;
}

/** Cotización completa: geocodifica, obtiene la ruta real (con caché) y calcula. Si la ruta falla, respaldo marcado. */
export async function quote(input: QuoteInput, now = new Date()): Promise<QuoteResult> {
  const params = getParams();
  const [origin, destination] = await Promise.all([toPlace(input.origin), toPlace(input.destination)]);
  let route: RouteResult | null = null;
  try {
    route = await getRoute(origin, destination, params.rutaCacheDias);
  } catch (error) {
    console.error("[costos] ruta no disponible", error instanceof Error ? error.message : error);
  }
  return computeQuote(input, origin, destination, route, params, now);
}

/** Versión sin red para listados (tarjetas de cargas): usa solo rutas en caché; si no hay, respaldo marcado. */
export function quoteFromCache(input: QuoteInput, now = new Date()): QuoteResult | null {
  const origin = placeSync(input.origin);
  const destination = placeSync(input.destination);
  if (!origin || !destination) return null;
  const params = getParams();
  return computeQuote(input, origin, destination, cachedRoute(origin, destination, params.rutaCacheDias), params, now);
}

/**
 * Vista pública (cotizador, publicación de cargas, transportista y cliente): el costo real desglosado, sin margen
 * ni parámetros internos. El monto solo se incluye si la opción de administración lo permite.
 */
export function publicView(result: QuoteResult, showAmount: boolean) {
  const visible = result.components.filter((c) => c.group === "obligatorio" || c.group === "operacional");
  const costoBase = result.totals.costoBase;
  const p = getParams();
  const iva = p.aplicaIva ? Math.round((costoBase * p.ivaPct) / 100) : 0;
  return {
    method: result.method,
    notice: result.notice,
    km: result.route?.km ?? result.fallback?.km ?? null,
    durationTruckH: result.route?.durationTruckH ?? null,
    serviceDays: result.driving?.serviceDays ?? null,
    vehicle: result.vehicle.label,
    complete: result.totals.complete,
    pending: result.totals.pending,
    showAmount,
    components: visible.map((c) => ({ key: c.key, label: c.label, group: c.group, status: c.status, source: c.source, date: c.date, detail: c.detail, amount: showAmount ? c.amount : null })),
    tolls: result.tolls.map((t) => ({ name: t.name, concession: t.concession, category: t.categoryLabel, amount: showAmount ? t.amountGross : null, status: t.status, sourceUrl: t.sourceUrl })),
    diesel: result.diesel ? { zone: result.diesel.zone, price: showAmount ? result.diesel.priceGross : null, fetchedAt: result.diesel.fetchedAt, source: result.diesel.source, liters: result.diesel.liters, status: result.diesel.status } : null,
    costoBase: showAmount ? costoBase : null,
    iva: showAmount ? iva : null,
    costoTotal: showAmount ? costoBase + iva : null,
    // Rango opcional (parámetro rangoPublicoPct, 0 por defecto = desactivado).
    rango: showAmount && p.rangoPublicoPct > 0 && result.method === "motor"
      ? { pct: p.rangoPublicoPct, min: Math.round((costoBase + iva) * (1 - p.rangoPublicoPct / 100)), max: Math.round((costoBase + iva) * (1 + p.rangoPublicoPct / 100)) }
      : null,
    fallback: showAmount && result.fallback ? result.fallback : result.fallback ? { ...result.fallback, min: null, max: null } : null,
    warnings: result.warnings,
    attribution: result.route?.attribution ?? null,
  };
}
