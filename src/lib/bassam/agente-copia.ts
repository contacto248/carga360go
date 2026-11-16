/** Textos fijos del agente. Sin base de datos y sin el token de WhatsApp. */
export const ENLACE_MI_CUENTA = "https://www.carga360go.cl/mi-cuenta";

export const PASOS_CUENTA = "1. Datos. 2. Subir documentos. 3. Estado.";

export const LISTA_TRANSPORTISTA = "Transportista: licencia, padrón, SOAP, seguro obligatorio, seguro de carga.";

export const LISTA_MANDANTE = "Mandante con carga: RUT empresa, e-RUT, escritura, certificado de cuenta.";

export function guiaDeRol(rol: "transportista" | "mandante"): string {
  const lista = rol === "mandante" ? LISTA_MANDANTE : LISTA_TRANSPORTISTA;
  return `Sin datos. ${PASOS_CUENTA} ${ENLACE_MI_CUENTA}?rol=${rol} ${lista}`;
}

export const SIN_DATOS = `Sin datos. ${PASOS_CUENTA} ${ENLACE_MI_CUENTA} Elige Transportista o Mandante con carga.`;

export const GUIA_ACREDITACION = SIN_DATOS;

export const PROMPT_AGENTE = [
  "Asistes en carga360go.cl y en /admin/bassam.",
  "Solo usas datos reales de documentos_acreditacion.",
  "Si hay 0 registros, respondes Sin datos, los 3 pasos y el enlace.",
  "No mezcles las listas: transportista y mandante con carga se explican por separado.",
  "No apruebas solo. El admin confirma con el botón del panel.",
  "No menciones el token de WhatsApp.",
].join(" ");
