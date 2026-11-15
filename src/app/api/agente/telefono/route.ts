import { NextResponse } from "next/server";
import { AGENT_GREETING, handleAgentTurn } from "@/lib/agent/engine";
import { twilio } from "@/lib/agent/voice";
import { toSpeech } from "@/lib/agent/validate";
import { appUrl } from "@/lib/mail";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Webhook de llamadas (Twilio Voice). NO CONECTADO por defecto: responde 503 si faltan
 * TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN o AGENT_PHONE_ENABLED=true. Con credenciales, exige la firma
 * X-Twilio-Signature y usa el mismo motor del agente (canal "telefono", sesión = CallSid).
 */
export async function POST(request: Request) {
  if (!twilio.connected()) {
    return NextResponse.json({ error: "Telefonía NO CONECTADA.", estado: twilio.status().state }, { status: 503 });
  }
  const url = `${appUrl()}/api/agente/telefono`;
  let params: Record<string, string> = {};
  try {
    const form = await request.formData();
    params = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (!twilio.verifyRequest(url, params, request.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ error: "Firma no válida." }, { status: 403 });
  }
  const callSid = (params.CallSid || "").slice(0, 64);
  if (!/^CA[0-9a-f]{32}$/i.test(callSid)) return NextResponse.json({ error: "Llamada no válida." }, { status: 400 });
  try {
    rateLimit(`agente:tel:${callSid}`, 40, 60 * 60 * 1000);
  } catch {
    const out = twilio.render("Hemos alcanzado el límite de esta llamada. Escríbanos por WhatsApp. Adiós.", { actionUrl: url, hangup: true });
    return new NextResponse(out.body, { headers: { "content-type": out.contentType } });
  }
  const speech = (params.SpeechResult || "").trim();
  const text = speech ? (await handleAgentTurn({ channel: "telefono", sessionKey: callSid, text: speech, via: "voz" })).speak : toSpeech(AGENT_GREETING);
  const out = twilio.render(text, { actionUrl: url });
  return new NextResponse(out.body, { headers: { "content-type": out.contentType } });
}
