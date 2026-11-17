import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { isEquipmentId, isKnownCity } from "@/lib/catalog";
import { freightQuoteSource, readFreightConfig } from "@/lib/freight-cost";
import { roadKm } from "@/lib/geo";
import { allListings } from "@/lib/listings";
import { matchLoadToTruck } from "@/lib/match";
import { estimateByKm } from "@/lib/pricing";
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
  const config = readFreightConfig();
  const km = roadKm(origin, destination, config.factorRuta);
  const estimate = km
    ? estimateByKm(km, equipment, {
        rates: config.tarifas,
        minLiviano: config.minimoLiviano,
        minPesado: config.minimoPesado,
        soloEstasTarifas: true,
      })
    : null;
  return NextResponse.json({ km, estimate, compatibles, fuente: freightQuoteSource(config, equipment) });
});
