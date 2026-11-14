import { createHash } from "crypto";
import { getDb } from "../db";
import { nearestOnLine } from "./geometry";
import { fetchSource } from "./http";
import { NUEVA_ACONCAGUA_TBP } from "./tolls-data";
import type { DataStatus, RouteResult, TollLine } from "./types";
import { TOLL_CATEGORY_LABELS, tollCategory, type TollScheme, type VehicleClass } from "./vehicles";

export { TOLLS_CHECKED_AT } from "./tolls-seed";

export type PlazaRow = {
  id: string;
  name: string;
  concession: string;
  route: string;
  km: string | null;
  lat: number;
  lon: number;
  direction: "ambos" | "norte" | "sur";
  scheme: TollScheme;
  kind: string;
  location_source: string;
  location_note: string;
  source_id: string;
  note: string | null;
};

export type RateRow = { plaza_id: string; category: string; rate_type: string; amount: number; valid_from: string; valid_to: string; source_id: string; checked_at: string };
export type SourceRow = {
  id: string;
  kind: string;
  name: string;
  url: string;
  expected_sha256: string | null;
  last_sha256: string | null;
  status: string;
  last_ok_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  updated_at: string;
};

export function listPlazas(): PlazaRow[] {
  return getDb().prepare(`SELECT * FROM cost_toll_plazas WHERE active = 1 ORDER BY lat DESC`).all() as PlazaRow[];
}

export function listRates(): RateRow[] {
  return getDb().prepare(`SELECT * FROM cost_toll_rates ORDER BY plaza_id, category, rate_type`).all() as RateRow[];
}

export function listSources(kind?: string): SourceRow[] {
  const db = getDb();
  return (kind ? db.prepare(`SELECT * FROM cost_sources WHERE kind = ? ORDER BY id`).all(kind) : db.prepare(`SELECT * FROM cost_sources ORDER BY kind, id`).all()) as SourceRow[];
}

function dateOnly(iso: string) {
  return iso.slice(0, 10);
}

/**
 * Plazas que cruza la ruta: distancia del punto de la plaza a la geometría menor que el umbral y, si la plaza
 * cobra en un solo sentido, el tramo más cercano debe ir en ese sentido. Devuelve las plazas en orden de paso.
 */
export function detectTolls(route: Pick<RouteResult, "geometry">, vehicle: VehicleClass, thresholdM: number, at = new Date()): TollLine[] {
  const rates = listRates();
  const sources = new Map(listSources("peaje").map((s) => [s.id, s]));
  const today = dateOnly(at.toISOString());
  const hits: (TollLine & { order: number })[] = [];
  for (const plaza of listPlazas()) {
    const near = nearestOnLine({ lat: plaza.lat, lon: plaza.lon }, route.geometry);
    if (near.distanceM > thresholdM) continue;
    if (plaza.direction !== "ambos" && near.heading !== plaza.direction) continue;
    const category = tollCategory(vehicle, plaza.scheme);
    const source = sources.get(plaza.source_id);
    const candidates = rates.filter((r) => r.plaza_id === plaza.id && r.category === category && (r.rate_type === "unica" || r.rate_type === "TBFP"));
    const current = candidates.find((r) => r.valid_from <= today && today <= r.valid_to);
    const expired = !current && candidates.length > 0;
    const peak = rates.find((r) => r.plaza_id === plaza.id && r.category === category && r.rate_type === "TBP" && r.valid_from <= today && today <= r.valid_to);
    let status: DataStatus = "pendiente";
    const notes: string[] = [];
    if (current) {
      status = plaza.location_source === "osm_nombre" ? "verificado" : "estimado";
      if (plaza.location_source !== "osm_nombre") notes.push("Tarifa oficial verificada; la ubicación del pórtico/plaza se identificó por cercanía (confirmar).");
      if (source && source.status !== "ok") notes.push(`Fuente con aviso: ${source.status}${source.last_error ? ` (${source.last_error})` : ""}.`);
      if (current.rate_type === "TBFP" && peak) {
        notes.push(`Se usa tarifa fuera de punta; en horario punta es $${peak.amount.toLocaleString("es-CL")}.`);
        if (plaza.concession === "Nueva Aconcagua") notes.push(`Punta: ${NUEVA_ACONCAGUA_TBP}`);
      }
    } else if (expired) {
      status = "vencido";
      notes.push("La tarifa cargada ya no está vigente: falta cargar la tarifa del nuevo periodo.");
    } else {
      notes.push("Sin tarifa verificada para esta categoría.");
    }
    if (plaza.note) notes.push(plaza.note);
    hits.push({
      order: near.segment,
      plazaId: plaza.id,
      name: plaza.name,
      concession: plaza.concession,
      route: plaza.route,
      category,
      categoryLabel: TOLL_CATEGORY_LABELS[category] ?? category,
      amountGross: current ? current.amount : null,
      amountNet: null,
      rateType: current?.rate_type ?? "-",
      status,
      sourceUrl: source?.url ?? null,
      checkedAt: current ? dateOnly(current.checked_at) : null,
      validTo: current?.valid_to ?? candidates[0]?.valid_to ?? null,
      distanceToRouteM: Math.round(near.distanceM),
      note: notes.join(" "),
    });
  }
  return hits
    .sort((a, b) => a.order - b.order)
    .map((hit) => {
      const line: TollLine & { order?: number } = { ...hit };
      delete line.order;
      return line;
    });
}

/**
 * Revisión automática de las fuentes de peajes: descarga cada documento oficial y compara su huella SHA-256 con la
 * del documento verificado. Igual: la tarifa sigue verificada (se actualiza la fecha de consulta). Distinto: queda
 * "cambio detectado, requiere revisión" (no se reemplazan montos sin lectura humana). Falla de red: se registra el
 * error y las tarifas siguen usándose solo hasta su fecha de vigencia.
 */
export async function refreshTollSources(): Promise<{ id: string; result: string }[]> {
  const db = getDb();
  const out: { id: string; result: string }[] = [];
  for (const source of listSources("peaje")) {
    const stamp = new Date().toISOString();
    try {
      const response = await fetchSource(source.url, { timeoutMs: 30_000, headers: { Accept: "application/pdf,*/*" } });
      const hash = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
      if (hash === source.expected_sha256) {
        db.prepare(`UPDATE cost_sources SET last_sha256 = ?, status = 'ok', last_ok_at = ?, last_error = NULL, updated_at = ? WHERE id = ?`).run(hash, stamp, stamp, source.id);
        db.prepare(`UPDATE cost_toll_rates SET checked_at = ? WHERE source_id = ?`).run(stamp, source.id);
        out.push({ id: source.id, result: "sin cambios" });
      } else {
        db.prepare(`UPDATE cost_sources SET last_sha256 = ?, status = 'cambio_detectado', last_error = 'El documento oficial cambió: revisar y cargar tarifas', last_error_at = ?, updated_at = ? WHERE id = ?`).run(hash, stamp, stamp, source.id);
        out.push({ id: source.id, result: "cambio detectado" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      db.prepare(`UPDATE cost_sources SET last_error = ?, last_error_at = ?, updated_at = ? WHERE id = ?`).run(message.slice(0, 300), stamp, stamp, source.id);
      out.push({ id: source.id, result: `error: ${message}` });
    }
  }
  return out;
}
