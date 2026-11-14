import { NextResponse } from "next/server";
import { queueAlert } from "@/lib/alerts";
import { guard, readJson, requireUser } from "@/lib/api";
import { assertCanPublish, assertMarketplaceAccess, redactTruck } from "@/lib/access";
import { getCurrentUser } from "@/lib/current-user";
import { createTruck, listTrucks } from "@/lib/listings";
import { truckFromPayload } from "@/lib/payload";
import { rateLimit } from "@/lib/rate-limit";

export const GET = guard(async (request) => {
  const viewer = await getCurrentUser();
  assertMarketplaceAccess(viewer);
  const url = new URL(request.url);
  const trucks = listTrucks({
    equipo: url.searchParams.get("equipo") || "",
    regionOrigen: url.searchParams.get("regionOrigen") || "",
    regionDestino: url.searchParams.get("regionDestino") || "",
    origen: url.searchParams.get("origen") || "",
    destino: url.searchParams.get("destino") || "",
    dia: url.searchParams.get("dia") || "",
    capacidadMin: url.searchParams.get("capacidadMin") || "",
  });
  return NextResponse.json({ trucks: trucks.map((item) => redactTruck(item, viewer)) });
});

export const POST = guard(async (request) => {
  const user = await requireUser();
  assertCanPublish(user);
  rateLimit(`publish:${user.id}`, 30, 60 * 60 * 1000);
  const truck = createTruck(user, truckFromPayload(await readJson(request)));
  queueAlert("camion", truck.id);
  return NextResponse.json({ truck }, { status: 201 });
});
