import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { kycEnabled } from "@/lib/kyc/config";
import { kycOf, KYC_STATUS_LABELS, startIdentityVerification } from "@/lib/kyc/service";
import { rateLimit } from "@/lib/rate-limit";

/** Estado de la verificación de identidad de la cuenta con sesión. */
export const GET = guard(async () => {
  if (!kycEnabled()) throw new AppError("No encontrado.", 404);
  const user = await requireUser();
  const kyc = kycOf(user.id);
  return NextResponse.json({ status: kyc.status, label: KYC_STATUS_LABELS[kyc.status], attempts: kyc.attempts, decidedAt: kyc.decidedAt });
});

/**
 * Inicia (o retoma) la verificación: exige el consentimiento expreso, crea la sesión en Didit
 * y devuelve la URL del flujo alojado para redirigir a la persona. La URL no se guarda.
 */
export const POST = guard(async (request) => {
  if (!kycEnabled()) throw new AppError("No encontrado.", 404);
  const user = await requireUser();
  rateLimit(`kyc-start:${user.id}`, 5, 60 * 60 * 1000);
  const body = await readJson(request);
  const result = await startIdentityVerification(user, { consent: body.consent, consentVersion: body.consentVersion });
  return NextResponse.json({ url: result.url });
});
