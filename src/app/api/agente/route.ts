import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { aiReady } from "@/lib/assistant/config";
import { AGENT_COOKIE, AGENT_MAX_MESSAGE, AGENT_RATE, agentCookieOptions, agentEnabled } from "@/lib/agent/config";
import { AGENT_GREETING, DEFAULT_QUICK, handleAgentTurn, resetAgentConversation } from "@/lib/agent/engine";
import { agentRepliesSince, findAgentConversation, listAgentMessages } from "@/lib/agent/store";
import { cleanText, toSpeech } from "@/lib/agent/validate";
import { voiceProvidersStatus } from "@/lib/agent/voice";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sessionFrom(request: Request): string | null {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== AGENT_COOKIE) continue;
    try {
      const value = decodeURIComponent(part.slice(index + 1).trim());
      return UUID.test(value) ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

function publicStatus() {
  const ai = aiReady();
  return {
    ai: ai ? "conectada" : "no_configurada",
    modeLabel: ai ? "IA conectada" : "Respuestas por reglas (IA sin configurar)",
    voice: voiceProvidersStatus().map((p) => ({ id: p.id, label: p.label, connected: p.connected, state: p.state })),
  };
}

function history(sessionId: string | null) {
  const conv = sessionId ? findAgentConversation("web", sessionId) : null;
  if (!conv) return [];
  return listAgentMessages(conv.id, 40).map((m) => ({ id: m.id, role: m.role === "cliente" ? "user" : "assistant", text: m.body, at: m.createdAt }));
}

export const GET = guard(async (request) => {
  if (!agentEnabled()) return NextResponse.json({ enabled: false });
  const existing = sessionFrom(request);
  const sessionId = existing || randomUUID();
  const response = NextResponse.json({
    enabled: true,
    greeting: AGENT_GREETING,
    greetingSpeak: toSpeech(AGENT_GREETING),
    quick: DEFAULT_QUICK,
    messages: history(existing),
    maxLength: AGENT_MAX_MESSAGE,
    status: publicStatus(),
  });
  if (!existing) response.cookies.set(AGENT_COOKIE, sessionId, agentCookieOptions());
  return response;
});

export const POST = guard(async (request) => {
  if (!agentEnabled()) throw new AppError("El asistente no está disponible en este momento.", 503);
  const ip = clientIp(request.headers);
  rateLimit(`agente:ip:${ip}`, AGENT_RATE.perIp, AGENT_RATE.windowMs);
  const body = await readJson(request);
  const existing = sessionFrom(request);
  const sessionId = existing || randomUUID();
  rateLimit(`agente:sid:${sessionId}`, AGENT_RATE.perSession, AGENT_RATE.windowMs);

  if (body.reset === true) {
    resetAgentConversation("web", sessionId);
    const response = NextResponse.json({ ok: true, greeting: AGENT_GREETING, quick: DEFAULT_QUICK });
    if (!existing) response.cookies.set(AGENT_COOKIE, sessionId, agentCookieOptions());
    return response;
  }

  if (typeof body.message !== "string") throw new AppError("Escriba o diga su consulta.");
  if (body.message.length > AGENT_MAX_MESSAGE) throw new AppError(`El mensaje no puede superar los ${AGENT_MAX_MESSAGE} caracteres.`);
  const message = cleanText(body.message, AGENT_MAX_MESSAGE);
  if (!message) throw new AppError("Escriba o diga su consulta.");
  const via = body.via === "voz" ? "voz" : body.via === undefined || body.via === "texto" ? "texto" : null;
  if (!via) throw new AppError("Canal de entrada no válido.");

  const conv = existing ? findAgentConversation("web", sessionId) : null;
  if (conv) {
    const now = Date.now();
    const inWindow = agentRepliesSince(conv.id, new Date(now - AGENT_RATE.windowMs).toISOString());
    const inDay = agentRepliesSince(conv.id, new Date(now - 24 * 3600_000).toISOString());
    if (inWindow >= AGENT_RATE.perSession || inDay >= AGENT_RATE.perSessionDay) {
      throw new AppError("Demasiados mensajes en esta conversación. Inténtelo más tarde o escríbanos por WhatsApp.", 429);
    }
  }

  const user = userFromHeaders(request.headers);
  const reply = await handleAgentTurn({ channel: "web", sessionKey: sessionId, text: message, via, user, ip, executive: body.executive === true });
  const response = NextResponse.json({
    enabled: true,
    reply: reply.text,
    speak: reply.speak,
    intent: reply.intent,
    mode: reply.mode,
    step: reply.step,
    handoff: reply.handoff,
    leadCode: reply.leadCode,
    quick: reply.quick,
    messages: history(sessionId),
  });
  if (!existing) response.cookies.set(AGENT_COOKIE, sessionId, agentCookieOptions());
  return response;
});
