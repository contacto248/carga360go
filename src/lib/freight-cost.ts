import { randomUUID } from "crypto";
import type { Database } from "better-sqlite3";
import { getDb } from "./db";
import { AppError } from "./errors";
import { DEFAULT_RATES, MIN_TRIP_CLP, ROAD_FACTOR } from "./freight-defaults";
import { EQUIPMENT_IDS, type EquipmentId } from "./types";

export type FreightConfig = {
  /** "base" solo si factor, mínimos y todas las tarifas salieron de la base. */
  fuente: "base" | "respaldo";
  factorRuta: number;
  factorDesdeBase: boolean;
  minimoLiviano: number;
  minimoLivianoDesdeBase: boolean;
  minimoPesado: number;
  minimoPesadoDesdeBase: boolean;
  tarifas: Record<EquipmentId, [number, number]>;
  tarifasDesdeBase: EquipmentId[];
};

export type FreightPublic = {
  fuente: "base" | "respaldo";
  factorRuta: number;
  minimoLiviano: number;
  minimoPesado: number;
  tarifas: Record<EquipmentId, [number, number]>;
};

export type FreightPatch = {
  factorRuta?: number;
  minimoLiviano?: number;
  minimoPesado?: number;
  tarifas?: Partial<Record<EquipmentId, [number, number]>>;
};

export type FreightAuditRow = {
  id: string;
  clave: string;
  valorAnterior: string | null;
  valorNuevo: string;
  actorId: string | null;
  actorEmail: string | null;
  creadoEn: string;
};

const FACTOR_MIN = 1;
const FACTOR_MAX = 3;
const MIN_TRIP_MAX = 50_000_000;
const RATE_MAX = 100_000;

function copyRates(): Record<EquipmentId, [number, number]> {
  const tarifas = {} as Record<EquipmentId, [number, number]>;
  for (const id of EQUIPMENT_IDS) tarifas[id] = [DEFAULT_RATES[id][0], DEFAULT_RATES[id][1]];
  return tarifas;
}

function fallbackConfig(): FreightConfig {
  return {
    fuente: "respaldo",
    factorRuta: ROAD_FACTOR,
    factorDesdeBase: false,
    minimoLiviano: MIN_TRIP_CLP.liviano,
    minimoLivianoDesdeBase: false,
    minimoPesado: MIN_TRIP_CLP.pesado,
    minimoPesadoDesdeBase: false,
    tarifas: copyRates(),
    tarifasDesdeBase: [],
  };
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-9;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

export function publicFreightParams(config: FreightConfig): FreightPublic {
  return {
    fuente: config.fuente,
    factorRuta: config.factorRuta,
    minimoLiviano: config.minimoLiviano,
    minimoPesado: config.minimoPesado,
    tarifas: config.tarifas,
  };
}

/** Origen del cálculo de un equipo: la base, o el respaldo si faltó factor, mínimo o tarifa. */
export function freightQuoteSource(config: FreightConfig, equipment: string): "base" | "respaldo" {
  const id = (EQUIPMENT_IDS as readonly string[]).includes(equipment) ? (equipment as EquipmentId) : "otro";
  const minFromBase = id === "camion_34" ? config.minimoLivianoDesdeBase : config.minimoPesadoDesdeBase;
  if (config.factorDesdeBase && minFromBase && config.tarifasDesdeBase.includes(id)) return "base";
  return "respaldo";
}

function readFrom(db: Database): FreightConfig {
  const config = fallbackConfig();
  const settings = db.prepare(`SELECT key, value_real FROM freight_cost_settings`).all() as { key: string; value_real: number }[];
  for (const row of settings) {
    if (!(row.value_real > 0)) continue;
    if (row.key === "road_factor") {
      config.factorRuta = row.value_real;
      config.factorDesdeBase = true;
    } else if (row.key === "min_trip_liviano") {
      config.minimoLiviano = row.value_real;
      config.minimoLivianoDesdeBase = true;
    } else if (row.key === "min_trip_pesado") {
      config.minimoPesado = row.value_real;
      config.minimoPesadoDesdeBase = true;
    }
  }
  const rates = db.prepare(`SELECT equipment, rate_min, rate_max FROM freight_km_rates`).all() as {
    equipment: string;
    rate_min: number;
    rate_max: number;
  }[];
  for (const row of rates) {
    if (!(EQUIPMENT_IDS as readonly string[]).includes(row.equipment)) continue;
    if (!(row.rate_min > 0) || !(row.rate_max >= row.rate_min)) continue;
    const id = row.equipment as EquipmentId;
    config.tarifas[id] = [row.rate_min, row.rate_max];
    config.tarifasDesdeBase.push(id);
  }
  const completa =
    config.factorDesdeBase &&
    config.minimoLivianoDesdeBase &&
    config.minimoPesadoDesdeBase &&
    EQUIPMENT_IDS.every((id) => config.tarifasDesdeBase.includes(id));
  config.fuente = completa ? "base" : "respaldo";
  return config;
}

/** Lee los parámetros. Si la base no responde o falta una fila, completa con la semilla. */
export function readFreightConfig(): FreightConfig {
  try {
    return readFrom(getDb());
  } catch (error) {
    console.error("[carga360go] parametros de costo: se usa el respaldo en código");
    if (error instanceof Error) console.error(error.message);
    return fallbackConfig();
  }
}

function assertPatch(patch: FreightPatch): void {
  const keys = Object.keys(patch);
  if (keys.length === 0) throw new AppError("Debes indicar al menos un parámetro.");
  if (patch.factorRuta !== undefined) {
    if (typeof patch.factorRuta !== "number" || !Number.isFinite(patch.factorRuta) || patch.factorRuta < FACTOR_MIN || patch.factorRuta > FACTOR_MAX) {
      throw new AppError("El factor de ruta tiene que ser un número entre 1 y 3.");
    }
  }
  for (const [label, value] of [
    ["mínimo del camión 3/4", patch.minimoLiviano],
    ["mínimo del viaje", patch.minimoPesado],
  ] as const) {
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MIN_TRIP_MAX) {
      throw new AppError(`El ${label} tiene que ser un entero positivo.`);
    }
  }
  if (patch.tarifas) {
    for (const [equipment, pair] of Object.entries(patch.tarifas)) {
      if (!(EQUIPMENT_IDS as readonly string[]).includes(equipment)) throw new AppError("El equipo no está en el catálogo.");
      if (!pair || pair.length !== 2 || !pair.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= RATE_MAX) || pair[0] > pair[1]) {
        throw new AppError("La tarifa por km tiene que indicar un mínimo y un máximo enteros, con el mínimo menor o igual al máximo.");
      }
    }
  }
}

/** Guarda cambios y deja en la auditoría quién, cuándo, valor anterior y valor nuevo. */
export function updateFreightConfig(actor: { id: string; email: string }, patch: FreightPatch): FreightConfig {
  assertPatch(patch);
  const db = getDb();
  const current = readFrom(db);
  const now = new Date().toISOString();
  const changes: { key: string; oldValue: string; newValue: string; apply: () => void }[] = [];

  if (patch.factorRuta !== undefined && !sameNumber(patch.factorRuta, current.factorRuta)) {
    const value = patch.factorRuta;
    changes.push({
      key: "road_factor",
      oldValue: formatNumber(current.factorRuta),
      newValue: formatNumber(value),
      apply: () => {
        db.prepare(
          `INSERT INTO freight_cost_settings (key, value_real, updated_at, updated_by) VALUES ('road_factor', ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value_real = excluded.value_real, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        ).run(value, now, actor.email);
      },
    });
  }
  const minimums: [FreightPatch["minimoLiviano"], string, number][] = [
    [patch.minimoLiviano, "min_trip_liviano", current.minimoLiviano],
    [patch.minimoPesado, "min_trip_pesado", current.minimoPesado],
  ];
  for (const [value, key, previous] of minimums) {
    if (value === undefined || value === previous) continue;
    changes.push({
      key,
      oldValue: formatNumber(previous),
      newValue: formatNumber(value),
      apply: () => {
        db.prepare(
          `INSERT INTO freight_cost_settings (key, value_real, updated_at, updated_by) VALUES (?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value_real = excluded.value_real, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        ).run(key, value, now, actor.email);
      },
    });
  }
  for (const [equipment, pair] of Object.entries(patch.tarifas ?? {})) {
    if (!pair) continue;
    const id = equipment as EquipmentId;
    const previous = current.tarifas[id];
    if (previous && previous[0] === pair[0] && previous[1] === pair[1]) continue;
    changes.push({
      key: `tarifa:${id}`,
      oldValue: `${previous[0]},${previous[1]}`,
      newValue: `${pair[0]},${pair[1]}`,
      apply: () => {
        db.prepare(
          `INSERT INTO freight_km_rates (equipment, rate_min, rate_max, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(equipment) DO UPDATE SET rate_min = excluded.rate_min, rate_max = excluded.rate_max, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        ).run(id, pair[0], pair[1], now, actor.email);
      },
    });
  }
  if (changes.length === 0) throw new AppError("No hay cambios para guardar.");

  const write = db.transaction(() => {
    const audit = db.prepare(
      `INSERT INTO freight_param_audit (id, param_key, old_value, new_value, actor_id, actor_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const change of changes) {
      change.apply();
      audit.run(randomUUID(), change.key, change.oldValue, change.newValue, actor.id, actor.email, now);
    }
  });
  write();
  return readFrom(db);
}

export function recentFreightAudit(limit = 20): FreightAuditRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, param_key, old_value, new_value, actor_id, actor_email, created_at
       FROM freight_param_audit ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(limit) as {
    id: string;
    param_key: string;
    old_value: string | null;
    new_value: string;
    actor_id: string | null;
    actor_email: string | null;
    created_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    clave: row.param_key,
    valorAnterior: row.old_value,
    valorNuevo: row.new_value,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    creadoEn: row.created_at,
  }));
}

const PATCH_KEYS = new Set(["factorRuta", "minimoLiviano", "minimoPesado", "tarifas"]);

/** Traduce el JSON del administrador. Rechaza campos que no son de este cálculo. */
export function parseFreightPatch(body: Record<string, unknown>): FreightPatch {
  for (const key of Object.keys(body)) {
    if (!PATCH_KEYS.has(key)) throw new AppError("Campo no permitido.");
  }
  const patch: FreightPatch = {};
  if ("factorRuta" in body) {
    if (typeof body.factorRuta !== "number") throw new AppError("El factor de ruta tiene que ser un número entre 1 y 3.");
    patch.factorRuta = body.factorRuta;
  }
  if ("minimoLiviano" in body) {
    if (typeof body.minimoLiviano !== "number") throw new AppError("El mínimo del camión 3/4 tiene que ser un entero positivo.");
    patch.minimoLiviano = body.minimoLiviano;
  }
  if ("minimoPesado" in body) {
    if (typeof body.minimoPesado !== "number") throw new AppError("El mínimo del viaje tiene que ser un entero positivo.");
    patch.minimoPesado = body.minimoPesado;
  }
  if ("tarifas" in body) {
    if (!body.tarifas || typeof body.tarifas !== "object" || Array.isArray(body.tarifas)) {
      throw new AppError("La tarifa por km tiene que indicar un mínimo y un máximo enteros, con el mínimo menor o igual al máximo.");
    }
    const tarifas: Partial<Record<EquipmentId, [number, number]>> = {};
    for (const [equipment, value] of Object.entries(body.tarifas as Record<string, unknown>)) {
      if (!Array.isArray(value) || value.length !== 2 || !value.every((n) => typeof n === "number")) {
        throw new AppError("La tarifa por km tiene que indicar un mínimo y un máximo enteros, con el mínimo menor o igual al máximo.");
      }
      if (!(EQUIPMENT_IDS as readonly string[]).includes(equipment)) throw new AppError("El equipo no está en el catálogo.");
      tarifas[equipment as EquipmentId] = [value[0], value[1]];
    }
    patch.tarifas = tarifas;
  }
  if (patch.factorRuta === undefined && patch.minimoLiviano === undefined && patch.minimoPesado === undefined && !patch.tarifas) {
    throw new AppError("Debes indicar al menos un parámetro.");
  }
  if (patch.tarifas && Object.keys(patch.tarifas).length === 0 && patch.factorRuta === undefined && patch.minimoLiviano === undefined && patch.minimoPesado === undefined) {
    throw new AppError("Debes indicar al menos un parámetro.");
  }
  return patch;
}
