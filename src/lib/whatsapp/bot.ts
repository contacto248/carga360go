import { liveContext } from "../assistant/live";
import { decideTextReply, type Decision } from "../assistant/reply";
import { agentWhatsappEnabled } from "../agent/config";
import { handleAgentTurn } from "../agent/engine";
import { BRAND } from "../catalog";
import { appUrl } from "../mail";
import { sendEmail } from "../notify";
import { confirmPhoneFromWhatsapp } from "../verification";
import { BOT_RATE, MAX_INBOUND_AGE_MS, buildMessageRequest, canSend, waConfig } from "./config";
import { NON_TEXT_REPLY } from "./intents";
import {
  botGloballyEnabled,
  botRepliesSince,
  insertMessage,
  isPaused,
  listMessages,
  markHandoff,
  messageExists,
  pauseConversation,
  setMessageWamid,
  updateMessageStatus,
  upsertConversation,
  type WaConversation,
} from "./store";

// ---------- Tipos mínimos del webhook de Meta ----------

type WaContact = { wa_id?: string; user_id?: string; profile?: { name?: string } };
type WaInbound = {
  id?: string;
  from?: string;
  from_user_id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { caption?: string };
  document?: { caption?: string; filename?: string };
  location?: { name?: string; address?: string };
};
type WaEcho = WaInbound & { to?: string; to_user_id?: string };
type WaStatus = { id?: string; status?: string };
type WaValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: WaContact[];
  messages?: WaInbound[];
  message_echoes?: WaEcho[];
  statuses?: WaStatus[];
};
type WaPayload = { object?: string; entry?: { id?: string; changes?: { field?: string; value?: WaValue }[] }[] };

// ---------- Envío (inyectable en tests) ----------

export type SendResult = { ok: boolean; wamid: string | null; error?: string };
export type Sender = (to: { waId: string | null; userId: string | null }, text: string) => Promise<SendResult>;

const defaultSender: Sender = async (to, text) => {
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    type: "text",
    text: { body: text, preview_url: true },
  };
  if (to.waId) body.to = to.waId;
  if (to.userId) body.recipient = to.userId;
  const req = buildMessageRequest(body);
  try {
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(15000),
    });
    const data = (await response.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } };
    if (!response.ok) {
      const error = `${response.status} ${data.error?.code ?? ""} ${data.error?.message ?? ""}`.trim().slice(0, 300);
      console.error(`[carga360go] WhatsApp envío falló: ${error}`);
      return { ok: false, wamid: null, error };
    }
    return { ok: true, wamid: data.messages?.[0]?.id || null };
  } catch (error) {
    console.error("[carga360go] WhatsApp envío error", error);
    return { ok: false, wamid: null, error: String(error).slice(0, 300) };
  }
};

let sender: Sender = defaultSender;
export function setSender(next: Sender | null) {
  sender = next || defaultSender;
}

export { liveContext };

// ---------- Lógica ----------

function inboundText(msg: WaInbound): string | null {
  switch (msg.type) {
    case "text":
      return msg.text?.body ?? "";
    case "button":
      return msg.button?.text ?? "";
    case "interactive":
      return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? "";
    default:
      return null;
  }
}

function describe(msg: WaInbound): string {
  const text = inboundText(msg);
  if (text !== null) return text;
  if (msg.type === "image") return `[imagen] ${msg.image?.caption ?? ""}`.trim();
  if (msg.type === "document") return `[documento] ${msg.document?.filename ?? ""} ${msg.document?.caption ?? ""}`.trim();
  if (msg.type === "location") return `[ubicación] ${msg.location?.name ?? ""} ${msg.location?.address ?? ""}`.trim();
  return `[${msg.type || "desconocido"}]`;
}

const SILENT_TYPES = new Set(["reaction", "unsupported", "system", "request_welcome", "order", "ephemeral", "edit", "revoke"]);

export type { Decision };

/** Decide la respuesta: derivaciones duras primero, luego IA y, si falla, reglas. */
export async function decideReply(conv: WaConversation, text: string | null): Promise<Decision> {
  if (text === null) return { text: NON_TEXT_REPLY, engine: "reglas", handoff: false, aiAttempt: "omitido", fallbackReason: null };
  if (agentWhatsappEnabled()) {
    // Flujo del agente comercial (cotizar, registro, estado con verificación, persona). Apagado por defecto.
    const reply = await handleAgentTurn({ channel: "whatsapp", sessionKey: conv.id, text });
    return {
      text: reply.text,
      engine: `agente:${reply.mode}:${reply.intent}`,
      handoff: reply.handoff,
      aiAttempt: reply.mode === "ia" ? "ok" : "omitido",
      fallbackReason: null,
    };
  }
  return decideTextReply(text, listMessages(conv.id, 12), "whatsapp");
}

export type SkipReason = "global_off" | "sin_credenciales" | "chat_off" | "pausado" | "viejo" | "limite" | "silencioso" | null;

export function skipReason(conv: WaConversation, msg: WaInbound, now: Date): SkipReason {
  if (!botGloballyEnabled()) return "global_off";
  if (!canSend()) return "sin_credenciales";
  if (conv.botDisabled) return "chat_off";
  if (isPaused(conv, now)) return "pausado";
  if (msg.type && SILENT_TYPES.has(msg.type)) return "silencioso";
  const ts = Number(msg.timestamp || 0) * 1000;
  if (ts && now.getTime() - ts > MAX_INBOUND_AGE_MS) return "viejo";
  const win = botRepliesSince(conv.id, new Date(now.getTime() - BOT_RATE.windowMs).toISOString());
  const day = botRepliesSince(conv.id, new Date(now.getTime() - 24 * 3600_000).toISOString());
  if (win >= BOT_RATE.perWindow || day >= BOT_RATE.perDay) return "limite";
  return null;
}

async function notifyHandoff(conv: WaConversation, reason: string) {
  const cfg = waConfig();
  const lines = listMessages(conv.id, 10).map((m) => `${m.createdAt.slice(0, 16).replace("T", " ")} ${m.source}: ${m.body}`);
  const who = conv.waId ? `+${conv.waId}` : conv.userId || "(sin número)";
  const text = [
    `Un chat de WhatsApp de ${BRAND.name} necesita a una persona.`,
    "",
    `Contacto: ${conv.name || "(sin nombre)"} — ${who}`,
    `Motivo: ${reason}`,
    `El bot quedó en pausa ${cfg.pauseHours} h en este chat. Responda desde la app de WhatsApp Business.`,
    "",
    "Últimos mensajes (hora UTC):",
    ...lines,
    "",
    `Panel: ${appUrl()}/admin/whatsapp?c=${conv.id}`,
  ].join("\n");
  await sendEmail(cfg.handoffEmail, `WhatsApp: ${conv.name || who} necesita atención`, text);
}

async function handleInbound(value: WaValue, msg: WaInbound, now: Date) {
  if (!msg.id) return "sin_id";
  const contact = value.contacts?.find((c) => (msg.from && c.wa_id === msg.from) || (msg.from_user_id && c.user_id === msg.from_user_id)) ?? value.contacts?.[0];
  const waId = msg.from || contact?.wa_id || null;
  const userId = msg.from_user_id || contact?.user_id || null;
  const at = new Date().toISOString();
  const conv = upsertConversation({ waId, userId, name: contact?.profile?.name ?? null }, at);
  if (!conv) return "sin_chat";
  const stored = insertMessage({ conversationId: conv.id, wamid: msg.id, direction: "in", source: "cliente", type: msg.type || "desconocido", body: describe(msg), at });
  if (!stored) return "duplicado";

  // OTP entrante: se confirma aquí y no se responde (el reply de WhatsApp no es gratis).
  const otp = confirmPhoneFromWhatsapp(waId || "", inboundText(msg));
  if (otp === "ok") return "otp_confirmado";
  if (otp === "ya_verificado") return "otp_ya_verificado";
  if (otp === "vencido") return "otp_vencido";
  if (otp === "codigo_invalido") return "otp_codigo_invalido";

  const skip = skipReason(conv, msg, now);
  if (skip) return `sin_respuesta:${skip}`;

  const decision = await decideReply(conv, inboundText(msg));
  const out = insertMessage({ conversationId: conv.id, direction: "out", source: "bot", type: "text", body: decision.text, engine: decision.engine, status: "enviando", at: new Date().toISOString() });
  const result = await sender({ waId: conv.waId, userId: conv.userId }, decision.text);
  if (out) setMessageWamid(out.id, result.wamid, result.ok ? "sent" : `error ${result.error ?? ""}`.slice(0, 40));
  if (decision.handoff) {
    markHandoff(conv.id, now.toISOString());
    pauseConversation(conv.id, waConfig().pauseHours, "derivado a humano", now);
    // Con el flujo del agente, notifyTeam ya avisó al equipo: un solo correo.
    if (!decision.engine.startsWith("agente:")) {
      await notifyHandoff(conv, decision.engine);
    }
  }
  return result.ok ? "respondido" : "error_envio";
}

function handleEcho(value: WaValue, echo: WaEcho, now: Date) {
  if (!echo.id || messageExists(echo.id)) return "duplicado";
  const contact = value.contacts?.[0];
  const at = new Date().toISOString();
  const conv = upsertConversation({ waId: echo.to || contact?.wa_id || null, userId: echo.to_user_id || contact?.user_id || null, name: null }, at);
  if (!conv) return "sin_chat";
  insertMessage({ conversationId: conv.id, wamid: echo.id, direction: "out", source: "humano", type: echo.type || "text", body: describe(echo), at });
  // La persona respondió desde la app: el bot se calla en este chat para no hablarle encima.
  pauseConversation(conv.id, waConfig().pauseHours, "respuesta desde la app", now);
  return "pausado";
}

// Un chat a la vez: los mensajes del mismo número se procesan en orden.
const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.then(job, job);
  queues.set(key, next.catch(() => undefined));
  next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  }).catch(() => undefined);
  return next;
}

/** Procesa un webhook completo. Devuelve un resultado por evento (para logs y tests). */
export async function processWebhookPayload(payload: unknown, now = new Date()): Promise<string[]> {
  const results: string[] = [];
  const body = payload as WaPayload;
  if (!body || body.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) return ["ignorado"];
  const ownPhoneId = waConfig().phoneNumberId;
  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      if (ownPhoneId && value.metadata?.phone_number_id && value.metadata.phone_number_id !== ownPhoneId) {
        results.push("otro_numero");
        continue;
      }
      if (change.field === "messages") {
        for (const status of value.statuses ?? []) if (status.id && status.status) updateMessageStatus(status.id, status.status);
        for (const msg of value.messages ?? []) {
          const key = msg.from || msg.from_user_id || "?";
          try {
            results.push(await serial(key, () => handleInbound(value, msg, now)));
          } catch (error) {
            console.error("[carga360go] WhatsApp inbound", error);
            results.push("error");
          }
        }
      } else if (change.field === "smb_message_echoes") {
        for (const echo of value.message_echoes ?? []) {
          try {
            results.push(handleEcho(value, echo, now));
          } catch (error) {
            console.error("[carga360go] WhatsApp echo", error);
            results.push("error");
          }
        }
      } else {
        results.push(`campo:${change.field}`);
      }
    }
  }
  return results;
}
