import { HANDOFF_INTENTS, detectIntent, normalize } from "../whatsapp/intents";
import type { AgentIntent } from "./types";

const COTIZAR =
  /\b(cotiz\w*|presupuesto|solicitar (un )?transporte|cuanto (sale|cuesta|vale|cobran)( un| el| mover)? (flete|transporte|envio|traslado)|valor (del|de un) flete|precio (del|de un) flete|necesito (un |una )?(camion|transporte|flete|traslado)|mover (una |mi )?carga|tengo (una )?carga|enviar (una )?carga|trasladar)\b/;
const REGISTRO = /\b(registr\w*|inscrib\w*|crear (una |mi )?cuenta|abrir (una )?cuenta|unirme|registrar mi camion|sumarme)\b/;
const ESTADO =
  /\b(estado de (mi |la |una )?(cuenta|carga|solicitud|servicio|transporte|viaje|inscripcion|registro)|consultar (un |mi )?(servicio|transporte|carga|estado)|donde (esta|va|anda) (mi )?(carga|camion)|ya retiraron|cuando llega|incidencia|mi cuenta|en revision)\b/;
/** Reemplaza las palabras que en este widget se refieren al propio agente ("agente de voz"). */
const SELF_REFERENCE = /\bagente (de voz|virtual|inteligente|automatico)\b/g;

/**
 * Intención comercial del mensaje. Reutiliza el detector del bot de WhatsApp (whatsapp/intents.ts)
 * y agrega los patrones del agente. Las derivaciones (persona, reclamo, pago, legal) mandan siempre.
 */
export function detectAgentIntent(text: string): AgentIntent {
  const t = normalize(text).replace(SELF_REFERENCE, "asistente");
  if (!t) return "otro";
  const base = detectIntent(t);
  if (HANDOFF_INTENTS.includes(base)) return "humano";
  if (/\bhablar con soporte\b/.test(t)) return "humano";
  if (/\b(crear|abrir) (una |mi )?cuenta\b/.test(t)) return "registro";
  if (ESTADO.test(t) || base === "estado_cuenta" || base === "seguimiento_carga" || base === "documentos_rechazo") return "estado";
  if (COTIZAR.test(t) || base === "publicar_carga") return "cotizar";
  if (REGISTRO.test(t) || base === "registro_transportista" || base === "publicar_camion") return "registro";
  return "otro";
}

/** Comandos que interrumpen un flujo guiado. */
export function isCancel(text: string): boolean {
  return /^(cancelar|cancela|salir|detener|empezar de nuevo|comenzar de nuevo|reiniciar|olvidalo|olvídalo|basta)\b/i.test(text.trim());
}

export function isBack(text: string): boolean {
  return /^(atras|atrás|volver|corregir|me equivoque|me equivoqué|corrijo)\b/i.test(text.trim());
}
