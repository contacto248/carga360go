import { timingSafeEqual } from "crypto";
import { cronSecret } from "./config";

/** Jobs internos: exigen Authorization: Bearer <PAYMENTS_CRON_SECRET>. Sin secreto configurado, nadie entra. */
export function cronAuthorized(headers: Headers): boolean {
  const secret = cronSecret();
  if (!secret || secret.length < 24) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(headers.get("authorization") ?? "");
  if (!match) return false;
  const a = Buffer.from(match[1]);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
