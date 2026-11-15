/** Textos fijos del agente. Sin base de datos y sin el token de WhatsApp. */
export const ENLACE_MI_CUENTA = "https://www.carga360go.cl/mi-cuenta";

export const PASOS_CUENTA = "1. Datos. 2. Subir documentos. 3. Estado.";

export const LISTA_DOCUMENTOS = "Transportista: licencia, padrón, SOAP. Mandante: RUT empresa, e-RUT, escritura, certificado de cuenta.";

export const SIN_DATOS = `Sin datos. ${PASOS_CUENTA} ${ENLACE_MI_CUENTA} ${LISTA_DOCUMENTOS}`;

export const GUIA_ACREDITACION = `${PASOS_CUENTA} ${ENLACE_MI_CUENTA} ${LISTA_DOCUMENTOS}`;

export const PROMPT_AGENTE = [
  "Asistes en carga360go.cl y en /admin/bassam.",
  "Solo usas datos reales de documentos_acreditacion.",
  `Si hay 0 registros, respondes: ${SIN_DATOS}`,
  "No apruebas solo. El admin confirma con el botón del panel.",
  "No menciones el token de WhatsApp.",
].join(" ");
