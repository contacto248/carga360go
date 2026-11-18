/** Aviso por correo o webhook. Apagado salvo que la variable sea exactamente "true". WhatsApp no se usa aquí. */
export function automationsNotifyEnabled(): boolean {
  return process.env.AUTOMATIONS_NOTIFY_ENABLED === "true";
}

export function automationsWebhookUrl(): string | null {
  const value = process.env.AUTOMATIONS_WEBHOOK_URL?.trim();
  return value || null;
}

