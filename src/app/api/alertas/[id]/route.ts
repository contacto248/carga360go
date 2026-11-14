import { NextResponse } from "next/server";
import { deleteSavedSearch } from "@/lib/alerts";
import { guard, requireUser } from "@/lib/api";

export const DELETE = guard(async (_request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  deleteSavedSearch(user, id);
  return NextResponse.json({ ok: true });
});
