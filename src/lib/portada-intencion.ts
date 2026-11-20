import { cityByName } from "@/lib/catalog";

export type RolPortada = "carga" | "transporte";

export type BorradorPortada = {
  rol: RolPortada;
  origen: string;
  destino: string;
  equipo: string;
};

export const LLAVE_BORRADOR = "c360-portada-borrador";

/** Equipos reales del catálogo. La etiqueta corta es la de la portada; el id es el del formulario. */
const EQUIPOS_PORTADA = [
  { id: "rampla_plana", label: "Rampla plana" },
  { id: "sider", label: "Sider" },
  { id: "furgon_seco", label: "Furgón" },
  { id: "cama_baja", label: "Cama baja" },
  { id: "tolva", label: "Tolva" },
  { id: "refrigerado", label: "Frigorífico" },
] as const;

export function equiposDe(rol: RolPortada): { id: string; label: string }[] {
  switch (rol) {
    case "carga":
    case "transporte":
      return EQUIPOS_PORTADA.map((item) => ({ id: item.id, label: item.label }));
    default: {
      const nunca: never = rol;
      return nunca;
    }
  }
}

export function inicioDePerfil(rol: RolPortada): string {
  switch (rol) {
    case "carga":
      return "/cargas/nueva";
    case "transporte":
      return "/camiones/nuevo";
    default: {
      const nunca: never = rol;
      return nunca;
    }
  }
}

export function validarBorrador(input: {
  rol: RolPortada;
  origen: string;
  destino: string;
  equipo: string;
}): BorradorPortada | { error: string } {
  if (!cityByName(input.origen) || !cityByName(input.destino)) {
    return { error: "Elige ciudades de la lista." };
  }
  if (input.origen === input.destino) {
    return { error: "Elige un destino diferente al origen." };
  }
  const permitidos = new Set(equiposDe(input.rol).map((item) => item.id));
  if (!permitidos.has(input.equipo)) return { error: "Elige un tipo de la lista." };
  return { rol: input.rol, origen: input.origen, destino: input.destino, equipo: input.equipo };
}

export function rutaConBorrador(borrador: BorradorPortada): string {
  const params = new URLSearchParams({
    origen: borrador.origen,
    destino: borrador.destino,
    equipo: borrador.equipo,
    intencion: borrador.rol,
  });
  return `${inicioDePerfil(borrador.rol)}?${params.toString()}`;
}

export function ingresoRetomando(path: string): string {
  return `/ingreso?next=${encodeURIComponent(path)}`;
}

export function resumenSigueVigente(
  resumen: BorradorPortada | null,
  actual: { rol: RolPortada; origen: string; destino: string; equipo: string },
): boolean {
  if (!resumen) return false;
  return (
    resumen.rol === actual.rol &&
    resumen.origen === actual.origen &&
    resumen.destino === actual.destino &&
    resumen.equipo === actual.equipo
  );
}

type Params = Record<string, string | string[] | undefined>;

function uno(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function leerBorrador(params: Params, rol: RolPortada): BorradorPortada | null {
  const parsed = validarBorrador({
    rol,
    origen: uno(params.origen),
    destino: uno(params.destino),
    equipo: uno(params.equipo),
  });
  if ("error" in parsed) return null;
  return parsed;
}

export function serializarBorrador(borrador: BorradorPortada): string {
  return JSON.stringify(borrador);
}

/** El borrador de la portada ya se usó: no debe volver a precargar un aviso nuevo. */
export function olvidarBorrador(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(LLAVE_BORRADOR);
  } catch {
    /* navegador privado */
  }
}

export function parsearBorrador(raw: string): BorradorPortada | null {
  try {
    const data = JSON.parse(raw) as Partial<BorradorPortada>;
    if (data.rol !== "carga" && data.rol !== "transporte") return null;
    const parsed = validarBorrador({
      rol: data.rol,
      origen: typeof data.origen === "string" ? data.origen : "",
      destino: typeof data.destino === "string" ? data.destino : "",
      equipo: typeof data.equipo === "string" ? data.equipo : "",
    });
    if ("error" in parsed) return null;
    return parsed;
  } catch {
    return null;
  }
}
