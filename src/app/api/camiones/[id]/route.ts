import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { assertMarketplaceAccess, redactTruck } from "@/lib/access";
import { getCurrentUser } from "@/lib/current-user";
import { AppError } from "@/lib/errors";
import { deleteTruck, getTruck, updateTruck } from "@/lib/listings";
import { truckFromPayload } from "@/lib/payload";

export const GET = guard(async (_request, ctx) => {
  const viewer = await getCurrentUser();
  assertMarketplaceAccess(viewer);
  const { id } = await ctx.params;
  const truck = getTruck(id);
  if (!truck) throw new AppError("Camión no encontrado.", 404);
  return NextResponse.json({ truck: redactTruck(truck, viewer) });
});

export const PATCH = guard(async (request, ctx) => {
  const user = await requireUser();
  assertMarketplaceAccess(user);
  const { id } = await ctx.params;
  const truck = updateTruck(user, id, truckFromPayload(await readJson(request)));
  return NextResponse.json({ truck });
});

export const DELETE = guard(async (_request, ctx) => {
  const user = await requireUser();
  assertMarketplaceAccess(user);
  const { id } = await ctx.params;
  deleteTruck(user, id);
  audit(user, "camion.borrado", { type: "camion", id });
  return NextResponse.json({ ok: true });
});
