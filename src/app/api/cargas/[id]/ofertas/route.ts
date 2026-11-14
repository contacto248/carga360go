import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { assertMarketplaceAccess } from "@/lib/access";
import { getCurrentUser } from "@/lib/current-user";
import { offersVisibleTo, submitOffer } from "@/lib/offers";
import { rateLimit } from "@/lib/rate-limit";

/** Dueño y admin: todas las ofertas. Transportista: solo la suya. */
export const GET = guard(async (_request, ctx) => {
  const viewer = await getCurrentUser();
  assertMarketplaceAccess(viewer);
  const { id } = await ctx.params;
  return NextResponse.json({ offers: offersVisibleTo(id, viewer) });
});

/** Crear o mejorar la oferta del transportista. */
export const POST = guard(async (request, ctx) => {
  const user = await requireUser();
  rateLimit(`offer:${user.id}`, 20, 60 * 60 * 1000);
  const { id } = await ctx.params;
  const body = await readJson(request);
  const { offer, improved } = await submitOffer(user, id, {
    priceClp: body.priceClp,
    pickupDate: body.pickupDate,
    truckId: body.truckId,
    note: body.note,
  });
  return NextResponse.json({ offer, improved }, { status: improved ? 200 : 201 });
});
