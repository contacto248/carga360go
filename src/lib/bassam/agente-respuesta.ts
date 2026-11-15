import { panelAcreditacion } from "./acreditacion";
import type { FilaAcreditacion } from "./types";

function linea(fila: FilaAcreditacion): string {
  return `${fila.tipoCliente} · ${fila.tipo} · fecha ${fila.fecha} · RUT ${fila.rut} · vencimiento ${fila.vencimiento} · ${fila.estado} · ${fila.comentarioIa}`;
}

/** Lee la acreditación guardada. No escribe, no aprueba y no rechaza. */
export function responderAgente(pregunta: string, admin: boolean): string {
  if (/aprob|aprueb|rechaz/i.test(pregunta)) {
    return "No apruebo ni rechazo. Eso lo hace una persona con el botón del panel.";
  }
  const panel = panelAcreditacion();
  const filas = [...panel.transportistas.filas, ...panel.mandantes.filas];
  if (filas.length === 0) return "sin datos";
  if (!admin) {
    return `Transportistas: ${panel.transportistas.conteo}. Mandantes: ${panel.mandantes.conteo}.`;
  }
  return filas.map(linea).join("\n");
}
