/** Textos visibles del Agente 360go. Sin nombres de variables ni de proveedor. */

export const AVISO_SIN_CLAVE =
  "Falta configurar la clave del agente en el servidor. Mientras tanto puede seguir la operación por aquí: cargas, camiones, retornos y la torre de control, de Arica a Punta Arenas.";

export const AVISO_FALLO =
  "No pude completar la consulta. El agente sigue en este dispositivo: puede reenviar la pregunta o seguir con cargas, camiones, retornos y la torre de control.";

export const AVISO_COSTO = "Valor estimativo de referencia; el valor final lo acuerdan las partes";

const COSTO = /costo|tarifa|precio|peaje|di[eé]sel|flete/i;

export function quitarSecretos(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < 8) continue;
    out = out.split(secret).join("");
  }
  out = out.replace(/\b(XAI_API_KEY|AI_API_KEY|GEMINI_API_KEY|WA_ACCESS_TOKEN|WA_APP_SECRET|WA_360_API_KEY)\b/g, "");
  out = out.replace(/Bearer\s+\S+/gi, "");
  return out;
}

function sinFuncionesNoVivas(sentence: string): string {
  const negado = /no est[aá]|no hay|no oper|no disponible|no afirma|sin voz|sin gps|sin recibo/i.test(sentence);
  if (negado) return sentence;
  if (/gps/i.test(sentence) && /(en vivo|operativ|disponible|activ|conectad)/i.test(sentence)) {
    return "La ubicación en vivo no está operativa en este cliente.";
  }
  if (/(recibo|comprobante) digital/i.test(sentence) && /(disponible|activ|operativ|puede|listo)/i.test(sentence)) {
    return "El recibo digital no está operativo en este cliente.";
  }
  if (/\bvoz\b/i.test(sentence) && /(disponible|activ|operativ|puede hablar|habilitad)/i.test(sentence)) {
    return "La voz no está operativa en este cliente.";
  }
  return sentence;
}

/** Deja la respuesta lista para la pantalla: sin clave y con el aviso de referencia. */
export function presentarRespuesta(raw: string, secrets: string[] = []): string {
  let text = quitarSecretos(raw, secrets).replace(/\bcosto\s+real\b/gi, "costo de referencia desglosado");
  text = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sinFuncionesNoVivas(sentence.trim()))
    .filter(Boolean)
    .join(" ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (!text) return AVISO_FALLO;
  if (COSTO.test(text) && !text.includes(AVISO_COSTO)) {
    text = `${text} ${AVISO_COSTO}.`;
  }
  return text.slice(0, 4000);
}

export function secretosDeEntorno(env: NodeJS.ProcessEnv = process.env): string[] {
  const names = ["XAI_API_KEY", "AI_API_KEY", "GEMINI_API_KEY", "WA_ACCESS_TOKEN", "WA_APP_SECRET", "WA_360_API_KEY", "WA_VERIFY_TOKEN"];
  const found: string[] = [];
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim().length >= 8) found.push(value.trim());
  }
  return found;
}
