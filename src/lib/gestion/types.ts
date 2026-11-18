export const SIN_DATOS = "[sin datos]";

export type EstadoConteo = { estado: string; label: string; n: number };

export type RetornoMuestra = { loadId: string; route: string; camiones: number };

export type GestionSnapshot = {
  generatedAt: string;
  cargasPorEstado: EstadoConteo[];
  cargasTotal: number;
  viajes: EstadoConteo[];
  viajesTotal: number;
  transportistasActivos: number;
  camionesActivos: number;
  leads: EstadoConteo[];
  leadsTotal: number;
  retornos: number;
  retornoMuestras: RetornoMuestra[];
  compatibles: number;
  alertasEnviadas: number;
  alertasGuardadas: number;
  alertasOps: number;
  documentosPorVencer: number;
};

/** Cifra real, o la marca fija cuando el grupo no tiene filas. */
export function dato(n: number, hay: boolean): string {
  return hay ? String(n) : SIN_DATOS;
}

