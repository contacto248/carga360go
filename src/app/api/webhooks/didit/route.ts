import { NextResponse } from "next/server";
import { kycEnabled } from "@/lib/kyc/config";
import { verifyDiditSignature } from "@/lib/kyc/didit";
import { handleDiditWebhook, type WebhookPayload } from "@/lib/kyc/service";

export const dynamic = "force-dynamic";

const MAX_BODY = 1024 * 1024;

/**
 * Webhook de Didit (destino v3, evento status.updated y data.updated).
 * 1) lee el cuerpo crudo, 2) verifica X-Signature-V2 / X-Signature (HMAC-SHA256 con DIDIT_WEBHOOK_SECRET)
 * y que X-Timestamp tenga menos de 5 minutos, 3) aplica el estado de forma idempotente (event_id).
 * Responde 2xx rápido. Con el flag apagado responde 404 (Didit reintenta, nada cambia).
 */
export async function POST(request: Request) {
  if (!kycEnabled()) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Cuerpo demasiado grande." }, { status: 413 });
  const check = verifyDiditSignature(raw, request.headers);
  if (!check.ok) {
    console.error(`[carga360go] Webhook Didit rechazado: ${check.reason}`);
    return NextResponse.json({ error: "Firma no válida." }, { status: 401 });
  }
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "JSON no válido." }, { status: 400 });
  }
  try {
    const outcome = handleDiditWebhook(payload, { testDelivery: request.headers.get("x-didit-test-webhook") === "true" });
    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    console.error("[carga360go] Error procesando webhook Didit", error);
    // 500 hace que Didit reintente (1 y 5 minutos después).
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}
