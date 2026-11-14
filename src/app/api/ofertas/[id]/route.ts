import { NextResponse } from "next/server";
import { guard, readJson, requireUser } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { acceptOffer, withdrawOffer } from "@/lib/offers";
import { rateLimit } from "@/lib/rate-limit";

/** { action: "aceptar" } lo usa el mandante; { action: "retirar" } el transportista. */
export const PATCH = guard(async (request, ctx) => {
  const user = await requireUser();
  rateLimit(`offer-action:${user.id}`, 30, 60 * 60 * 1000);
  const { id } = await ctx.params;
  const body = await readJson(request);
  if (body.action === "aceptar") return NextResponse.json({ offer: await acceptOffer(user, id) });
  if (body.action === "retirar") return NextResponse.json({ offer: withdrawOffer(user, id) });
  throw new AppError("Acción no válida.");
});
