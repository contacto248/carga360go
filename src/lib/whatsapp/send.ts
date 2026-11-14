/**
 * Envío de WhatsApp saliente (texto de sesión o plantilla).
 * Reutiliza la Cloud API / 360dialog ya configurada en config.ts.
 * Inyectable en pruebas con setWhatsappOutboundSender.
 */
import { buildMessageRequest, canSend } from "./config";

export type WhatsappOutboundKind = "text" | "template";

export type WhatsappOutboundPayload =
  | { kind: "text"; to: string; text: string }
  | {
      kind: "template";
      to: string;
      name: string;
      language: string;
      bodyParams: string[];
    };

export type WhatsappOutboundResult = { ok: boolean; wamid: string | null; error?: string };

function graphError(status: number, data: { error?: { message?: string; code?: number; error_subcode?: number } }): string {
  const err = data.error;
  return `${status} ${err?.code ?? ""} ${err?.error_subcode ?? ""} ${err?.message ?? ""}`.trim().slice(0, 300);
}

const defaultSender = async (payload: WhatsappOutboundPayload): Promise<WhatsappOutboundResult> => {
  if (!canSend()) return { ok: false, wamid: null, error: "canal_no_configurado" };
  const body: Record<string, unknown> =
    payload.kind === "text"
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: payload.to,
          type: "text",
          text: { body: payload.text, preview_url: true },
        }
      : {
          messaging_product: "whatsapp",
          to: payload.to,
          type: "template",
          template: {
            name: payload.name,
            language: { code: payload.language },
            components: payload.bodyParams.length
              ? [
                  {
                    type: "body",
                    parameters: payload.bodyParams.map((text) => ({ type: "text", text })),
                  },
                ]
              : [],
          },
        };
  const req = buildMessageRequest(body);
  try {
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(15000),
    });
    const data = (await response.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    if (!response.ok) {
      const error = graphError(response.status, data);
      console.error(`[carga360go] WhatsApp envío falló: ${error}`);
      return { ok: false, wamid: null, error };
    }
    return { ok: true, wamid: data.messages?.[0]?.id || null };
  } catch (error) {
    console.error("[carga360go] WhatsApp envío error", error);
    return { ok: false, wamid: null, error: String(error).slice(0, 300) };
  }
};

let sender: (payload: WhatsappOutboundPayload) => Promise<WhatsappOutboundResult> = defaultSender;

export function setWhatsappOutboundSender(next: typeof sender | null) {
  sender = next || defaultSender;
}

export async function sendWhatsappOutbound(payload: WhatsappOutboundPayload): Promise<WhatsappOutboundResult> {
  if (!canSend()) return { ok: false, wamid: null, error: "canal_no_configurado" };
  try {
    return await sender(payload);
  } catch (error) {
    console.error("[carga360go] WhatsApp envío error", error);
    return { ok: false, wamid: null, error: String(error).slice(0, 300) };
  }
}
