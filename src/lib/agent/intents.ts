import { HANDOFF_INTENTS, detectIntent, normalize } from "../whatsapp/intents";
import type { AgentIntent } from "./types";

const COTIZAR =
  /\b(cotiz\w*|presupuesto|solicitar (un )?transporte|cuanto (sale|cuesta|vale|cobran)( un| el| mover)? (flete|transporte|envio|traslado)|valor (del|de un) flete|precio (del|de un) flete|necesito (un |una )?(camion|transporte|flete|traslado)|mover (una |mi )?carga|tengo (una )?carga|enviar (una )?carga|trasladar)\b/;
const REGISTRO = /\b(registr\w*|inscrib\w*|crear (una |mi )?cuenta|abrir (una )?cuenta|unirme|registrar mi camion|sumarme)\b/;
const ESTADO =
  /\b(estado de (mi |la |una )?(cuenta|carga|solicitud|servicio|transporte|viaje|inscripcion|registro)|consultar (un |mi )?(servicio|transporte|carga|estado)|donde (esta|va|anda) (mi )?(carga|camion)|ya retiraron|cuando llega|incidencia|mi cuenta|en revision)\b/;
const COSTOS =
  /\b(comision\w*|cuanto (cuesta|sale|vale|cobran|cobra)|costos?|precios?|tarifas?|cobran|valor (del|de un) flete|membresia|planes?|suscripcion|mensualidad|gratis|gratuito)\b/;
const PAYMENT_ISSUE = /\b(cobraron|factura\w*|boleta|reembolso|devolucion|no me pagaron|transferencia|deposito|cuenta bancaria)\b/;
/** La pregunta de costo trae un flete concreto: se explica el cálculo y se empieza a tomar la solicitud. */
export function costAboutShipment(text: string): boolean {
  return /\b(flete|transporte|envio|traslado|camion|mover|llevar|desde|hasta)\b/.test(normalize(text));
}
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
  // Costos y cobros: el agente explica el cálculo automático; no habla de comisiones ni modelos de cobro.
  // Los problemas de pago concretos (cobros, facturas, reembolsos) siguen yendo a una persona.
  if (base !== "humano" && COSTOS.test(t) && !PAYMENT_ISSUE.test(t)) return "costos";
  if (HANDOFF_INTENTS.includes(base)) return "humano";
  if (/\bhablar con soporte\b/.test(t)) return "humano";
  if (/\b(crear|abrir) (una |mi )?cuenta\b/.test(t)) return "registro";
  if (ESTADO.test(t) || base === "estado_cuenta" || base === "seguimiento_carga" || base === "documentos_rechazo" || /\bseguimiento( de carga)?\b/.test(t))
    return "estado";
  if (COTIZAR.test(t) || base === "publicar_carga" || /\bpublicar carga\b/.test(t) || /\bcotizar flete\b/.test(t)) return "cotizar";
  if (REGISTRO.test(t) || base === "registro_transportista" || base === "publicar_camion" || /\bregistro transportista\b/.test(t)) return "registro";
  return "otro";
}

/** Comandos que interrumpen un flujo guiado. */
export function isCancel(text: string): boolean {
  return /^(cancelar|cancela|salir|detener|empezar de nuevo|comenzar de nuevo|reiniciar|olvidalo|olvídalo|basta)\b/i.test(text.trim());
}

export function isBack(text: string): boolean {
  return /^(atras|atrás|volver|corregir|me equivoque|me equivoqué|corrijo)\b/i.test(text.trim());
}
