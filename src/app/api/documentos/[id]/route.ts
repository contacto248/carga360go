import { NextResponse } from "next/server";
import { guard, requireUser } from "@/lib/api";
import { removeDocument } from "@/lib/documents";

export const DELETE = guard(async (_request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  removeDocument(user, id);
  return NextResponse.json({ ok: true });
});
