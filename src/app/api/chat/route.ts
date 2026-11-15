import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { CHAT_CONTACTS, handleWebChat, newSessionId, sessionOverLimit, toPublicMessage } from "@/lib/chat/engine";
import { CHAT_COOKIE, CHAT_MAX_MESSAGE, CHAT_RATE, chatCookieOptions, webChatEnabled } from "@/lib/chat/config";
import { conversationForSession, listWebMessages } from "@/lib/chat/store";
import { AppError } from "@/lib/errors";
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
  });
  return withSession(response, sessionId, !existing);
});

export const POST = guard(async (request) => {
  if (!webChatEnabled()) throw new AppError("El chat no está disponible en este momento.", 503);
  const body = await readJson(request);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) throw new AppError("Escriba su consulta.");
  if (message.length > CHAT_MAX_MESSAGE) throw new AppError(`El mensaje no puede superar los ${CHAT_MAX_MESSAGE} caracteres.`);

  const ip = clientIp(request.headers);
  rateLimit(`webchat:ip:${ip}`, CHAT_RATE.perIp, CHAT_RATE.windowMs);

  const existing = sessionFrom(request);
  const sessionId = existing || newSessionId();
  rateLimit(`webchat:sid:${sessionId}`, CHAT_RATE.perSession, CHAT_RATE.windowMs);

  const conv = conversationForSession(sessionId);
  if (conv?.botDisabled) throw new AppError("Este chat está pausado. Escríbanos por WhatsApp o al correo de contacto.", 403);
  if (conv && sessionOverLimit(conv)) throw new AppError("Demasiados mensajes en este chat. Inténtelo más tarde o escríbanos por WhatsApp.", 429);

  const result = await handleWebChat({
    sessionId,
    message,
    ip,
    userAgent: request.headers.get("user-agent"),
    executive: body.executive === true,
  });
  const response = NextResponse.json({
    enabled: true,
    conversationId: result.conversationId,
    reply: result.reply,
    handoff: result.handoff,
    messages: result.messages,
    ...(result.contacts ? { contacts: result.contacts } : { contacts: CHAT_CONTACTS }),
  });
  return withSession(response, sessionId, !existing);
});
