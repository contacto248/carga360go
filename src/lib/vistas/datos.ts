import { EQUIPMENT } from "@/lib/catalog";
import { formatDateCL } from "@/lib/format";
import type { KpiItem } from "@/components/sistema/KpiCards";
import type { DataRow } from "@/components/sistema/DataTable";

export type ConteosPublicos = {
  activeLoads: number;
  activeTrucks: number;
  verifiedCarriers: number;
  companies: number;
  regionsActive: number;
  matches: number;
};

export type ConteosAdmin = {
  users: number;
  loads: number;
  trucks: number;
  expiring: number;
  expired: number;
};

export type AvisoReal = {
  id: string;
  kind: "carga" | "camion";
  origin: string;
  destination: string;
  equipment: string;
  date: string;
};

function equipoVisible(id: string): string {
  return EQUIPMENT.find((item) => item.id === id)?.label ?? id;
}

function tarjetas(pares: Array<[string, string, number]>, extra: KpiItem[] = []): KpiItem[] {
  if (pares.every((item) => item[2] === 0) && extra.length === 0) return [];
  return [
    ...pares.map(([id, label, value]) => ({ id, label, value: String(value) })),
    ...extra,
  ];
}

/** Conteos que ya calcula el sitio. Si todos son cero, no hay tarjetas. */
export function indicadoresReales(stats: ConteosPublicos | null): KpiItem[] {
  if (!stats) return [];
  return tarjetas([
    ["cargas", "Cargas vigentes", stats.activeLoads],
    ["camiones", "Camiones vigentes", stats.activeTrucks],
    ["verificados", "Transportistas verificados", stats.verifiedCarriers],
    ["mandantes", "Mandantes", stats.companies],
    ["regiones", "Regiones con avisos", stats.regionsActive],
    ["calces", "Calces", stats.matches],
  ]);
}

/** Los mismos rótulos que el panel de administración. Sin montos. */
export function indicadoresAdmin(metrics: ConteosAdmin | null): KpiItem[] {
  if (!metrics) return [];
  const vencidos = metrics.expired > 0 ? [{ id: "vencidos", label: "Documentos vencidos", value: String(metrics.expired) }] : [];
  return tarjetas(
    [
      ["usuarios", "Usuarios", metrics.users],
      ["cargas", "Cargas", metrics.loads],
      ["camiones", "Camiones", metrics.trucks],
      ["vencer", "Documentos por vencer", metrics.expiring],
    ],
    vencidos,
  );
}

/** Avisos reales. Sin peso, sin precio y sin filas inventadas. */
export function filasAvisos(items: AvisoReal[]): DataRow[] {
  return items.map((item) => ({
    id: `${item.kind}-${item.id}`,
    cells: [
      item.kind === "carga" ? "Carga" : "Camión",
      item.origin,
      item.destination,
      equipoVisible(item.equipment),
      formatDateCL(item.date),
    ],
  }));
}
