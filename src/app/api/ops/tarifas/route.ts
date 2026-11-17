import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { procurementGuard } from "@/lib/ops/http";
import { createRateCard, listRateCards, resolveRate } from "@/lib/ops/procurement";
import { clientIp, userFromHeaders } from "@/lib/request-auth";

export const dynamic = "force-dynamic";

function actor(request: Request) {
  const user = userFromHeaders(request.headers);
  if (!user) throw new AppError("Debes iniciar sesión.", 401);
  return user;
}

export const GET = procurementGuard(async (request) => {
  const url = new URL(request.url);
  const shipperOrgId = url.searchParams.get("shipperOrgId") || url.searchParams.get("orgId") || "";
  const origin = url.searchParams.get("origin");
  const destination = url.searchParams.get("destination");
  const equipment = url.searchParams.get("equipment");
  const date = url.searchParams.get("date");
  if (origin && destination && equipment && date && shipperOrgId) {
    const rate = resolveRate(actor(request), {
      shipperOrgId,
      carrierOrgId: url.searchParams.get("carrierOrgId"),
      origin,
      destination,
      equipment,
      date,
    });
    return NextResponse.json({ rate });
  }
  if (!shipperOrgId) throw new AppError("Falta la organización.");
  return NextResponse.json({ rateCards: listRateCards(actor(request), shipperOrgId) });
});

export const POST = procurementGuard(async (request) => {
  const rateCard = createRateCard(actor(request), await readJson(request), clientIp(request.headers));
  return NextResponse.json({ rateCard }, { status: 201 });
});
