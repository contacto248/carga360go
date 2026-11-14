import { timingSafeEqual } from "crypto";
import { onboardingCronSecret } from "./config";

/** Job interno: Authorization: Bearer <ONBOARDING_CRON_SECRET>. Sin secreto (o menor a 24 caracteres), nadie entra. */
export function onboardingCronAuthorized(headers: Headers): boolean {
  const secret = onboardingCronSecret();
  if (!secret || secret.length < 24) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(headers.get("authorization") ?? "");
  if (!match) return false;
  const a = Buffer.from(match[1]);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
