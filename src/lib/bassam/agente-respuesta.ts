import { guiaDeRol, SIN_DATOS } from "./agente-copia";
import { panelAcreditacion } from "./acreditacion";
import type { TipoCliente } from "./tipos-cliente";
import type { FilaAcreditacion } from "./types";

export { ENLACE_MI_CUENTA, GUIA_ACREDITACION, LISTA_MANDANTE, LISTA_TRANSPORTISTA, PASOS_CUENTA, PROMPT_AGENTE, SIN_DATOS, guiaDeRol } from "./agente-copia";

function linea(fila: FilaAcreditacion): string {
  return `${fila.tipoCliente} · ${fila.tipo} · fecha ${fila.fecha} · RUT ${fila.rut} · vencimiento ${fila.vencimiento} · ${fila.estado} · ${fila.comentarioIa}`;
}

function noSabeAdjuntar(pregunta: string): boolean {
  return /no s(?:e|é|aben).{0,48}(?:adjunta|subir)|d[oó]nde adjunt/i.test(pregunta);
}

function pideGuia(pregunta: string): boolean {
  return /acredit|adjunta|d[oó]nde subir|subir documento|soy transportista|soy mandante/i.test(pregunta);
}

function rolDe(pregunta: string, rol?: TipoCliente | null): TipoCliente | null {
  if (rol === "transportista" || rol === "mandante") return rol;
  const transportista = /transportista/i.test(pregunta);
  const mandante = /mandante/i.test(pregunta);
  if (transportista && !mandante) return "transportista";
  if (mandante && !transportista) return "mandante";
  return null;
}

/** Lee documentos_acreditacion. No escribe, no aprueba y no rechaza. */
export function responderAgente(pregunta: string, admin: boolean, rol?: TipoCliente | null): string {
  const elegido = rolDe(pregunta, rol);
  if (noSabeAdjuntar(pregunta) || pideGuia(pregunta)) return elegido ? guiaDeRol(elegido) : SIN_DATOS;
  if (/aprob|aprueb|rechaz/i.test(pregunta)) {
    return "No apruebo solo. El admin confirma con el botón del panel.";
  }
  const panel = panelAcreditacion();
  const filas = (elegido === "mandante" ? panel.mandantes.filas : elegido === "transportista" ? panel.transportistas.filas : [...panel.transportistas.filas, ...panel.mandantes.filas]);
  if (filas.length === 0) return elegido ? guiaDeRol(elegido) : SIN_DATOS;
  if (!admin) {
    if (elegido === "mandante") return `Mandantes: ${panel.mandantes.conteo}.`;
    if (elegido === "transportista") return `Transportistas: ${panel.transportistas.conteo}.`;
    return `Transportistas: ${panel.transportistas.conteo}. Mandantes: ${panel.mandantes.conteo}.`;
  }
  return filas.map(linea).join("\n");
}
