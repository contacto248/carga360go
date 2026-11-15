import { normalize } from "../whatsapp/intents";
import type { EquipmentId } from "../types";
import type { AgentFlow, AgentState } from "./types";
import { isSkip, parseContact, parseDate, parseWeightT } from "./validate";

/**
 * Flujos guiados del agente: piden un dato a la vez, validan cada respuesta y terminan con un resumen
 * que el cliente confirma. Funciones puras (sin base de datos) para poder probarlas directamente.
 */
export type SlotResult = { ok: true; value: string; extra?: Record<string, string> } | { ok: false; error: string };

export type Slot = {
  key: string;
  label: string;
  ask: string;
  optional?: boolean;
  validate: (text: string, data: Record<string, string>, now: Date) => SlotResult;
};

function freeText(min: number, max: number, error: string) {
  return (text: string): SlotResult => {
    const value = text.trim();
    if (value.length < min) return { ok: false, error };
    return { ok: true, value: value.slice(0, max) };
  };
}

function contactSlot(text: string): SlotResult {
  const parsed = parseContact(text);
  if (!parsed) return { ok: false, error: "No reconocí ese contacto. Indíqueme un celular chileno (+56 9 XXXX XXXX), un fijo (+56 2 XXXX XXXX) o un correo." };
  return { ok: true, value: parsed.display, extra: { contacto_valor: parsed.value, contacto_tipo: parsed.type } };
}

function backupSlot(text: string, data: Record<string, string>): SlotResult {
  if (isSkip(text)) return { ok: true, value: "", extra: { respaldo_valor: "", respaldo_tipo: "" } };
  const parsed = parseContact(text);
  if (!parsed) return { ok: false, error: "No reconocí ese contacto de respaldo. Indique otro teléfono chileno o un correo, o diga «omitir»." };
  if (parsed.value === data.contacto_valor) return { ok: false, error: "El contacto de respaldo debe ser distinto del principal. Indique otro, o diga «omitir»." };
  return { ok: true, value: parsed.display, extra: { respaldo_valor: parsed.value, respaldo_tipo: parsed.type } };
}

const EQUIPMENT_WORDS: [RegExp, EquipmentId][] = [
  [/\brampla\b|\bplano\b|\bplana\b/, "rampla_plana"],
  [/\bsider\b|\blona\b/, "sider"],
  [/\bfurgon\b/, "furgon_seco"],
  [/\brefriger|\bfrigor|\bfrio\b/, "refrigerado"],
  [/\bcama baja\b|\bsobredimension/, "cama_baja"],
  [/\btolva\b|\bgranel\b|\bbatea\b/, "tolva"],
  [/\bestanque\b|\bcisterna\b/, "estanque"],
  [/\bcontenedor|\bportacontenedor/, "portacontenedor"],
  [/\b3 ?\/ ?4\b|\btres cuartos\b|\bliviano\b|\bcamioneta\b/, "camion_34"],
  [/\bninera\b|\bportaautos\b|\bautos\b/, "portaautos"],
  [/\bpeligros/, "peligrosa"],
];

export function equipmentFromText(text: string): EquipmentId | null {
  const t = normalize(text);
  for (const [re, id] of EQUIPMENT_WORDS) if (re.test(t)) return id;
  return null;
}

export const QUOTE_SLOTS: Slot[] = [
  { key: "nombre", label: "Nombre o razón social", ask: "Para registrar su solicitud, ¿a nombre de quién o de qué empresa la dejo?", validate: freeText(2, 120, "Indíqueme un nombre o razón social.") },
  { key: "contacto", label: "Contacto", ask: "¿A qué teléfono o correo le puede responder un ejecutivo?", validate: contactSlot },
  {
    key: "respaldo",
    label: "Contacto de respaldo",
    ask: "¿Tiene un teléfono o correo de respaldo, distinto del anterior, por si no logramos ubicarle? Si no, diga «omitir».",
    optional: true,
    validate: backupSlot,
  },
  { key: "origen", label: "Origen", ask: "¿Desde qué ciudad sale la carga? Si la tiene, agregue la dirección.", validate: freeText(2, 160, "Indíqueme la ciudad de origen.") },
  { key: "destino", label: "Destino", ask: "¿Hasta qué ciudad va? Puede agregar la dirección.", validate: freeText(2, 160, "Indíqueme la ciudad de destino.") },
  {
    key: "fecha",
    label: "Fecha requerida",
    ask: "¿Para qué fecha necesita el transporte? Por ejemplo: 20-11, mañana o «lo antes posible».",
    validate: (text, _data, now) => {
      const value = parseDate(text, now);
      return value ? { ok: true, value } : { ok: false, error: "No entendí la fecha o ya pasó. Dígame, por ejemplo, 25-11-2026, mañana o «lo antes posible»." };
    },
  },
  { key: "mercancia", label: "Tipo de mercancía", ask: "¿Qué tipo de mercancía es?", validate: freeText(2, 160, "Cuénteme brevemente qué mercancía es.") },
  {
    key: "peso",
    label: "Peso y volumen",
    ask: "¿Cuál es el peso aproximado? Si sabe el volumen o la cantidad de pallets, agréguelo. Por ejemplo: 12 toneladas, 20 pallets.",
    validate: (text) => {
      const tons = parseWeightT(text);
      if (tons === null) return { ok: false, error: "Necesito un peso aproximado, por ejemplo «800 kg» o «12 toneladas»." };
      return { ok: true, value: text.trim().slice(0, 160), extra: { peso_t: String(tons) } };
    },
  },
  {
    key: "camion",
    label: "Tipo de camión",
    ask: "¿Qué tipo de camión necesita? Por ejemplo rampla, sider, furgón, refrigerado o cama baja. Si no sabe, diga «no sé».",
    validate: (text) => {
      const value = text.trim().slice(0, 120);
      if (!value) return { ok: false, error: "Indíqueme el tipo de camión o diga «no sé»." };
      const id = equipmentFromText(value);
      return { ok: true, value, extra: { equipo: id ?? "" } };
    },
  },
  {
    key: "detalles",
    label: "Requisitos y observaciones",
    ask: "¿Hay dimensiones especiales, requisitos de carga y descarga o exigencias de seguridad? Si no, diga «no».",
    optional: true,
    validate: (text) => (isSkip(text) ? { ok: true, value: "" } : { ok: true, value: text.trim().slice(0, 300) }),
  },
];

export const REGISTER_SLOTS: Slot[] = [
  {
    key: "tipo",
    label: "Tipo de cuenta",
    ask: "¿Se quiere registrar como empresa con carga o como transportista?",
    validate: (text) => {
      const t = normalize(text);
      if (/transport|camion|conductor|chofer|flota/.test(t)) return { ok: true, value: "transportista" };
      if (/empresa|mandante|carga|cliente|generador/.test(t)) return { ok: true, value: "empresa" };
      return { ok: false, error: "Dígame «empresa» si tiene carga para mover, o «transportista» si tiene camión." };
    },
  },
  { key: "nombre", label: "Nombre o empresa", ask: "¿Cuál es su nombre o el de su empresa?", validate: freeText(2, 120, "Indíqueme un nombre o razón social.") },
  { key: "contacto", label: "Contacto", ask: "¿A qué teléfono o correo le escribimos para ayudarle con la inscripción?", validate: contactSlot },
  { key: "respaldo", label: "Contacto de respaldo", ask: QUOTE_SLOTS[2].ask, optional: true, validate: backupSlot },
];

export const HANDOFF_SLOTS: Slot[] = [
  {
    key: "contacto",
    label: "Contacto",
    ask: "Si quiere que le contactemos, indíqueme un teléfono o correo. Si prefiere escribirnos usted, diga «omitir».",
    optional: true,
    validate: (text) => (isSkip(text) ? { ok: true, value: "", extra: { contacto_valor: "", contacto_tipo: "" } } : contactSlot(text)),
  },
  {
    key: "respaldo",
    label: "Contacto de respaldo",
    ask: QUOTE_SLOTS[2].ask,
    optional: true,
    validate: backupSlot,
  },
];

export function slotsFor(flow: AgentFlow): Slot[] {
  if (flow === "cotizar") return QUOTE_SLOTS;
  if (flow === "registro") return REGISTER_SLOTS;
  return HANDOFF_SLOTS;
}

/** Próximo dato pendiente (se saltan los ya completos, incluidos los que vienen de la sesión). */
export function nextSlot(flow: AgentFlow, data: Record<string, string>): Slot | null {
  for (const slot of slotsFor(flow)) {
    if (flow === "humano" && slot.key === "respaldo" && !data.contacto_valor) continue;
    if (!(slot.key in data)) return slot;
  }
  return null;
}

export function previousSlot(flow: AgentFlow, current: string | null): Slot | null {
  const slots = slotsFor(flow);
  const index = slots.findIndex((slot) => slot.key === current);
  if (index <= 0) return null;
  return slots[index - 1];
}

/** Busca qué dato quiere corregir el cliente ("el destino", "la fecha"...). */
export function slotByMention(flow: AgentFlow, text: string): Slot | null {
  const t = normalize(text);
  const aliases: Record<string, RegExp> = {
    nombre: /\b(nombre|empresa|razon social)\b/,
    contacto: /\b(contacto|telefono|celular|correo|mail|numero)\b/,
    respaldo: /\b(respaldo)\b/,
    origen: /\b(origen|desde|salida)\b/,
    destino: /\b(destino|hasta|llegada)\b/,
    fecha: /\b(fecha|dia|cuando)\b/,
    mercancia: /\b(mercancia|mercaderia|producto|carga)\b/,
    peso: /\b(peso|volumen|pallets|kilos|toneladas)\b/,
    camion: /\b(camion|equipo|vehiculo)\b/,
    detalles: /\b(detalle|detalles|observacion|observaciones|requisitos|dimensiones|seguridad)\b/,
    tipo: /\b(tipo)\b/,
  };
  // "respaldo" antes que "contacto" (contacto de respaldo).
  const order = ["respaldo", ...slotsFor(flow).map((slot) => slot.key).filter((key) => key !== "respaldo")];
  for (const key of order) {
    const slot = slotsFor(flow).find((item) => item.key === key);
    if (slot && aliases[key]?.test(t)) return slot;
  }
  return null;
}

/** Resumen legible de la solicitud, para confirmar antes de registrar. */
export function summaryOf(flow: AgentFlow, data: Record<string, string>): string {
  return slotsFor(flow)
    .filter((slot) => data[slot.key])
    .map((slot) => `• ${slot.label}: ${slot.key === "fecha" && /^\d{4}-/.test(data.fecha) ? data.fecha.split("-").reverse().join("-") : data[slot.key]}`)
    .join("\n");
}

/** Aplica la respuesta del cliente al dato pedido. Devuelve el estado nuevo o el error de validación. */
export function applySlot(state: AgentState, slot: Slot, text: string, now: Date): { state: AgentState; error: string | null } {
  const result = slot.validate(text, state.data, now);
  if (!result.ok) return { state, error: result.error };
  const data = { ...state.data, [slot.key]: result.value, ...(result.extra ?? {}) };
  return { state: { ...state, data }, error: null };
}

export function clearSlot(state: AgentState, key: string): AgentState {
  const data = { ...state.data };
  delete data[key];
  if (key === "contacto") {
    delete data.contacto_valor;
    delete data.contacto_tipo;
  }
  if (key === "respaldo") {
    delete data.respaldo_valor;
    delete data.respaldo_tipo;
  }
  if (key === "peso") delete data.peso_t;
  if (key === "camion") delete data.equipo;
  return { ...state, data };
}
