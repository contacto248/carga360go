import { NextResponse } from "next/server";
import { guard, requireUser } from "@/lib/api";
import { whatsappOtpInboundEnabled } from "@/lib/notify";
import { lastCodeInfo, startPhoneVerification } from "@/lib/verification";

export const GET = guard(async () => {
  const user = await requireUser();
  const pending = lastCodeInfo(user.id, "phone");
  const active = Boolean(pending && pending.expiresAt > new Date().toISOString() && !user.phoneVerifiedAt);
  return NextResponse.json({
    verified: Boolean(user.phoneVerifiedAt),
    pending: active,
    delivery: active ? pending?.delivery : null,
    expiresAt: active ? pending?.expiresAt : null,
    inbound: whatsappOtpInboundEnabled(),
  });
});

export const POST = guard(async () => {
  const user = await requireUser();
  const result = await startPhoneVerification(user);
  const sent = result.delivery === "whatsapp" || result.delivery === "whatsapp_inbound" || result.delivery === "sms";
  return NextResponse.json({
    sent,
    delivery: result.delivery,
    waLink: result.waLink,
    prefilledText: result.prefilledText,
    expiresAt: result.expiresAt,
    businessPhone: result.businessPhone,
  });
});
