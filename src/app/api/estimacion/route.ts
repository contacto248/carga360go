import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { isEquipmentId, isKnownCity } from "@/lib/catalog";
import { roadKm } from "@/lib/geo";
import { allListings } from "@/lib/listings";
import { matchLoadToTruck } from "@/lib/match";
import { estimatePrice } from "@/lib/pricing";
import { todayChile } from "@/lib/format";

/** Vista previa para el asistente de publicación: km, precio referencial y cuántos camiones calzan hoy. */
export const GET = guard(async (request) => {
  const url = new URL(request.url);
  const origin = url.searchParams.get("origen") || "";
  const destination = url.searchParams.get("destino") || "";
  const equipment = url.searchParams.get("equipo") || "";
  const weight = Number(url.searchParams.get("peso") || "0");
  const date = url.searchParams.get("fecha") || todayChile();
  if (!isKnownCity(origin) || !isKnownCity(destination) || !isEquipmentId(equipment) || origin === destination) {
    return NextResponse.json({ km: null, estimate: null, compatibles: null });
  }
  let compatibles: number | null = null;
  if (weight > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const load = { origin, destination, equipment, weightT: weight, pickupDate: date, specs: {} };
    compatibles = allListings().trucks.filter((truck) => !truck.isDemo && matchLoadToTruck(load, truck)).length;
  }
  return NextResponse.json({ km: roadKm(origin, destination), estimate: estimatePrice(origin, destination, equipment), compatibles });
});
