import type { Company } from "./types";

/** Secciones que antes eran páginas sueltas y ahora viven dentro de Administración. */
export const SECCIONES = ["agente", "panel", "bassam360", "usuarios"] as const;
export type SeccionInterna = (typeof SECCIONES)[number];

const VISTAS = ["resumen", "operaciones", "tareas", "integraciones", "actividad"] as const;
export type VistaControl = (typeof VISTAS)[number];

function uno(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Solo acepta las secciones conocidas. Cualquier otro valor vuelve al centro. */
export function seccionInterna(value: string | string[] | undefined): SeccionInterna | null {
  const raw = uno(value);
  return SECCIONES.find((id) => id === raw) ?? null;
}

export function vistaControl(value: string | string[] | undefined): VistaControl {
  const raw = uno(value);
  return VISTAS.find((id) => id === raw) ?? "resumen";
}

/** Arma /admin con empresa y sección. No copia parámetros ajenos. */
export function hrefAdmin(empresa: Company, opts: { seccion?: SeccionInterna | null; vista?: VistaControl | null } = {}) {
  const params = new URLSearchParams();
  if (empresa === "bassam") params.set("empresa", "bassam");
  if (opts.seccion) params.set("seccion", opts.seccion);
  else if (opts.vista && opts.vista !== "resumen") params.set("vista", opts.vista);
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}
