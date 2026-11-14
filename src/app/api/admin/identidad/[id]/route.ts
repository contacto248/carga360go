import { NextResponse } from "next/server";
import { guard, readJson, requireRoles } from "@/lib/api";
import { adminSetKyc } from "@/lib/kyc/service";

/** El administrador aprueba o rechaza a mano (casos "en revisión") o reinicia los intentos de una cuenta. */
export const PATCH = guard(async (request, ctx) => {
  const admin = await requireRoles(["admin"]);
  const { id } = await ctx.params;
  const body = await readJson(request);
  const record = adminSetKyc(admin, id, String(body.status ?? ""), body.note == null ? null : String(body.note));
  return NextResponse.json({ status: record.status });
});
