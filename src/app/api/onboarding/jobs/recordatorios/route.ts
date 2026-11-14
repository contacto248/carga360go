import { NextResponse } from "next/server";
import { onboardingCronAuthorized } from "@/lib/onboarding/cron";
import { sendOnboardingReminders } from "@/lib/onboarding/reminders";

/** Job interno (cron): recordatorios de registro incompleto. Bearer ONBOARDING_CRON_SECRET. */
export async function POST(request: Request) {
  if (!onboardingCronAuthorized(request.headers)) {
    return NextResponse.json({ error: "no_autorizado" }, { status: 401 });
  }
  const result = await sendOnboardingReminders();
  return NextResponse.json(result);
}
