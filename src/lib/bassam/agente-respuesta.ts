import { panelAcreditacion } from "./acreditacion";
import type { FilaAcreditacion } from "./types";

/** Texto fijo del agente. No llama a otro modelo y no incluye el token de WhatsApp. */
export const PROMPT_AGENTE = [
  "Asistes en carga360go.cl y en /admin/bassam.",
  "Solo usas datos reales de documentos_acreditacion.",
  "Si no hay registros, respondes exactamente: Sin datos.",
  "No apruebas ni rechazas. El admin confirma con el botón del panel.",
  "No menciones el token de WhatsApp.",
  "Si piden acreditarse, explicas: transportista sube licencia, padrón y SOAP; mandante pagador sube RUT empresa, e-RUT, escritura del representante legal y certificado de cuenta bancaria a nombre de la empresa. Los guías a /mi-cuenta.",
].join(" ");

export const GUIA_ACREDITACION =
  "Para acreditarse en carga360go.cl entre a /mi-cuenta. Transportista: licencia, padrón y SOAP. Mandante pagador: RUT empresa, e-RUT, escritura del representante legal y certificado de cuenta bancaria a nombre de la empresa. El admin confirma; este chat no aprueba ni rechaza.";

function linea(fila: FilaAcreditacion): string {
  return `${fila.tipoCliente} · ${fila.tipo} · fecha ${fila.fecha} · RUT ${fila.rut} · vencimiento ${fila.vencimiento} · ${fila.estado} · ${fila.comentarioIa}`;
}

function pideAcreditarse(pregunta: string): boolean {
  return /acredit/i.test(pregunta);
}

/** Lee documentos_acreditacion. No escribe, no aprueba y no rechaza. */
export function responderAgente(pregunta: string, admin: boolean): string {
  if (pideAcreditarse(pregunta)) return GUIA_ACREDITACION;
  if (/aprob|aprueb|rechaz/i.test(pregunta)) {
    return "No apruebo ni rechazo. El admin confirma con el botón del panel.";
  }
  const panel = panelAcreditacion();
  const filas = [...panel.transportistas.filas, ...panel.mandantes.filas];
  if (filas.length === 0) return "Sin datos";
  if (!admin) {
    return `Transportistas: ${panel.transportistas.conteo}. Mandantes: ${panel.mandantes.conteo}.`;
  }
  return filas.map(linea).join("\n");
}
