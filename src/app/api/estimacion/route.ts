import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { isEquipmentId, isKnownCity } from "@/lib/catalog";
import { publicView, quote } from "@/lib/costos/engine";
import { rutaCalculadoraDe } from "@/lib/costos/ruta-calculadora";
import { isVehicleClassId } from "@/lib/costos/vehicles";
import { allListings } from "@/lib/listings";
import { matchLoadToTruck } from "@/lib/match";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-auth";
import { getSettings } from "@/lib/settings";
import { todayChile } from "@/lib/format";

/**
 * Vista previa del cotizador y del asistente de publicación: costo de referencia desglosado del flete calculado por el motor de costos
 * (ruta real, peajes, diésel, conductor y desgaste), referencial y sujeto a revisión. El monto solo se incluye si el
 * administrador activó "Mostrar precio referencial" (ajuste show_suggested_price, apagado por defecto); si no, se
 * devuelven la distancia, los tiempos y el desglose sin montos. No guarda cotizaciones (eso es POST /api/cotizaciones).
 */
export const GET = guard(async (request) => {
  const url = new URL(request.url);
  const origin = url.searchParams.get("origen") || "";
  const destination = url.searchParams.get("destino") || "";
  const equipment = url.searchParams.get("equipo") || "";
  const vehicleParam = url.searchParams.get("vehiculo") || "";
  const weight = Number(url.searchParams.get("peso") || "0");
  const date = url.searchParams.get("fecha") || todayChile();
  if (!isKnownCity(origin) || !isKnownCity(destination) || !isEquipmentId(equipment) || origin === destination) {
    return NextResponse.json({ km: null, costo: null, compatibles: null });
  }
  rateLimit(`estimacion:${clientIp(request.headers)}`, 120, 10 * 60 * 1000);
  let compatibles: number | null = null;
  if (weight > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const load = { origin, destination, equipment, weightT: weight, pickupDate: date, specs: {} };
    compatibles = allListings().trucks.filter((truck) => !truck.isDemo && matchLoadToTruck(load, truck)).length;
  }
  const result = await quote({
    origin,
    destination,
    equipment,
    vehicle: isVehicleClassId(vehicleParam) ? vehicleParam : undefined,
    weightT: weight > 0 ? weight : null,
  });
  const costo = publicView(result, getSettings().showSuggestedPrice);
  const rutaCosto = rutaCalculadoraDe(result);
  return NextResponse.json({ km: costo.km, costo, rutaCosto, compatibles });
});
