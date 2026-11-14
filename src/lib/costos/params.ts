import { auditStrict } from "../audit";
import { getDb } from "../db";
import { AppError } from "../errors";
import type { PublicUser } from "../types";
import { VEHICLE_CLASSES, type VehicleClassId } from "./vehicles";

/**
 * Parámetros configurables del motor. Los valores por defecto son PARÁMETROS PROFESIONALES DE REFERENCIA
 * definidos por Carga360go para partir: no son datos oficiales ni tarifas publicadas. El administrador los
 * ajusta en /admin/costos y cada cambio queda en la auditoría (quién, cuándo, valor anterior y nuevo).
 */
export type ParamDef = {
  key: string;
  label: string;
  unit: string;
  kind: "number" | "boolean" | "enum";
  min?: number;
  max?: number;
  options?: string[];
  default: number | boolean | string;
  help: string;
  /** Solo visible para administradores (ej. margen). */
  internal?: boolean;
};

export const GLOBAL_PARAMS: ParamDef[] = [
  { key: "factorDuracionCamion", label: "Factor de duración para camión", unit: "× duración del ruteo", kind: "number", min: 1, max: 2.5, default: 1.25, help: "El ruteo público (OSRM) usa perfil de auto; se multiplica su duración para estimar la de un camión." },
  { key: "horasCargaDescarga", label: "Carga y descarga", unit: "horas (total)", kind: "number", min: 0, max: 48, default: 3, help: "Tiempo total de carga en origen y descarga en destino." },
  { key: "horasEspera", label: "Tiempo de espera estimado", unit: "horas", kind: "number", min: 0, max: 72, default: 1, help: "Esperas en origen, destino o controles." },
  { key: "adicionalesClp", label: "Gastos adicionales", unit: "CLP por viaje", kind: "number", min: 0, max: 50_000_000, default: 0, help: "Permisos, escoltas, estacionamiento u otros gastos del viaje." },
  { key: "retornoVacioPct", label: "Retorno vacío asignado", unit: "% del trayecto", kind: "number", min: 0, max: 100, default: 0, help: "Porcentaje del viaje de vuelta sin carga que se asigna a este flete (0 = no se cobra retorno)." },
  { key: "rangoPublicoPct", label: "Rango público alrededor del costo", unit: "± % (0 = desactivado)", kind: "number", min: 0, max: 50, default: 0, help: "Decisión comercial: con 0 se muestra un solo costo referencial. Con un valor mayor, la vista pública agrega un rango mínimo–máximo de ± ese porcentaje." },
  { key: "margenPct", label: "Margen interno", unit: "% sobre el costo base", kind: "number", min: 0, max: 100, default: 0, help: "Parámetro interno, solo para administración. Por defecto 0.", internal: true },
  { key: "ivaPct", label: "IVA", unit: "%", kind: "number", min: 0, max: 30, default: 19, help: "Tasa de IVA aplicada al precio referencial." },
  { key: "aplicaIva", label: "Aplicar IVA al precio referencial", unit: "", kind: "boolean", default: true, help: "Si el servicio es afecto a IVA." },
  { key: "preciosPublicosConIva", label: "Diésel y peajes publicados incluyen IVA", unit: "", kind: "boolean", default: true, help: "Si es sí, el motor los lleva a neto (÷ 1+IVA) para no cobrar IVA dos veces." },
  { key: "recuperoImpEspecificoClpL", label: "Recuperación de impuesto específico al diésel", unit: "CLP por litro", kind: "number", min: 0, max: 1000, default: 0, help: "Monto por litro que la empresa recupera (Ley 19.764). 0 = no se considera." },
  { key: "puntoAbastecimiento", label: "Zona de precio del diésel", unit: "", kind: "enum", options: ["origen", "destino", "promedio"], default: "origen", help: "Qué zona de la CNE se usa para el precio del diésel." },
  { key: "dieselFrescoHoras", label: "Diésel: antigüedad máxima para 'verificado'", unit: "horas", kind: "number", min: 1, max: 720, default: 30, help: "Más antiguo que esto se usa con advertencia." },
  { key: "dieselVigenciaDias", label: "Diésel: vigencia del último valor verificado", unit: "días", kind: "number", min: 1, max: 60, default: 7, help: "Pasado este plazo el precio queda VENCIDO y el combustible PENDIENTE." },
  { key: "rutaCacheDias", label: "Caché de rutas", unit: "días", kind: "number", min: 1, max: 365, default: 30, help: "Días que se reutiliza una ruta calculada." },
  { key: "umbralPeajeMetros", label: "Distancia máxima plaza–ruta", unit: "metros", kind: "number", min: 20, max: 1000, default: 200, help: "Una plaza se considera cruzada si está a menos de esta distancia de la geometría." },
];

export type VehicleParams = {
  rendCargadoKmL: number;
  rendVacioKmL: number;
  neumaticosClpKm: number;
  mantenimientoClpKm: number;
  depreciacionClpKm: number;
  seguroClpDia: number;
  conductorClpDia: number;
  viaticoClpDia: number;
  esperaClpHora: number;
};

export const VEHICLE_FIELDS: { field: keyof VehicleParams; label: string; unit: string; min: number; max: number }[] = [
  { field: "rendCargadoKmL", label: "Rendimiento cargado", unit: "km/L", min: 0.5, max: 15 },
  { field: "rendVacioKmL", label: "Rendimiento vacío", unit: "km/L", min: 0.5, max: 15 },
  { field: "neumaticosClpKm", label: "Desgaste de neumáticos", unit: "CLP/km", min: 0, max: 2000 },
  { field: "mantenimientoClpKm", label: "Mantenimiento preventivo", unit: "CLP/km", min: 0, max: 3000 },
  { field: "depreciacionClpKm", label: "Depreciación", unit: "CLP/km", min: 0, max: 5000 },
  { field: "seguroClpDia", label: "Seguros (vehículo y carga, prorrateo)", unit: "CLP/día", min: 0, max: 1_000_000 },
  { field: "conductorClpDia", label: "Remuneración del conductor", unit: "CLP/día", min: 0, max: 1_000_000 },
  { field: "viaticoClpDia", label: "Viáticos del conductor", unit: "CLP/día", min: 0, max: 500_000 },
  { field: "esperaClpHora", label: "Costo de espera y carga/descarga", unit: "CLP/hora", min: 0, max: 500_000 },
];

export const DEFAULT_VEHICLE_PARAMS: Record<VehicleClassId, VehicleParams> = {
  camion_2_ejes: { rendCargadoKmL: 4.2, rendVacioKmL: 5, neumaticosClpKm: 22, mantenimientoClpKm: 55, depreciacionClpKm: 70, seguroClpDia: 12000, conductorClpDia: 50000, viaticoClpDia: 25000, esperaClpHora: 12000 },
  camion_3_ejes: { rendCargadoKmL: 3.4, rendVacioKmL: 4.2, neumaticosClpKm: 35, mantenimientoClpKm: 75, depreciacionClpKm: 95, seguroClpDia: 16000, conductorClpDia: 55000, viaticoClpDia: 25000, esperaClpHora: 15000 },
  tracto_semirremolque_5_ejes: { rendCargadoKmL: 2.6, rendVacioKmL: 3.4, neumaticosClpKm: 60, mantenimientoClpKm: 110, depreciacionClpKm: 150, seguroClpDia: 25000, conductorClpDia: 60000, viaticoClpDia: 25000, esperaClpHora: 18000 },
  tracto_semirremolque_6_ejes: { rendCargadoKmL: 2.4, rendVacioKmL: 3.2, neumaticosClpKm: 70, mantenimientoClpKm: 120, depreciacionClpKm: 160, seguroClpDia: 27000, conductorClpDia: 60000, viaticoClpDia: 25000, esperaClpHora: 18000 },
};

export type CostParams = {
  factorDuracionCamion: number;
  horasCargaDescarga: number;
  horasEspera: number;
  adicionalesClp: number;
  retornoVacioPct: number;
  rangoPublicoPct: number;
  margenPct: number;
  ivaPct: number;
  aplicaIva: boolean;
  preciosPublicosConIva: boolean;
  recuperoImpEspecificoClpL: number;
  puntoAbastecimiento: "origen" | "destino" | "promedio";
  dieselFrescoHoras: number;
  dieselVigenciaDias: number;
  rutaCacheDias: number;
  umbralPeajeMetros: number;
  vehicles: Record<VehicleClassId, VehicleParams>;
  /** Momento de la versión de parámetros (máximo updated_at) para trazar cada cotización. */
  version: string;
};

/** Todas las claves planas válidas (globales y por vehículo "vehiculo.<id>.<campo>"). */
export function allParamKeys(): string[] {
  const keys = GLOBAL_PARAMS.map((p) => p.key);
  for (const id of Object.keys(VEHICLE_CLASSES)) for (const f of VEHICLE_FIELDS) keys.push(`vehiculo.${id}.${f.field}`);
  return keys;
}

function defaultFor(key: string): number | boolean | string {
  const g = GLOBAL_PARAMS.find((p) => p.key === key);
  if (g) return g.default;
  const [, id, field] = key.split(".");
  return DEFAULT_VEHICLE_PARAMS[id as VehicleClassId][field as keyof VehicleParams];
}

function storedMap(): Map<string, { value: unknown; updatedAt: string }> {
  const rows = getDb().prepare(`SELECT key, value, updated_at FROM cost_params`).all() as { key: string; value: string; updated_at: string }[];
  const map = new Map<string, { value: unknown; updatedAt: string }>();
  for (const row of rows) {
    try {
      map.set(row.key, { value: JSON.parse(row.value), updatedAt: row.updated_at });
    } catch {
      /* valor corrupto: se ignora y rige el valor por defecto */
    }
  }
  return map;
}

export function paramValue(key: string, map = storedMap()): number | boolean | string {
  const stored = map.get(key);
  return stored ? (stored.value as number | boolean | string) : defaultFor(key);
}

export function getParams(): CostParams {
  const map = storedMap();
  const v = (key: string) => paramValue(key, map);
  const vehicles = {} as Record<VehicleClassId, VehicleParams>;
  for (const id of Object.keys(VEHICLE_CLASSES) as VehicleClassId[]) {
    const entry = {} as VehicleParams;
    for (const f of VEHICLE_FIELDS) entry[f.field] = Number(v(`vehiculo.${id}.${f.field}`));
    vehicles[id] = entry;
  }
  let version = "defecto";
  for (const item of map.values()) if (version === "defecto" || item.updatedAt > version) version = item.updatedAt;
  return {
    factorDuracionCamion: Number(v("factorDuracionCamion")),
    horasCargaDescarga: Number(v("horasCargaDescarga")),
    horasEspera: Number(v("horasEspera")),
    adicionalesClp: Number(v("adicionalesClp")),
    retornoVacioPct: Number(v("retornoVacioPct")),
    rangoPublicoPct: Number(v("rangoPublicoPct")),
    margenPct: Number(v("margenPct")),
    ivaPct: Number(v("ivaPct")),
    aplicaIva: Boolean(v("aplicaIva")),
    preciosPublicosConIva: Boolean(v("preciosPublicosConIva")),
    recuperoImpEspecificoClpL: Number(v("recuperoImpEspecificoClpL")),
    puntoAbastecimiento: v("puntoAbastecimiento") as CostParams["puntoAbastecimiento"],
    dieselFrescoHoras: Number(v("dieselFrescoHoras")),
    dieselVigenciaDias: Number(v("dieselVigenciaDias")),
    rutaCacheDias: Number(v("rutaCacheDias")),
    umbralPeajeMetros: Number(v("umbralPeajeMetros")),
    vehicles,
    version,
  };
}

function validate(key: string, raw: unknown): number | boolean | string {
  const g = GLOBAL_PARAMS.find((p) => p.key === key);
  if (g) {
    if (g.kind === "boolean") {
      if (typeof raw !== "boolean") throw new AppError(`${g.label}: debe ser sí o no.`);
      return raw;
    }
    if (g.kind === "enum") {
      if (typeof raw !== "string" || !g.options?.includes(raw)) throw new AppError(`${g.label}: valor no válido.`);
      return raw;
    }
    const n = typeof raw === "string" ? Number(raw.replace(",", ".")) : Number(raw);
    if (!Number.isFinite(n) || n < (g.min ?? -Infinity) || n > (g.max ?? Infinity)) {
      throw new AppError(`${g.label}: debe estar entre ${g.min} y ${g.max}.`);
    }
    return n;
  }
  const parts = key.split(".");
  const f = VEHICLE_FIELDS.find((x) => x.field === parts[2]);
  if (parts.length !== 3 || parts[0] !== "vehiculo" || !(parts[1] in VEHICLE_CLASSES) || !f) throw new AppError(`Parámetro desconocido: ${key}`);
  const n = typeof raw === "string" ? Number(raw.replace(",", ".")) : Number(raw);
  if (!Number.isFinite(n) || n < f.min || n > f.max) throw new AppError(`${f.label}: debe estar entre ${f.min} y ${f.max}.`);
  return n;
}

/**
 * Guarda cambios de parámetros. Cada clave que cambia se audita en la misma transacción
 * (acción "costos.parametro", detalle con valor anterior y nuevo). Si la auditoría falla, no se guarda nada.
 */
export function saveParams(actor: Pick<PublicUser, "id" | "email">, patch: Record<string, unknown>, ip?: string | null): { changed: string[] } {
  const db = getDb();
  const keys = Object.keys(patch);
  if (keys.length === 0) return { changed: [] };
  const clean = keys.map((key) => ({ key, value: validate(key, patch[key]) }));
  const map = storedMap();
  const stamp = new Date().toISOString();
  const put = db.prepare(
    `INSERT INTO cost_params (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  );
  const changed: string[] = [];
  db.transaction(() => {
    for (const { key, value } of clean) {
      const before = paramValue(key, map);
      if (before === value) continue;
      put.run(key, JSON.stringify(value), stamp, actor.id);
      auditStrict(actor, "costos.parametro", { type: "costos", id: key }, { parametro: key, anterior: before, nuevo: value }, ip ?? null);
      changed.push(key);
    }
  })();
  return { changed };
}
