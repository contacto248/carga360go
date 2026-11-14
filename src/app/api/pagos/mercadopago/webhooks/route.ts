import { handleMpWebhook } from "@/lib/pagos/webhook-handler";

export const dynamic = "force-dynamic";

/** Notificaciones de Mercado Pago. Sin sesión: se valida la firma x-signature. */
export async function POST(request: Request) {
  return handleMpWebhook(request);
}
