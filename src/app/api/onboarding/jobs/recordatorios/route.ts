import { NextResponse } from "next/server";
import { onboardingCronAuthorized } from "@/lib/onboarding/cron";
import { sendOnboardingReminders } from "@/lib/onboarding/reminders";
import { audit } from "@/lib/audit";
import { expireManualReadonly } from "@/lib/manual-readonly";

/** Job interno (cron): recordatorios de registro incompleto. Bearer ONBOARDING_CRON_SECRET. */
export async function POST(request: Request) {
  if (!onboardingCronAuthorized(request.headers)) {
    return NextResponse.json({ error: "no_autorizado" }, { status: 401 });
  }
  const result = await sendOnboardingReminders();
  // Limpieza de verificaciones manuales vencidas (el bloqueo ya rige por fecha; esto deja la auditoría y limpia columnas).
  const expired = expireManualReadonly();
  for (const id of expired) audit(null, "usuario.solo_lectura_vencida", { type: "usuario", id }, "30 días sin acreditación completa");
  return NextResponse.json({ ...result, readonlyExpired: expired.length });
}
