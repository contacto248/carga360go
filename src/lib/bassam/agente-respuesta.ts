import { GUIA_ACREDITACION, SIN_DATOS } from "./agente-copia";
import { panelAcreditacion } from "./acreditacion";
import type { FilaAcreditacion } from "./types";

export { ENLACE_MI_CUENTA, GUIA_ACREDITACION, LISTA_DOCUMENTOS, PASOS_CUENTA, PROMPT_AGENTE, SIN_DATOS } from "./agente-copia";

function linea(fila: FilaAcreditacion): string {
  return `${fila.tipoCliente} · ${fila.tipo} · fecha ${fila.fecha} · RUT ${fila.rut} · vencimiento ${fila.vencimiento} · ${fila.estado} · ${fila.comentarioIa}`;
}

function noSabeAdjuntar(pregunta: string): boolean {
  return /no s(?:e|é|aben).{0,48}(?:adjunta|subir)|d[oó]nde adjunt/i.test(pregunta);
}

function pideGuia(pregunta: string): boolean {
  return /acredit|adjunta|d[oó]nde subir|subir documento|soy transportista|soy mandante/i.test(pregunta);
}

/** Lee documentos_acreditacion. No escribe, no aprueba y no rechaza. */
export function responderAgente(pregunta: string, admin: boolean): string {
  if (noSabeAdjuntar(pregunta)) return SIN_DATOS;
  if (/aprob|aprueb|rechaz/i.test(pregunta)) {
    return "No apruebo solo. El admin confirma con el botón del panel.";
  }
  const panel = panelAcreditacion();
  const filas = [...panel.transportistas.filas, ...panel.mandantes.filas];
  if (filas.length === 0) return SIN_DATOS;
  if (pideGuia(pregunta)) {
    const reales = admin ? filas.map(linea).join("\n") : `Transportistas: ${panel.transportistas.conteo}. Mandantes: ${panel.mandantes.conteo}.`;
    return `${GUIA_ACREDITACION}\n${reales}`;
  }
  if (!admin) {
    return `Transportistas: ${panel.transportistas.conteo}. Mandantes: ${panel.mandantes.conteo}.`;
  }
  return filas.map(linea).join("\n");
}
