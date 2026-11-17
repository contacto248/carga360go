import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { AGENTE_MAX_CHARS, AGENTE_MAX_TURNS, XAI_MODEL, xaiConfigured } from "@/lib/agente360/config";
import { consultarGrok, type Turno } from "@/lib/agente360/grok";
import { contextoOperacion } from "@/lib/agente360/contexto";
import { canalWhatsapp } from "@/lib/agente360/meta";
import { AVISO_SIN_CLAVE, presentarRespuesta, secretosDeEntorno } from "@/lib/agente360/respuesta";
import { finishAiCall, reserveAiCall } from "@/lib/assistant/usage";
import { AppError } from "@/lib/errors";
import { userFromHeaders } from "@/lib/request-auth";

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
  const history = turnos(body.history);

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
