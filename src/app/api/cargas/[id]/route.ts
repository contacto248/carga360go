import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { assertMarketplaceAccess, redactLoad } from "@/lib/access";
import { getCurrentUser } from "@/lib/current-user";
import { AppError } from "@/lib/errors";
import { deleteLoad, getLoad, updateLoad } from "@/lib/listings";
import { loadFromPayload } from "@/lib/payload";

export const GET = guard(async (_request, ctx) => {
  const viewer = await getCurrentUser();
  assertMarketplaceAccess(viewer);
  const { id } = await ctx.params;
  const load = getLoad(id);
  if (!load) throw new AppError("Carga no encontrada.", 404);
  return NextResponse.json({ load: redactLoad(load, viewer) });
});

export const PATCH = guard(async (request, ctx) => {
  const user = await requireUser();
  assertMarketplaceAccess(user);
  const { id } = await ctx.params;
  const load = updateLoad(user, id, loadFromPayload(await readJson(request)));
  return NextResponse.json({ load });
});

export const DELETE = guard(async (_request, ctx) => {
  const user = await requireUser();
  assertMarketplaceAccess(user);
  const { id } = await ctx.params;
  deleteLoad(user, id);
  audit(user, "carga.borrada", { type: "carga", id });
  return NextResponse.json({ ok: true });
});
