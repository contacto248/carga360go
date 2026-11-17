import { formatDateCL, todayChile } from "./format";

/**
 * La columna users.free_until sigue guardando una fecha (inscripción + FREE_DAYS) por compatibilidad de la base.
 * El sitio público no muestra ni cobra un periodo gratis ni una membresía. No hay precios en estos textos.
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

/** Texto de uso de la cuenta en la política y en los términos. Sin precios. */
export const CAMPAIGN_TEXT =
  "Crear una cuenta y usar Carga360go no exige una membresía ni un periodo de prueba de pago. Publicar, ofertar y adjudicar no tienen un cobro de la plataforma.";
export const CAMPAIGN_PROMISE =
  "No se cobra una membresía ni se pide un medio de pago para usar la plataforma.";
