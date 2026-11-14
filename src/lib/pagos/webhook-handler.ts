import { NextResponse } from "next/server";
import { mpCredentials, paymentsEnabled } from "./config";
import { processEvent, recordEvent } from "./service";
import { parseNotification, sanitizePayload, verifyMpSignature } from "./webhook";

/**
 * POST /api/pagos/mercadopago/webhooks (spec §5.4).
 * 1) flag apagado: 200 sin tocar la base (MP no reintenta y producción no cambia).
 * 2) firma inválida o sin secreto: 401, se registra el intento sin procesar.
 * 3) firma válida: se registra, se deduplica, 200 inmediato; el GET del pago y el cambio
 *    de estado corren después (no dentro del plazo de 22 s).
 */
export async function handleMpWebhook(request: Request, opts: { awaitProcessing?: boolean; nowMs?: number } = {}): Promise<Response> {
  if (!paymentsEnabled()) return NextResponse.json({ ok: true, ignored: "pagos_deshabilitados" });
  const raw = await request.text();
  if (raw.length > 64 * 1024) return NextResponse.json({ error: "cuerpo_grande" }, { status: 413 });
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "json_invalido" }, { status: 400 });
    }
  }
  const query = new URL(request.url).searchParams;
  // IPN antigua (?topic=…&id=…, sin x-signature): no se puede verificar, así que no se procesa ni se registra
  // como "firma inválida". Se responde 200 para que MP no reintente; el estado llega por el Webhook firmado.
  if (!request.headers.get("x-signature") && query.get("topic") && query.get("id") && !query.get("data.id")) {
    return NextResponse.json({ ok: true, ignored: "ipn_sin_firma" });
  }
  const note = parseNotification(body, query);
  const check = verifyMpSignature({
    secret: mpCredentials().webhookSecret,
    signatureHeader: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    // La plantilla usa data.id de la URL (query), tal como lo envía MP.
    dataId: query.get("data.id") ?? note.resourceId,
    nowMs: opts.nowMs,
  });
  const recorded = recordEvent(note, check.valid, sanitizePayload(body));
  if (!check.valid) return NextResponse.json({ error: "firma_invalida" }, { status: 401 });
  if (recorded.duplicate || !recorded.eventId) return NextResponse.json({ ok: true, duplicate: true });
  const work = processEvent(recorded.eventId, note);
  if (opts.awaitProcessing) await work;
  else void work;
  return NextResponse.json({ ok: true });
}
