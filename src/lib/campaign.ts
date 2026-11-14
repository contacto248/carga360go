import { formatDateCL, todayChile } from "./format";

/**
 * Campaña de inscripción: cada cuenta (mandante o transportista) tiene FREE_DAYS días corridos gratis desde su inscripción
 * (columna users.free_until). Después se cobrará una membresía cuyo valor aún no está definido. No existe sistema de pago:
 * nada se cobra automáticamente y se avisará con anticipación antes de cualquier cobro.
 */
export const FREE_DAYS = 30;

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Último día gratis de una cuenta inscrita en `createdAtIso` (fecha de Chile + 30 días). */
export function freeUntilFrom(createdAtIso: string): string {
  return addDaysIso(todayChile(new Date(createdAtIso)), FREE_DAYS);
}

export type FreePeriod = { freeUntil: string; label: string; active: boolean; daysLeft: number };

export function freePeriodOf(freeUntil: string | null | undefined, today = todayChile()): FreePeriod | null {
  if (!freeUntil) return null;
  const daysLeft = Math.round((Date.parse(`${freeUntil}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  return { freeUntil, label: formatDateCL(freeUntil), active: today <= freeUntil, daysLeft: Math.max(0, daysLeft) };
}

/** Texto común de la campaña (sitio, políticas y términos). */
export const CAMPAIGN_TEXT =
  "Carga360go está en campaña de inscripción de mandantes, empresas con carga y transportistas. Cada cuenta tiene 30 días gratis desde su inscripción; luego se cobrará una membresía (valores por definir) con beneficios en la plataforma y convenios.";
export const CAMPAIGN_PROMISE =
  "Te avisaremos con anticipación antes de cualquier cobro y no se cobrará nada automáticamente sin tu aceptación.";
