import { createHash } from "crypto";
import { decideTextReply } from "../assistant/reply";
import { audit } from "../audit";
import { backupContactOf } from "../backup-contact";
import { BRAND, CITIES } from "../catalog";
import { appUrl } from "../mail";
import { sendEmail } from "../notify";
import type { EquipmentId, PublicUser } from "../types";
import { BACKUP_CONTACT_ASK, LINKS, detectIntent, normalize } from "../whatsapp/intents";
import { waConfig } from "../whatsapp/config";
import { applySlot, clearSlot, nextSlot, previousSlot, slotByMention, slotsFor, summaryOf, type Slot } from "./flow";
import { costAboutShipment, detectAgentIntent, isBack, isCancel } from "./intents";
import {
  createAgentLead,
  insertAgentMessage,
  latestLeadFor,
  listAgentMessages,
  markAgentHandoff,
  saveAgentState,
  updateLeadContact,
  upsertAgentConversation,
  type AgentConversation,
} from "./store";
import { countMatchingTrucks, ownAccountStatus } from "./tools";
import { parseTrackingCode, startTrackingChallenge, verifiedLoadStatus, verifyTrackingChallenge } from "./tracking";
import { EMPTY_STATE, type AgentChannel, type AgentIntent, type AgentMode, type AgentReply, type AgentState, type ContactType } from "./types";
import { cleanText, isNo, isYes, redactSensitive, toSpeech } from "./validate";
import { AGENT_MAX_MESSAGE } from "./config";
import { COST_EXPLANATION, COST_PENDING_NOTE, costSentence, freightCostProvider } from "./costs";

/** Saludo del agente (módulo 1), ajustado a las reglas de hoy: no entrega precios y dice que es automático. */
export const AGENT_GREETING =
  "Hola, bienvenido a CARGA360GO, la plataforma tecnológica que conecta cargas y transportistas en todo Chile. " +
  "Soy su asistente virtual automático, no una persona. Puedo ayudarle a solicitar una cotización, registrarse, " +
  "consultar el estado de su cuenta o de una carga, o pasarle con una persona del equipo. ¿Qué necesita realizar?";

export const DEFAULT_QUICK = ["Solicitar transporte", "Encontrar cargas", "Registrar mi camión", "Consultar un servicio", "Hablar con soporte"];

const NO_PRICE_NOTE = COST_EXPLANATION;

const PRICING_TALK = /comisi|membres|gratis|gratuit|suscripci|mensualidad|planes? de pago|modelo de cobro/i;

/** Quita de una respuesta las frases sobre comisiones, gratuidad o modelos de cobro (directriz del dueño). */
export function stripPricingTalk(text: string): string {
  if (!PRICING_TALK.test(text)) return text;
  const kept = text
    .split(/\n/)
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !PRICING_TALK.test(sentence))
        .join(" "),
    )
    .filter((line, index, all) => line.trim() || (index > 0 && all[index - 1].trim()));
  const result = kept.join("\n").trim();
  return result.replace(/\*/g, "").length > 20 ? result : `${COST_EXPLANATION} ${COST_PENDING_NOTE}`;
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

type TurnInput = {
  channel: AgentChannel;
  sessionKey: string;
  text: string;
  via?: "texto" | "voz";
  user?: PublicUser | null;
  ip?: string | null;
  now?: Date;
  executive?: boolean;
};

type Outcome = {
  text: string;
  state: AgentState;
  intent: AgentIntent;
  mode: AgentMode;
  engine: string;
  handoff?: boolean;
  leadCode?: string | null;
  quick?: string[];
};

function cityFromText(text: string): string | null {
  const t = normalize(text);
  let best: string | null = null;
  for (const city of CITIES) {
    const name = normalize(city.name);
    if (new RegExp(`\\b${name}\\b`).test(t) && (!best || name.length > normalize(best).length)) best = city.name;
  }
  return best;
}

function quickFor(state: AgentState): string[] {
  if (state.step === "confirmar") return ["Sí, confirmar", "Corregir", "Cancelar"];
  if (state.step === "seguimiento_codigo" || state.step === "seguimiento_otp") return ["Cancelar", "Hablar con soporte"];
  if (!state.flow || !state.step) return DEFAULT_QUICK;
  const byStep: Record<string, string[]> = {
    tipo: ["Empresa con carga", "Transportista"],
    respaldo: ["Omitir"],
    detalles: ["No"],
    fecha: ["Mañana", "Lo antes posible"],
    camion: ["Rampla", "Sider", "Furgón", "Refrigerado", "No sé"],
    contacto: state.flow === "humano" ? ["Omitir"] : [],
  };
  return [...(byStep[state.step] ?? []), "Cancelar"];
}

function prefillFromUser(state: AgentState, user: PublicUser | null | undefined): AgentState {
  if (!user || user.role === "admin") return state;
  const data = { ...state.data };
  if (state.flow === "cotizar" && !data.nombre) data.nombre = user.razonSocial || user.contactName;
  if ((state.flow === "cotizar" || state.flow === "humano") && !data.contacto) {
    data.contacto = user.email;
    data.contacto_valor = user.email;
    data.contacto_tipo = "email";
  }
  if (!("respaldo" in data)) {
    const backup = backupContactOf(user.id);
    if (backup) {
      data.respaldo = backup.display;
      data.respaldo_valor = backup.value;
      data.respaldo_tipo = backup.type;
    }
  }
  return { ...state, data };
}

function contactType(value: string | undefined): ContactType | null {
  return value === "email" || value === "telefono" ? value : null;
}

function askOrFinish(state: AgentState, prefix: string): { text: string; state: AgentState; finished: boolean } {
  if (!state.flow) return { text: prefix, state, finished: true };
  const slot = nextSlot(state.flow, state.data);
  if (slot) return { text: [prefix, slot.ask].filter(Boolean).join("\n"), state: { ...state, step: slot.key }, finished: false };
  return { text: prefix, state, finished: true };
}

function confirmText(state: AgentState): string {
  return `Este es el resumen de su solicitud:\n${summaryOf("cotizar", state.data)}\n\n¿Confirma que la registre? Responda «sí», «corregir» o «cancelar».`;
}

async function notifyTeam(conv: AgentConversation, code: string, reason: string) {
  const lines = listAgentMessages(conv.id, 8).map((m) => `${m.createdAt.slice(0, 16).replace("T", " ")} ${m.role}: ${m.body}`);
  const text = [
    `El agente comercial de ${BRAND.name} derivó una conversación a una persona.`,
    "",
    `Solicitud: ${code}`,
    `Canal: ${conv.channel}`,
    `Motivo: ${reason}`,
    "",
    "Últimos mensajes (hora UTC, con datos sensibles ocultos):",
    ...lines,
    "",
    `Panel: ${appUrl()}/admin/agente?c=${conv.id}`,
  ].join("\n");
  try {
    await sendEmail(waConfig().handoffEmail, `Agente comercial: derivación ${code}`, text);
  } catch {
    console.error("[carga360go] agente: no se pudo avisar la derivación", code);
  }
}

async function handoff(conv: AgentConversation, input: TurnInput, reason: string, at: string): Promise<Outcome> {
  const existing = latestLeadFor(conv.id, "derivacion");
  if (existing && conv.handoffAt) {
    return {
      text: `Ya avisé al equipo (solicitud ${existing.code}). Una persona le responderá a la brevedad. También puede escribir por WhatsApp a ${BRAND.whatsappDisplay} (https://wa.me/${BRAND.whatsapp}) o a ${BRAND.email}.`,
      state: { ...EMPTY_STATE, leadId: existing.id },
      intent: "humano",
      mode: "flujo",
      engine: "flujo:humano:repetida",
      handoff: true,
      leadCode: existing.code,
    };
  }
  const user = input.user && input.user.role !== "admin" ? input.user : null;
  const lead = createAgentLead({
    conversationId: conv.id,
    channel: conv.channel,
    kind: "derivacion",
    userId: user?.id ?? null,
    name: user ? user.razonSocial || user.contactName : null,
    contact: user?.email ?? null,
    contactType: user ? "email" : null,
    summary: `Derivación (${reason})`,
    at,
  });
  markAgentHandoff(conv.id, at);
  audit(user, "agente.derivacion", { type: "agente", id: conv.id }, { canal: conv.channel, solicitud: lead.code, motivo: reason });
  await notifyTeam(conv, lead.code, reason);
  let state: AgentState = { flow: "humano", step: null, data: {}, leadId: lead.id };
  state = prefillFromUser(state, user);
  const intro =
    `Entendido. Registré su solicitud de atención con el número ${lead.code} y avisé al equipo de Carga 360 Go: una persona le responderá a la brevedad. ` +
    `También puede escribir por WhatsApp a ${BRAND.whatsappDisplay} (https://wa.me/${BRAND.whatsapp}) o a ${BRAND.email}.`;
  const next = askOrFinish(state, intro);
  return {
    text: next.text,
    state: next.finished ? { ...EMPTY_STATE, leadId: lead.id } : next.state,
    intent: "humano",
    mode: "flujo",
    engine: "flujo:humano",
    handoff: true,
    leadCode: lead.code,
  };
}

async function finishQuote(conv: AgentConversation, state: AgentState, user: PublicUser | null | undefined, at: string): Promise<Outcome> {
  const d = state.data;
  const origin = cityFromText(d.origen ?? "") ?? "";
  const destination = cityFromText(d.destino ?? "") ?? "";
  const costs = freightCostProvider();
  let estimate = null;
  if (costs.status().connected) {
    try {
      estimate = await costs.estimate({
        origin: origin || d.origen || "",
        destination: destination || d.destino || "",
        equipment: (d.equipo || null) as EquipmentId | null,
        weightT: d.peso_t ? Number(d.peso_t) : null,
        date: d.fecha || null,
      });
    } catch {
      console.error("[carga360go] agente: el motor de costos falló");
      estimate = null;
    }
  }
  const lead = createAgentLead({
    conversationId: conv.id,
    channel: conv.channel,
    kind: "cotizacion",
    userId: user && user.role !== "admin" ? user.id : null,
    name: d.nombre,
    contact: d.contacto_valor || null,
    contactType: contactType(d.contacto_tipo),
    backupContact: d.respaldo_valor || null,
    backupContactType: contactType(d.respaldo_tipo),
    role: "empresa",
    data: {
      origen: d.origen ?? "",
      origen_ciudad: origin,
      destino: d.destino ?? "",
      destino_ciudad: destination,
      fecha: d.fecha ?? "",
      mercancia: d.mercancia ?? "",
      peso: d.peso ?? "",
      peso_t: d.peso_t ?? "",
      camion: d.camion ?? "",
      equipo: d.equipo ?? "",
      detalles: d.detalles ?? "",
      costo_estimado_clp: estimate?.complete && estimate.totalClp !== null ? String(Math.round(estimate.totalClp)) : "",
      costo_fuente: estimate ? `${estimate.source}${estimate.complete ? "" : " (incompleto)"}` : costs.status().connected ? "motor_sin_resultado" : "pendiente_de_conectar",
      costo_cotizacion_id: estimate?.quoteId ?? "",
    },
    summary: summaryOf("cotizar", { ...d, contacto: d.contacto ? "(registrado)" : "", respaldo: d.respaldo ? "(registrado)" : "" }),
    at,
  });
  audit(null, "agente.lead_creado", { type: "agente_lead", id: lead.id }, { canal: conv.channel, tipo: "cotizacion", solicitud: lead.code });
  const parts = [
    `Listo. Registré su solicitud con el número ${lead.code}. Un ejecutivo de Carga 360 Go le responderá a ${d.contacto}.`,
    costSentence(estimate),
  ];
  const match = countMatchingTrucks({
    origin: origin || d.origen || "",
    destination: destination || d.destino || "",
    date: d.fecha && /^\d{4}-/.test(d.fecha) ? d.fecha : null,
    equipment: (d.equipo || null) as EquipmentId | null,
    weightT: d.peso_t ? Number(d.peso_t) : null,
  });
  if (match && match.count > 0) {
    parts.push(
      `Según Carga360 Match, hay ${match.count} camión(es) publicados potencialmente compatibles por equipo y capacidad` +
        (match.bestScore !== null ? ` (mejor compatibilidad calculada por el sistema: ${match.bestScore}%)` : "") +
        ". Esto no confirma disponibilidad.",
    );
  }
  parts.push(`Si quiere recibir ofertas de transportistas, también puede publicar la carga en ${LINKS.publicar}.`);
  if (!d.respaldo_valor) parts.push("Si más adelante tiene un teléfono o correo de respaldo, indíquelo al ejecutivo.");
  return {
    text: parts.join("\n"),
    state: { ...EMPTY_STATE, leadId: lead.id },
    intent: "cotizar",
    mode: "flujo",
    engine: "flujo:cotizar:registrada",
    leadCode: lead.code,
  };
}

function finishRegister(conv: AgentConversation, state: AgentState, at: string): Outcome {
  const d = state.data;
  const lead = createAgentLead({
    conversationId: conv.id,
    channel: conv.channel,
    kind: "registro",
    name: d.nombre,
    contact: d.contacto_valor || null,
    contactType: contactType(d.contacto_tipo),
    backupContact: d.respaldo_valor || null,
    backupContactType: contactType(d.respaldo_tipo),
    role: d.tipo,
    data: { tipo: d.tipo ?? "" },
    summary: `Pre-registro de ${d.tipo}`,
    at,
  });
  audit(null, "agente.lead_creado", { type: "agente_lead", id: lead.id }, { canal: conv.channel, tipo: "registro", solicitud: lead.code });
  const steps =
    d.tipo === "transportista"
      ? `Para completar su inscripción: regístrese en ${LINKS.registro}, confirme su correo y su celular, y suba sus 6 documentos (cédula, licencia profesional, padrón, revisión técnica, SOAP y permiso de circulación). Nuestro equipo los revisa; el agente no aprueba cuentas ni documentos.`
      : `Para completar su inscripción: regístrese en ${LINKS.registro} con el RUT de su empresa y confirme su correo. Después puede publicar sus cargas en ${LINKS.publicar}.`;
  return {
    text: [
      `Gracias. Guardé su pre-registro con el número ${lead.code} y un ejecutivo le escribirá a ${d.contacto}.`,
      steps,
      "Por este medio no pedimos RUT, cédula, contraseñas ni archivos.",
      BACKUP_CONTACT_ASK,
    ].join("\n"),
    state: { ...EMPTY_STATE, leadId: lead.id },
    intent: "registro",
    mode: "flujo",
    engine: "flujo:registro:registrada",
    leadCode: lead.code,
  };
}

function finishHandoff(state: AgentState, at: string): Outcome {
  if (state.leadId && state.data.contacto_valor) {
    updateLeadContact(
      state.leadId,
      {
        contact: state.data.contacto_valor,
        contactType: contactType(state.data.contacto_tipo),
        backupContact: state.data.respaldo_valor || null,
        backupContactType: contactType(state.data.respaldo_tipo),
      },
      at,
    );
    return {
      text: `Gracias, dejé su contacto (${state.data.contacto}) en la solicitud. Una persona del equipo le escribirá.`,
      state: { ...EMPTY_STATE, leadId: state.leadId },
      intent: "humano",
      mode: "flujo",
      engine: "flujo:humano:contacto",
      handoff: true,
    };
  }
  return {
    text: `De acuerdo. Puede escribirnos cuando quiera por WhatsApp a ${BRAND.whatsappDisplay} o a ${BRAND.email}.`,
    state: { ...EMPTY_STATE, leadId: state.leadId ?? null },
    intent: "humano",
    mode: "flujo",
    engine: "flujo:humano:sin_contacto",
    handoff: true,
  };
}

function finishFlow(conv: AgentConversation, state: AgentState, user: PublicUser | null | undefined, at: string): Outcome {
  if (state.flow === "cotizar") {
    return { text: confirmText(state), state: { ...state, step: "confirmar", correcting: false }, intent: "cotizar", mode: "flujo", engine: "flujo:cotizar:resumen" };
  }
  if (state.flow === "registro") return finishRegister(conv, state, at);
  return finishHandoff(state, at);
}

function startFlow(conv: AgentConversation, flow: "cotizar" | "registro", user: PublicUser | null | undefined, at: string): Outcome {
  const intro =
    flow === "cotizar"
      ? `Con gusto le ayudo a solicitar una cotización. Le haré algunas preguntas, una a la vez; puede decir «corregir» o «cancelar» cuando quiera. ${NO_PRICE_NOTE}`
      : "Con gusto le ayudo con su inscripción. Le haré algunas preguntas cortas; puede decir «cancelar» cuando quiera.";
  const state = prefillFromUser({ flow, step: null, data: {}, leadId: null }, user);
  const next = askOrFinish(state, intro);
  if (next.finished) return finishFlow(conv, next.state, user, at);
  return { text: next.text, state: next.state, intent: flow, mode: "flujo", engine: `flujo:${flow}:inicio` };
}

async function continueFlow(conv: AgentConversation, state: AgentState, text: string, user: PublicUser | null | undefined, now: Date): Promise<Outcome> {
  const flow = state.flow!;
  const intent: AgentIntent = flow === "humano" ? "humano" : flow;
  const at = now.toISOString();
  if (state.step === "confirmar") {
    if (isYes(text)) return await finishQuote(conv, state, user, at);
    if (isNo(text) || isBack(text) || /corregir|cambiar/i.test(text)) {
      const slot = slotByMention(flow, text);
      if (slot) {
        const cleared = clearSlot(state, slot.key);
        return { text: slot.ask, state: { ...cleared, step: slot.key, correcting: true }, intent, mode: "flujo", engine: "flujo:corregir" };
      }
      return {
        text: `¿Qué dato quiere corregir? ${slotsFor(flow).map((s) => s.label.toLowerCase()).join(", ")}.`,
        state: { ...state, step: "corregir" },
        intent,
        mode: "flujo",
        engine: "flujo:corregir",
      };
    }
    return { text: "¿Confirma que registre la solicitud? Responda «sí», «corregir» o «cancelar».", state, intent, mode: "flujo", engine: "flujo:confirmar" };
  }
  if (state.step === "corregir") {
    const slot = slotByMention(flow, text);
    if (!slot) {
      return {
        text: `No identifiqué el dato. Dígame cuál: ${slotsFor(flow).map((s) => s.label.toLowerCase()).join(", ")}.`,
        state,
        intent,
        mode: "flujo",
        engine: "flujo:corregir",
      };
    }
    const cleared = clearSlot(state, slot.key);
    return { text: slot.ask, state: { ...cleared, step: slot.key, correcting: true }, intent, mode: "flujo", engine: "flujo:corregir" };
  }
  const slot: Slot | undefined = slotsFor(flow).find((item) => item.key === state.step);
  if (!slot) {
    const next = askOrFinish(state, "");
    return next.finished ? finishFlow(conv, next.state, user, at) : { text: next.text, state: next.state, intent, mode: "flujo", engine: `flujo:${flow}` };
  }
  if (isBack(text) && !state.correcting) {
    const prev = previousSlot(flow, slot.key);
    if (prev) {
      const cleared = clearSlot(state, prev.key);
      return { text: `Volvamos atrás. ${prev.ask}`, state: { ...cleared, step: prev.key }, intent, mode: "flujo", engine: `flujo:${flow}:atras` };
    }
  }
  const applied = applySlot(state, slot, text, now);
  if (applied.error) return { text: applied.error, state, intent, mode: "flujo", engine: `flujo:${flow}:invalido` };
  if (state.correcting && flow === "cotizar") {
    const fixed = { ...applied.state, correcting: false };
    return { text: confirmText(fixed), state: { ...fixed, step: "confirmar" }, intent, mode: "flujo", engine: "flujo:cotizar:resumen" };
  }
  const next = askOrFinish({ ...applied.state, correcting: false }, "");
  if (next.finished) return finishFlow(conv, next.state, user, at);
  return { text: next.text, state: next.state, intent, mode: "flujo", engine: `flujo:${flow}:${next.state.step}` };
}

const PANEL_FALLBACK = `Para ver el estado inicie sesión y entre a su panel: ${LINKS.ingreso}. Ahí verá sus cargas y el último evento registrado.`;

async function trackingTurn(conv: AgentConversation, state: AgentState, text: string, now: Date): Promise<Outcome> {
  if (state.step === "seguimiento_otp") {
    const result = verifyTrackingChallenge(conv.id, text, now);
    if (result.ok) {
      return { text: verifiedLoadStatus(result.loadId), state: { ...EMPTY_STATE }, intent: "estado", mode: "flujo", engine: "flujo:seguimiento:verificado" };
    }
    if (result.reason === "incorrecto") {
      return { text: "El código no coincide. Revise el mensaje e inténtelo de nuevo, o diga «cancelar».", state, intent: "estado", mode: "flujo", engine: "flujo:seguimiento:incorrecto" };
    }
    return {
      text: `No pude verificar el código (${result.reason === "vencido" ? "venció" : "se agotaron los intentos"}). ${PANEL_FALLBACK}`,
      state: { ...EMPTY_STATE },
      intent: "estado",
      mode: "flujo",
      engine: `flujo:seguimiento:${result.reason}`,
    };
  }
  const code = parseTrackingCode(text);
  if (!code) {
    const attempted = /seg|\d/i.test(text);
    return {
      text: `${attempted ? "No reconocí un código válido. " : ""}Indíqueme el código de seguimiento de la carga. Tiene la forma SEG seguido de 6 letras y números, por ejemplo SEG-7KQ2MX (no usa 0, 1, O ni I). Lo ve el dueño de la carga en el detalle de la carga. Si prefiere, diga «cancelar».`,
      state: { ...EMPTY_STATE, step: "seguimiento_codigo" },
      intent: "estado",
      mode: "flujo",
      engine: "flujo:seguimiento:pide_codigo",
    };
  }
  const started = await startTrackingChallenge(conv.id, code, now);
  if (started.status === "sin_canal") {
    return {
      text: `Para proteger la información, antes de dar el estado de una carga debo verificar a la persona con un código enviado a su contacto registrado, y ese envío no está disponible ahora. ${PANEL_FALLBACK}`,
      state: { ...EMPTY_STATE },
      intent: "estado",
      mode: "flujo",
      engine: "flujo:seguimiento:sin_canal",
    };
  }
  if (started.status === "limite") {
    return { text: `Ya se enviaron varios códigos en esta conversación. Espere una hora o ${PANEL_FALLBACK.charAt(0).toLowerCase()}${PANEL_FALLBACK.slice(1)}`, state: { ...EMPTY_STATE }, intent: "estado", mode: "flujo", engine: "flujo:seguimiento:limite" };
  }
  return {
    text: `Si el código ${code} corresponde a una carga, envié un código de verificación de 6 dígitos al ${started.channel === "email" ? "correo" : "WhatsApp"} registrado de su dueño. Dígamelo para continuar (vence en 10 minutos).`,
    state: { ...EMPTY_STATE, step: "seguimiento_otp" },
    intent: "estado",
    mode: "flujo",
    engine: "flujo:seguimiento:enviado",
  };
}

async function assistantTurn(conv: AgentConversation, text: string, executive = false): Promise<Outcome> {
  const history = listAgentMessages(conv.id, 12).map((m) => ({ direction: m.role === "cliente" ? ("in" as const) : ("out" as const), body: m.body }));
  const decision = await decideTextReply(text, history, conv.channel === "whatsapp" ? "whatsapp" : "web", { executive });
  const mode: AgentMode = decision.engine.startsWith("ia:") ? "ia" : "reglas";
  return { text: stripPricingTalk(decision.text), state: { ...EMPTY_STATE }, intent: "otro", mode, engine: decision.engine, handoff: decision.handoff };
}

/**
 * Un turno del agente, igual para web, WhatsApp y teléfono. Guarda el mensaje (con datos sensibles
 * ocultos), decide la respuesta y la guarda. Las acciones que escriben datos (leads) piden confirmación
 * o son derivaciones explícitas; nada de lo que diga el usuario cambia permisos ni da acceso a datos de otros.
 */
export async function handleAgentTurn(input: TurnInput): Promise<AgentReply> {
  const now = input.now ?? new Date();
  const at = now.toISOString();
  const text = cleanText(input.text, AGENT_MAX_MESSAGE);
  const conv = upsertAgentConversation(
    { channel: input.channel, sessionKey: input.sessionKey, userId: input.user?.id ?? null, ipHash: input.ip ? hashIp(input.ip) : null },
    at,
  );
  insertAgentMessage({ conversationId: conv.id, role: "cliente", body: redactSensitive(text), via: input.via ?? "texto", at });
  const state = conv.state;
  const intent = detectAgentIntent(text);
  let outcome: Outcome;
  try {
    if (isCancel(text)) {
      outcome = { text: "Listo, dejé eso de lado. ¿En qué más le puedo ayudar?", state: { ...EMPTY_STATE }, intent: "otro", mode: "flujo", engine: "flujo:cancelar" };
    } else if (intent === "humano" && state.flow !== "humano") {
      outcome = await handoff(conv, input, "pidió una persona", at);
    } else if (state.flow && state.step) {
      outcome = await continueFlow(conv, state, text, input.user, now);
    } else if (state.step === "seguimiento_codigo" || state.step === "seguimiento_otp") {
      outcome = await trackingTurn(conv, state, text, now);
    } else if (intent === "costos") {
      if (costAboutShipment(text)) {
        const flow = startFlow(conv, "cotizar", input.user, at);
        outcome = { ...flow, intent: "costos" };
      } else {
        outcome = {
          text: `${COST_EXPLANATION} ${COST_PENDING_NOTE}\nSi me da los datos del transporte, registro su solicitud para que un ejecutivo le responda: diga «solicitar transporte».`,
          state: { ...EMPTY_STATE },
          intent: "costos",
          mode: "flujo",
          engine: "flujo:costos",
        };
      }
    } else if (intent === "cotizar") {
      outcome = startFlow(conv, "cotizar", input.user, at);
    } else if (intent === "registro") {
      if (input.user) {
        outcome = { text: `Usted ya tiene una cuenta.\n${ownAccountStatus(input.user, now)}`, state: { ...EMPTY_STATE }, intent: "estado", mode: "flujo", engine: "flujo:estado:cuenta" };
      } else {
        outcome = startFlow(conv, "registro", input.user, at);
      }
    } else if (intent === "estado") {
      if (input.user) {
        outcome = { text: ownAccountStatus(input.user, now), state: { ...EMPTY_STATE }, intent: "estado", mode: "flujo", engine: "flujo:estado:cuenta" };
      } else {
        const tracking = await trackingTurn(conv, { ...EMPTY_STATE, step: "seguimiento_codigo" }, text, now);
        outcome = parseTrackingCode(text)
          ? tracking
          : {
              ...tracking,
              text: `Para consultar el estado de su cuenta, inicie sesión en ${LINKS.ingreso} y vuelva a preguntarme aquí. Para una carga, también puedo verificarle con el código de seguimiento.\n${tracking.text}\n\n${BACKUP_CONTACT_ASK}`,
            };
      }
    } else if (detectIntent(text) === "saludo") {
      outcome = { text: AGENT_GREETING, state: { ...EMPTY_STATE }, intent: "otro", mode: "flujo", engine: "flujo:saludo" };
    } else if (parseTrackingCode(text)) {
      outcome = await trackingTurn(conv, { ...EMPTY_STATE, step: "seguimiento_codigo" }, text, now);
    } else {
      outcome = await assistantTurn(conv, text, input.executive === true);
      if (outcome.handoff) {
        const handed = await handoff(conv, input, "la IA derivó", at);
        outcome = { ...handed, text: `${outcome.text}\n\n${handed.text}`, mode: outcome.mode };
      }
    }
  } catch (error) {
    console.error("[carga360go] agente: error en el turno", error instanceof Error ? error.message : "error");
    outcome = {
      text: `Ahora no pude completar la respuesta. Puede escribirnos a ${BRAND.email} o por WhatsApp a ${BRAND.whatsappDisplay}.`,
      state,
      intent,
      mode: "reglas",
      engine: "fallback:error",
    };
  }
  saveAgentState(conv.id, outcome.state, outcome.intent, new Date().toISOString());
  insertAgentMessage({ conversationId: conv.id, role: "agente", body: outcome.text, engine: outcome.engine, at: new Date(now.getTime() + 1).toISOString() });
  return {
    conversationId: conv.id,
    text: outcome.text,
    speak: toSpeech(outcome.text),
    intent: outcome.intent,
    mode: outcome.mode,
    step: outcome.state.step,
    handoff: Boolean(outcome.handoff),
    leadCode: outcome.leadCode ?? null,
    quick: outcome.quick ?? quickFor(outcome.state),
  };
}

export function resetAgentConversation(channel: AgentChannel, sessionKey: string) {
  const conv = upsertAgentConversation({ channel, sessionKey }, new Date().toISOString());
  saveAgentState(conv.id, { ...EMPTY_STATE }, null, new Date().toISOString());
}
