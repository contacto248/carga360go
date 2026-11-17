import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { consultarGrok, type Turno } from "@/lib/agente360/grok";
import { contextoOperacion } from "@/lib/agente360/contexto";
import { canalWhatsapp } from "@/lib/agente360/meta";
import { presentarRespuesta, secretosDeEntorno } from "@/lib/agente360/respuesta";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

const MAX_MESSAGE = 2000;

function turnos(value: unknown): Turno[] {
  if (!Array.isArray(value)) return [];
  const out: Turno[] = [];
  for (const item of value.slice(-12)) {
    if (!item || typeof item !== "object") continue;
    const role = "role" in item ? item.role : null;
    const text = "text" in item ? item.text : null;
    if ((role !== "user" && role !== "assistant") || typeof text !== "string") continue;
    const content = text.replace(/\s+/g, " ").trim().slice(0, 1500);
    if (!content) continue;
    out.push({ role, content });
  }
  return out;
}

export const POST = guard(async (request) => {
  const ip = clientIp(request.headers);
  rateLimit(`agente360:ip:${ip}`, 30, 10 * 60 * 1000);
  const body = await readJson(request);
  if (typeof body.message !== "string") throw new AppError("Escriba la consulta.");
  const message = body.message.replace(/\s+/g, " ").trim();
  if (!message) throw new AppError("Escriba la consulta.");
  if (message.length > MAX_MESSAGE) throw new AppError(`El mensaje no puede superar los ${MAX_MESSAGE} caracteres.`);

  const canal = canalWhatsapp();
  let operacion = "Sin lectura de publicaciones en este momento.";
  try {
    operacion = contextoOperacion();
  } catch (error) {
    console.error("[carga360go] agente 360go", error instanceof Error ? error.message : "error");
  }
  const reply = presentarRespuesta(
    await consultarGrok(message, turnos(body.history), { operacion, enlaceWhatsapp: canal.enlace }),
    secretosDeEntorno(),
  );
  return NextResponse.json({ reply });
});
