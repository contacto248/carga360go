import { createHash, randomUUID } from "crypto";
import { decideTextReply } from "../assistant/reply";
import { BRAND } from "../catalog";
import { appUrl } from "../mail";
import { sendEmail } from "../notify";
import { waConfig } from "../whatsapp/config";
import { CHAT_RATE } from "./config";
import {
  botRepliesSinceWeb,
  getWebConversation,
  insertWebMessage,
  listWebMessages,
  markWebHandoff,
  upsertWebConversation,
  type WebChatConversation,
  type WebChatMessage,
} from "./store";

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export type PublicChatMessage = { id: string; role: "user" | "assistant"; text: string; at: string };

export function toPublicMessage(msg: WebChatMessage): PublicChatMessage {
  return { id: msg.id, role: msg.direction === "in" ? "user" : "assistant", text: msg.body, at: msg.createdAt };
}

export const CHAT_CONTACTS = {
  whatsapp: BRAND.whatsappDisplay,
  whatsappUrl: `https://wa.me/${BRAND.whatsapp}`,
  email: BRAND.email,
};

export type ChatResult = {
  conversationId: string;
  reply: string;
  handoff: boolean;
  engine: string;
  messages: PublicChatMessage[];
  contacts?: typeof CHAT_CONTACTS;
};

async function notifyHandoff(conv: WebChatConversation, reason: string) {
  const cfg = waConfig();
  const lines = listWebMessages(conv.id, 10).map((m) => `${m.createdAt.slice(0, 16).replace("T", " ")} ${m.source}: ${m.body}`);
  const text = [
    `Un chat de la web de ${BRAND.name} necesita a una persona.`,
    "",
    `Conversación: ${conv.id}`,
    `Motivo: ${reason}`,
    "",
    "Últimos mensajes (hora UTC):",
    ...lines,
    "",
    `Panel: ${appUrl()}/admin/chat?c=${conv.id}`,
  ].join("\n");
  await sendEmail(cfg.handoffEmail, `Chat web: una persona necesita atención`, text);
}

export function sessionOverLimit(conv: WebChatConversation, now = new Date()): boolean {
  const win = botRepliesSinceWeb(conv.id, new Date(now.getTime() - CHAT_RATE.windowMs).toISOString());
  const day = botRepliesSinceWeb(conv.id, new Date(now.getTime() - 24 * 3600_000).toISOString());
  return win >= CHAT_RATE.perSession || day >= CHAT_RATE.perSessionDay;
}

export async function handleWebChat(input: {
  sessionId: string;
  message: string;
  ip: string;
  userAgent: string | null;
  now?: Date;
  executive?: boolean;
}): Promise<ChatResult> {
  const now = input.now ?? new Date();
  const at = now.toISOString();
  const conv = upsertWebConversation({ sessionId: input.sessionId, ipHash: hashIp(input.ip), userAgent: (input.userAgent || "").slice(0, 180) || null }, at);
  insertWebMessage({ conversationId: conv.id, direction: "in", source: "cliente", body: input.message, at });
  const history = listWebMessages(conv.id, 12);
  const decision = await decideTextReply(input.message, history, "web", { executive: input.executive === true });
  insertWebMessage({ conversationId: conv.id, direction: "out", source: "bot", body: decision.text, engine: decision.engine, at: new Date().toISOString() });
  if (decision.handoff && !conv.handoffAt) {
    markWebHandoff(conv.id, now.toISOString());
    await notifyHandoff(getWebConversation(conv.id) ?? conv, decision.engine);
  }
  return {
    conversationId: conv.id,
    reply: decision.text,
    handoff: decision.handoff,
    engine: decision.engine,
    messages: listWebMessages(conv.id, 40).map(toPublicMessage),
    ...(decision.handoff ? { contacts: CHAT_CONTACTS } : {}),
  };
}

export function newSessionId(): string {
  return randomUUID();
}
