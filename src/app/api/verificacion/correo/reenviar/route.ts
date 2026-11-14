import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-auth";
import { resendEmailVerification } from "@/lib/verification";

/** Reenvío sin sesión: responde igual exista o no la cuenta, para no revelar correos registrados. */
export const POST = guard(async (request) => {
  rateLimit(`resend:${clientIp(request.headers)}`, 5, 60 * 60 * 1000);
  const body = await readJson(request);
  await resendEmailVerification(String(body.email ?? ""));
  return NextResponse.json({ ok: true });
});
