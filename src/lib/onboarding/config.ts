/**
 * Correos de onboarding (bienvenida con PDF + recordatorios) y, más adelante, WhatsApp.
 *
 * Variables (en el .env del servidor, nunca en el repo):
 *  - REGISTRATION_PDF_ENABLED          ya enciende la bienvenida con PDF al confirmar el correo
 *  - ONBOARDING_REMINDERS_ENABLED      "true" para el cron de recordatorios
 *  - ONBOARDING_REMINDERS_AFTER        ISO (p. ej. 2026-11-11T16:40:00.000Z). Solo cuentas creadas después.
 *                                      Si falta, no se envía ningún recordatorio (conservador).
 *  - ONBOARDING_CRON_SECRET            Bearer del job interno (mín. 24 caracteres)
 *  - DOCS_DEADLINE_DAYS                días corridos desde la inscripción para subir documentos.
 *                                      Sin valor: no se muestra fecha ni hay recordatorio pre-plazo.
 *  - WHATSAPP_ONBOARDING_ENABLED       "true" para enviar plantillas de WhatsApp (apagado por defecto).
 */

export function onboardingRemindersEnabled(): boolean {
  return process.env.ONBOARDING_REMINDERS_ENABLED === "true";
}

export function whatsappOnboardingEnabled(): boolean {
  return process.env.WHATSAPP_ONBOARDING_ENABLED === "true";
}

export function docsDeadlineDays(): number | null {
  const raw = (process.env.DOCS_DEADLINE_DAYS || "").trim();
  if (!raw) return null;
  const days = Number(raw);
  return Number.isInteger(days) && days > 0 ? days : null;
}

export function remindersAfterIso(): string | null {
  const raw = (process.env.ONBOARDING_REMINDERS_AFTER || "").trim();
  return raw || null;
}

export function onboardingCronSecret(): string {
  return (process.env.ONBOARDING_CRON_SECRET || "").trim();
}

export const ONBOARDING_STAGES = ["24h", "3d", "deadline_2d"] as const;
export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];
