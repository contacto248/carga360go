import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { CHAT_CONTACTS, handleWebChat, hashIp, newSessionId, sessionOverLimit, toPublicMessage } from "@/lib/chat/engine";
import { CHAT_COOKIE, CHAT_MAX_MESSAGE, CHAT_RATE, chatCookieOptions, webChatEnabled } from "@/lib/chat/config";
import { conversationForSession, listWebMessages, saveWebVisitor, upsertWebConversation } from "@/lib/chat/store";
import { AppError } from "@/lib/errors";
import { parseVisitorContact } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sessionFrom(request: Request): string | null {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== CHAT_COOKIE) continue;
    try {
      const value = decodeURIComponent(part.slice(index + 1).trim());
      return UUID.test(value) ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

function withSession(response: NextResponse, sessionId: string, setCookie: boolean) {
  if (setCookie) response.cookies.set(CHAT_COOKIE, sessionId, chatCookieOptions());
  return response;
}

function visitorOf(name: string | null | undefined, phone: string | null | undefined) {
  if (!name || !phone) return null;
  return { name, phone };
}

function contactFromBody(body: Record<string, unknown>) {
  const raw = body.contact;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  return parseVisitorContact(record.name, record.phone);
}

export const GET = guard(async (request) => {
  if (!webChatEnabled()) {
    return NextResponse.json({ enabled: false, contacts: CHAT_CONTACTS });
  }
  const existing = sessionFrom(request);
  const sessionId = existing || newSessionId();
  const conv = existing ? conversationForSession(sessionId) : null;
  const response = NextResponse.json({
    enabled: true,
    conversationId: conv?.id ?? null,
    messages: conv ? listWebMessages(conv.id, 40).map(toPublicMessage) : [],
    contacts: CHAT_CONTACTS,
    visitor: visitorOf(conv?.visitorName, conv?.visitorPhone),
  });
  return withSession(response, sessionId, !existing);
});

export const POST = guard(async (request) => {
  if (!webChatEnabled()) throw new AppError("El chat no está disponible en este momento.", 503);
  const body = await readJson(request);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length > CHAT_MAX_MESSAGE) throw new AppError(`El mensaje no puede superar los ${CHAT_MAX_MESSAGE} caracteres.`);
  const parsedContact = contactFromBody(body);
  if (parsedContact && !parsedContact.ok) throw new AppError(parsedContact.error, 400);

  const ip = clientIp(request.headers);
  rateLimit(`webchat:ip:${ip}`, CHAT_RATE.perIp, CHAT_RATE.windowMs);

  const existing = sessionFrom(request);
  const sessionId = existing || newSessionId();
  rateLimit(`webchat:sid:${sessionId}`, CHAT_RATE.perSession, CHAT_RATE.windowMs);

  let conv = conversationForSession(sessionId);
  const stored = visitorOf(conv?.visitorName, conv?.visitorPhone);
  const incoming = parsedContact && parsedContact.ok ? parsedContact : null;
  if (!stored && !incoming) {
    throw new AppError(message ? "Indique su nombre y un celular chileno (+56 9 XXXX XXXX) antes de escribir." : "Escriba su consulta.", 400);
  }
  if (!conv) {
    conv = upsertWebConversation(
      { sessionId, ipHash: hashIp(ip), userAgent: request.headers.get("user-agent") },
      new Date().toISOString(),
    );
  }
  if (!stored && incoming) saveWebVisitor(conv.id, incoming.name, incoming.phone);
  const visitor = stored ?? (incoming ? { name: incoming.name, phone: incoming.phone } : null);

  if (!message) {
    const response = NextResponse.json({
      enabled: true,
      conversationId: conv.id,
      messages: listWebMessages(conv.id, 40).map(toPublicMessage),
      contacts: CHAT_CONTACTS,
      visitor,
    });
    return withSession(response, sessionId, !existing);
  }

  if (conv.botDisabled) throw new AppError("Este chat está pausado. Escríbanos por WhatsApp o al correo de contacto.", 403);
  if (sessionOverLimit(conv)) throw new AppError("Demasiados mensajes en este chat. Inténtelo más tarde o escríbanos por WhatsApp.", 429);

  const result = await handleWebChat({
    sessionId,
    message,
    ip,
    userAgent: request.headers.get("user-agent"),
  });
  const response = NextResponse.json({
    enabled: true,
    conversationId: result.conversationId,
    reply: result.reply,
    handoff: result.handoff,
    messages: result.messages,
    visitor,
    ...(result.contacts ? { contacts: result.contacts } : { contacts: CHAT_CONTACTS }),
  });
  return withSession(response, sessionId, !existing);
});
