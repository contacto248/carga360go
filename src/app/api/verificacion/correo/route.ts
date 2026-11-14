import { NextResponse } from "next/server";
import { guard, requireUser } from "@/lib/api";
import { startEmailVerification } from "@/lib/verification";

export const POST = guard(async () => {
  const user = await requireUser();
  const delivery = await startEmailVerification(user);
  return NextResponse.json({ sent: delivery === "smtp", delivery });
});
