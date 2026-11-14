import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { engineCaller } from "@/lib/costos/api-auth";
import { publicView, quote } from "@/lib/costos/engine";
import { quoteInputFrom } from "@/lib/costos/input";
import { saveQuote, type QuoteChannel } from "@/lib/costos/quotes";
import { rateLimit } from "@/lib/rate-limit";

/**
 * API del motor de costos para el agente de voz, CARGA360 Match y administración.
 * Auth: sesión de administrador, o X-Costos-Key (COSTOS_API_KEYS). Límite: 30 solicitudes cada 10 min por llamador.
 * Cada respuesta se guarda como cotización en estado "borrador" (requiere revisión de un administrador).
 * Servicios reciben el costo real desglosado (sin margen interno); administradores, el resultado completo.
 */
export const POST = guard(async (request) => {
  const caller = engineCaller(request.headers);
  rateLimit(`costos:${caller.kind === "admin" ? caller.user.id : `svc:${caller.service}`}:${caller.ip}`, 30, 10 * 60 * 1000);
  const body = await readJson(request);
  const input = quoteInputFrom(body);
  const result = await quote(input);
  const channel: QuoteChannel =
    caller.kind === "admin" ? "admin" : caller.service === "agente_voz" ? "api_agente_voz" : caller.service === "match" ? "api_match" : "api";
  const id = saveQuote(input, result, channel, caller.kind === "admin" ? caller.user.id : `servicio:${caller.service}`);
  return NextResponse.json({
    id,
    estado: "borrador",
    aviso: result.notice,
    cotizacion: caller.kind === "admin" ? result : publicView(result, true),
  });
});
