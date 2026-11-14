import { after } from "next/server";
import { processWebhookPayload } from "@/lib/whatsapp/bot";
import { checkPost, verifyChallenge } from "@/lib/whatsapp/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY = 1024 * 1024;

export async function GET(request: Request) {
  const { status, body } = verifyChallenge(new URL(request.url).searchParams);
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response("Demasiado grande", { status: 413 });
  const check = checkPost(raw, request.headers);
  if (check.note === "sin_secreto") console.warn("[carga360go] Webhook WhatsApp recibido sin WA_APP_SECRET: ignorado");
  if (check.process) {
    // Responder 200 de inmediato y procesar después (Meta reintenta si tardamos).
    after(async () => {
      try {
        await processWebhookPayload(check.payload);
      } catch (error) {
        console.error("[carga360go] Webhook WhatsApp", error);
      }
    });
  }
  return new Response(check.status === 200 ? "EVENT_RECEIVED" : check.note, { status: check.status, headers: { "Cache-Control": "no-store" } });
}
