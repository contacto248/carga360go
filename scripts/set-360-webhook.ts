/**
 * Configura el webhook de 360dialog (nivel número) para Carga360.
 * Lee las claves del entorno; nunca las deja en el código.
 *
 *   WA_360_API_KEY          obligatorio (header D360-API-KEY)
 *   WA_360_WEBHOOK_SECRET   obligatorio (se envía a 360dialog como X-Carga360-Secret)
 *   WA_360_WEBHOOK_URL      opcional, por defecto https://carga360go.cl/api/whatsapp/webhook
 *
 * Uso en el servidor, después de cargar el .env:
 *   npx tsx scripts/set-360-webhook.ts
 */
import {
  WA_360_DEFAULT_WEBHOOK_URL,
  WA_360_WEBHOOK_CONFIG_URL,
  WA_360_WEBHOOK_HEADER,
} from "../src/lib/whatsapp/config";

export function webhookConfigPayload(url: string, secret: string): { url: string; headers: Record<string, string> } {
  return { url, headers: { [WA_360_WEBHOOK_HEADER]: secret } };
}

async function main(): Promise<void> {
  const apiKey = process.env.WA_360_API_KEY || "";
  const secret = process.env.WA_360_WEBHOOK_SECRET || "";
  const url = process.env.WA_360_WEBHOOK_URL || WA_360_DEFAULT_WEBHOOK_URL;
  if (!apiKey) {
    console.error("Falta WA_360_API_KEY en el entorno. No se envía nada.");
    process.exit(1);
  }
  if (!secret) {
    console.error("Falta WA_360_WEBHOOK_SECRET en el entorno. No se envía nada.");
    process.exit(1);
  }
  const response = await fetch(WA_360_WEBHOOK_CONFIG_URL, {
    method: "POST",
    headers: { "D360-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(webhookConfigPayload(url, secret)),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`360dialog rechazó la configuración (${response.status}): ${text.slice(0, 500)}`);
    process.exit(1);
  }
  console.log(`Webhook configurado en ${url} (header ${WA_360_WEBHOOK_HEADER}).`);
  console.log(text);
}

const entry = process.argv[1] ? process.argv[1].replaceAll("\\", "/") : "";
if (entry && (import.meta.url === `file://${entry}` || import.meta.url.endsWith(entry))) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
