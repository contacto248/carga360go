import { randomUUID } from "crypto";
import { getDb } from "../db";
import { fetchSource, SourceError } from "./http";
import type { DataStatus } from "./types";

/**
 * Precio del diésel. Fuentes:
 *  1. Bencina en Línea (CNE), archivo público por zona: https://api.bencinaenlinea.cl/api/estaciones/precios_combustibles/export_zonal
 *     CSV con promedio, mínimo y máximo por zona (Norte, Centro, Metropolitana, Sur) de los precios que informan
 *     las estaciones. Sin token. El archivo no trae fecha de publicación: se guarda la fecha y hora de consulta.
 *     Ojo con las condiciones: el portal ciudadano indica uso particular; para uso comercial se debe confirmar con la
 *     CNE (soporteapi@cne.cl). Ver CAMBIOS_MOTOR_COSTOS.md.
 *  2. API CNE v4 (https://api.cne.cl, /api/v4/estaciones): exige token Bearer personal (CNE_API_TOKEN).
 *     Sin token el adaptador queda NO CONECTADO.
 */
export const BENCINA_ZONAL_URL = "https://api.bencinaenlinea.cl/api/estaciones/precios_combustibles/export_zonal";
export const CNE_API_URL = "https://api.cne.cl/api/v4/estaciones";

export type DieselZone = "Zona Norte" | "Zona Centro" | "Metropolitana" | "Zona Sur";
export const DIESEL_ZONES: DieselZone[] = ["Zona Norte", "Zona Centro", "Metropolitana", "Zona Sur"];

/**
 * Zona de precio para una región. SUPUESTO configurable: el archivo zonal de la CNE no publica qué regiones
 * componen cada zona; se usa la agrupación norte/centro/sur del sitio y la Región Metropolitana aparte.
 */
export function dieselZoneFor(regionId: string | null, siteZone: string | null): DieselZone | null {
  if (regionId === "metropolitana") return "Metropolitana";
  if (siteZone === "norte") return "Zona Norte";
  if (siteZone === "centro") return "Zona Centro";
  if (siteZone === "sur") return "Zona Sur";
  return null;
}

export type DieselObservation = { zone: DieselZone; price: number; min: number | null; max: number | null };

export interface DieselAdapter {
  id: string;
  label: string;
  url: string;
  connected(): boolean;
  requirement: string;
  fetch(): Promise<DieselObservation[]>;
}

/** Parser del CSV zonal (campos con comillas). */
export function parseZonalCsv(text: string): DieselObservation[] {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length < 2) throw new SourceError("CSV zonal vacío.");
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]);
  const col = (name: string) => header.indexOf(name);
  const iZone = col("zona_geografica_nombre");
  const iName = col("combustible_nombre_largo");
  const iAvg = col("precio_promedio");
  const iMin = col("precio_min");
  const iMax = col("precio_max");
  if ([iZone, iName, iAvg].some((i) => i < 0)) throw new SourceError("CSV zonal con columnas inesperadas.");
  const out: DieselObservation[] = [];
  for (const line of lines.slice(1)) {
    const cells = split(line);
    if (!/diesel|diésel/i.test(cells[iName] ?? "")) continue;
    const zone = cells[iZone] as DieselZone;
    const price = Number(cells[iAvg]);
    if (!DIESEL_ZONES.includes(zone) || !Number.isFinite(price) || price < 300 || price > 5000) continue;
    out.push({ zone, price: Math.round(price * 100) / 100, min: Number(cells[iMin]) || null, max: Number(cells[iMax]) || null });
  }
  if (!out.length) throw new SourceError("El CSV zonal no trae precios de diésel válidos.");
  return out;
}

export const bencinaZonalAdapter: DieselAdapter = {
  id: "bencina_en_linea_zonal",
  label: "CNE – Bencina en Línea, promedio por zona (archivo público)",
  url: BENCINA_ZONAL_URL,
  connected: () => process.env.COSTOS_DIESEL_ZONAL_ENABLED !== "false",
  requirement: "Sin token. Confirmar con la CNE las condiciones para uso comercial.",
  async fetch() {
    const response = await fetchSource(BENCINA_ZONAL_URL, { headers: { Accept: "text/csv,text/plain,*/*" } });
    return parseZonalCsv(await response.text());
  },
};

export const cneApiAdapter: DieselAdapter = {
  id: "cne_api_v4",
  label: "API CNE v4 (estaciones y precios)",
  url: CNE_API_URL,
  connected: () => Boolean(process.env.CNE_API_TOKEN),
  requirement: "Requiere CNE_API_TOKEN (registro gratuito en api.cne.cl). NO CONECTADO sin token; respuesta no probada.",
  async fetch() {
    const token = process.env.CNE_API_TOKEN;
    if (!token) throw new SourceError("API CNE no conectada (falta CNE_API_TOKEN).");
    const response = await fetchSource(CNE_API_URL, { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 40_000 });
    const data = (await response.json()) as { data?: { region?: string; precios?: Record<string, { precio?: string | number }> }[] };
    // La estructura exacta debe confirmarse con un token real; mientras, no se usa como fuente principal.
    throw new SourceError(`API CNE: respuesta recibida (${Array.isArray(data.data) ? data.data.length : 0} registros) pero el mapeo a zonas no está validado.`);
  },
};

export const DIESEL_ADAPTERS: DieselAdapter[] = [bencinaZonalAdapter, cneApiAdapter];

function setSource(id: string, ok: boolean, error: string | null) {
  const stamp = new Date().toISOString();
  const db = getDb();
  const adapter = DIESEL_ADAPTERS.find((a) => a.id === id)!;
  db.prepare(
    `INSERT INTO cost_sources (id, kind, name, url, status, last_ok_at, last_error, last_error_at, updated_at)
     VALUES (?, 'diesel', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, last_ok_at = COALESCE(excluded.last_ok_at, cost_sources.last_ok_at),
       last_error = excluded.last_error, last_error_at = COALESCE(excluded.last_error_at, cost_sources.last_error_at), updated_at = excluded.updated_at`,
  ).run(id, adapter.label, adapter.url, ok ? "ok" : adapter.connected() ? "error" : "no_conectado", ok ? stamp : null, error, error ? stamp : null, stamp);
}

/** Consulta las fuentes conectadas y guarda cada observación en el histórico (cost_diesel_prices). */
export async function refreshDiesel(): Promise<{ id: string; result: string }[]> {
  const db = getDb();
  const out: { id: string; result: string }[] = [];
  for (const adapter of DIESEL_ADAPTERS) {
    if (!adapter.connected()) {
      setSource(adapter.id, false, `NO CONECTADO: ${adapter.requirement}`);
      out.push({ id: adapter.id, result: "no conectado" });
      continue;
    }
    try {
      const rows = await adapter.fetch();
      const stamp = new Date().toISOString();
      const ins = db.prepare(
        `INSERT INTO cost_diesel_prices (id, source_id, zone, price, price_min, price_max, unit, fetched_at) VALUES (?, ?, ?, ?, ?, ?, '$/L', ?)`,
      );
      db.transaction(() => {
        for (const r of rows) ins.run(randomUUID(), adapter.id, r.zone, r.price, r.min, r.max, stamp);
      })();
      setSource(adapter.id, true, null);
      out.push({ id: adapter.id, result: `${rows.length} zonas` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSource(adapter.id, false, message.slice(0, 300));
      out.push({ id: adapter.id, result: `error: ${message}` });
    }
  }
  return out;
}

export type DieselResolution = {
  zone: DieselZone;
  price: number | null;
  status: DataStatus;
  fetchedAt: string | null;
  sourceId: string | null;
  sourceLabel: string;
  sourceUrl: string | null;
  warning: string | null;
};

/**
 * Precio a usar: el último valor verificado de la zona. Fresco (≤ dieselFrescoHoras): verificado. Más antiguo pero
 * dentro de la vigencia (≤ dieselVigenciaDias): se usa con advertencia y su fecha. Fuera de vigencia: VENCIDO
 * (el combustible queda PENDIENTE). Sin datos: PENDIENTE.
 */
export function resolveDiesel(zone: DieselZone, freshHours: number, validityDays: number, now = new Date()): DieselResolution {
  const row = getDb()
    .prepare(`SELECT source_id, price, fetched_at FROM cost_diesel_prices WHERE zone = ? ORDER BY fetched_at DESC LIMIT 1`)
    .get(zone) as { source_id: string; price: number; fetched_at: string } | undefined;
  if (!row) {
    return { zone, price: null, status: "pendiente", fetchedAt: null, sourceId: null, sourceLabel: "Sin datos", sourceUrl: null, warning: "No hay precio del diésel registrado: el combustible queda PENDIENTE." };
  }
  const adapter = DIESEL_ADAPTERS.find((a) => a.id === row.source_id);
  const ageH = (now.getTime() - Date.parse(row.fetched_at)) / 3_600_000;
  const base = { zone, fetchedAt: row.fetched_at, sourceId: row.source_id, sourceLabel: adapter?.label ?? row.source_id, sourceUrl: adapter?.url ?? null };
  if (ageH <= freshHours) return { ...base, price: row.price, status: "verificado", warning: null };
  if (ageH <= validityDays * 24) {
    return { ...base, price: row.price, status: "verificado", warning: `Último valor verificado del ${row.fetched_at.slice(0, 10)} (la fuente no se ha actualizado desde entonces).` };
  }
  return { ...base, price: null, status: "vencido", warning: `El último precio (${row.fetched_at.slice(0, 10)}) superó la vigencia de ${validityDays} días: combustible PENDIENTE.` };
}

export function dieselHistory(limit = 200) {
  return getDb()
    .prepare(`SELECT source_id, zone, price, price_min, price_max, fetched_at FROM cost_diesel_prices ORDER BY fetched_at DESC, zone LIMIT ?`)
    .all(limit) as { source_id: string; zone: string; price: number; price_min: number | null; price_max: number | null; fetched_at: string }[];
}
