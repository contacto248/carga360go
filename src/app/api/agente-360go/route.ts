import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { agentEnabled } from "@/lib/agent/config";
import { handleAgentTurn } from "@/lib/agent/engine";
import { detectAgentIntent } from "@/lib/agent/intents";
import { AGENTE_MAX_CHARS, AGENTE_MAX_TURNS, AI_CARGA360_RATE, XAI_MODEL, xaiConfigured } from "@/lib/agente360/config";
import { consultarGrok, type Turno } from "@/lib/agente360/grok";
import { contextoOperacion } from "@/lib/agente360/contexto";
import { canalWhatsapp } from "@/lib/agente360/meta";
import { AVISO_SIN_CLAVE, presentarRespuesta, secretosDeEntorno } from "@/lib/agente360/respuesta";
import { finishAiCall, reserveAiCall } from "@/lib/assistant/usage";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, userFromHeaders } from "@/lib/request-auth";
import { detectIntent } from "@/lib/whatsapp/intents";

export const dynamic = "force-dynamic";

function acotar(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, AGENTE_MAX_CHARS);
}

function turnos(value: unknown): Turno[] {
  if (!Array.isArray(value)) return [];
  const out: Turno[] = [];
  for (const item of value.slice(-AGENTE_MAX_TURNS)) {
    if (!item || typeof item !== "object") continue;
    const role = "role" in item ? item.role : null;
    const text = "text" in item ? item.text : null;
    if ((role !== "user" && role !== "assistant") || typeof text !== "string") continue;
    const content = acotar(text);
    if (!content) continue;
    out.push({ role, content });
  }
  return out;
}

export const POST = guard(async (request) => {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);

  const body = await readJson(request);
  if (typeof body.message !== "string") throw new AppError("Escriba la consulta.");
  const message = acotar(body.message);
  if (!message) throw new AppError("Escriba la consulta.");
  rateLimit(`ai-carga360:${user.id}`, AI_CARGA360_RATE.limit, AI_CARGA360_RATE.windowMs);
  const history = turnos(body.history);

  // El asistente comercial (cotizar, registro, seguimiento, soporte) vive en este mismo agente.
  // El texto libre sigue por xAI, con cupo, historial y tope de tokens.
  const guided = body.modo === "comercial" && (detectAgentIntent(message) !== "otro" || detectIntent(message) === "saludo");
  if (guided) {
    if (!agentEnabled()) {
      return NextResponse.json({
        reply: "El asistente comercial está en pausa. Puede seguir con cargas, camiones, retornos y la torre de control.",
      });
    }
    try {
      const reply = await handleAgentTurn({
        channel: "web",
        sessionKey: `ai:${user.id}`,
        text: message,
        via: "texto",
        user,
        ip: clientIp(request.headers),
      });
      return NextResponse.json({ reply: presentarRespuesta(reply.text, secretosDeEntorno()) });
    } catch (error) {
      console.error("[carga360go] AI.CARGA360 comercial", error instanceof Error ? error.message : "error");
      return NextResponse.json({
        reply: "No pude completar la consulta. Puede reenviarla o seguir con cargas, camiones y la torre de control.",
      });
    }
  }

  if (!xaiConfigured()) return NextResponse.json({ reply: AVISO_SIN_CLAVE });

  const reserved = reserveAiCall();
  if ("reason" in reserved) {
    if (reserved.reason === "limite") throw new AppError("Se agotó el cupo de consultas de hoy. Inténtelo mañana.", 429);
    throw new AppError("El agente no está disponible en este momento.", 503);
  }

  const canal = canalWhatsapp();
  let operacion = "Sin lectura de publicaciones en este momento.";
  try {
    operacion = contextoOperacion();
  } catch (error) {
    console.error("[carga360go] agente 360go", error instanceof Error ? error.message : "error");
  }

  try {
    const result = await consultarGrok(message, history, { operacion, enlaceWhatsapp: canal.enlace });
    finishAiCall(reserved.id, {
      status: result.failed ? "error" : "ok",
      fallbackReason: result.failed ? "fallo" : null,
      provider: "xai",
      model: XAI_MODEL,
    });
    return NextResponse.json({ reply: presentarRespuesta(result.reply, secretosDeEntorno()) });
  } catch (error) {
    finishAiCall(reserved.id, { status: "error", fallbackReason: "excepcion", provider: "xai", model: XAI_MODEL });
    throw error;
  }
});
