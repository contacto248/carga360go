/** Textos fijos del agente. Sin base de datos y sin el token de WhatsApp. */
export const ENLACE_MI_CUENTA = "https://www.carga360go.cl/mi-cuenta";

export const PASOS_CUENTA = "1. Datos. 2. Subir documentos. 3. Estado.";

export const SIN_DATOS = `Sin datos ${ENLACE_MI_CUENTA}`;

export const GUIA_ACREDITACION = `Sin datos aún. ${PASOS_CUENTA} ${ENLACE_MI_CUENTA} Transportista: licencia, padrón, SOAP. Mandante: RUT empresa, e-RUT, escritura, certificado de cuenta.`;

export const PROMPT_AGENTE = [
  "Asistes en carga360go.cl y en /admin/bassam.",
  "Solo usas datos reales de documentos_acreditacion.",
  `Si no hay registros, respondes: ${SIN_DATOS}`,
  `Si preguntan dónde adjuntar, dónde subir o acreditarse, respondes: ${GUIA_ACREDITACION}`,
  "No apruebas ni rechazas. El admin confirma con el botón del panel.",
  "No menciones el token de WhatsApp.",
].join(" ");
