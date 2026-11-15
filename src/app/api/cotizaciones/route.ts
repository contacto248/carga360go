import { NextResponse } from "next/server";
import { guard, readJson } from "@/lib/api";
import { isEquipmentId, isKnownCity } from "@/lib/catalog";
import { publicView, quote } from "@/lib/costos/engine";
import { saveQuote } from "@/lib/costos/quotes";
import { isVehicleClassId } from "@/lib/costos/vehicles";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, userFromHeaders } from "@/lib/request-auth";
import { getSettings } from "@/lib/settings";

/**
 * Solicitud pública de cotización desde el cotizador: se guarda como "borrador" para que un administrador la revise.
 * No se promete precio: la respuesta es el costo referencial (o solo la confirmación, según la opción de administración).
 */
export const POST = guard(async (request) => {
  const ip = clientIp(request.headers);
  rateLimit(`cotizacion-publica:${ip}`, 10, 60 * 60 * 1000);
  const body = await readJson(request);
  const origin = String(body.origen ?? "");
  const destination = String(body.destino ?? "");
  const equipment = String(body.equipo ?? "");
  if (!isKnownCity(origin) || !isKnownCity(destination) || origin === destination) throw new AppError("Elige un origen y un destino distintos de la lista.");
  if (!isEquipmentId(equipment)) throw new AppError("Elige un tipo de equipo.");
  const vehicle = isVehicleClassId(body.vehiculo) ? body.vehiculo : undefined;
  const weight = body.pesoT === undefined || body.pesoT === "" || body.pesoT === null ? null : Number(body.pesoT);
  if (weight !== null && (!Number.isFinite(weight) || weight <= 0 || weight > 200)) throw new AppError("Peso no válido (t).");
  const contact = typeof body.contacto === "string" ? body.contacto.trim().slice(0, 200) : "";
  const input = { origin, destination, equipment, vehicle, weightT: weight };
  const result = await quote(input);
  const user = userFromHeaders(request.headers);
  const id = saveQuote(input, result, "web_cotizador", user?.id ?? null, contact || null);
  const show = getSettings().showSuggestedPrice;
  return NextResponse.json({ id, estado: "borrador", costo: publicView(result, show) }, { status: 201 });
});
