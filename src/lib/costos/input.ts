import { AppError } from "../errors";
import type { QuoteInput } from "./engine";
import { isVehicleClassId } from "./vehicles";

function place(value: unknown, label: string): QuoteInput["origin"] {
  if (typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 200) return value.trim();
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const lat = Number(v.lat);
    const lon = Number(v.lon);
    // Caja aproximada de Chile continental e insular cercana.
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat <= -17 && lat >= -56.5 && lon <= -66 && lon >= -76) {
      return { lat, lon, label: typeof v.label === "string" ? v.label.slice(0, 200) : undefined };
    }
  }
  throw new AppError(`${label} no válido: usa un nombre de lugar en Chile o {lat, lon}.`);
}

/** Valida el cuerpo de una solicitud al motor (API del agente de voz, Match, cotizador). */
export function quoteInputFrom(body: Record<string, unknown>): QuoteInput {
  const origin = place(body.origen ?? body.origin, "Origen");
  const destination = place(body.destino ?? body.destination, "Destino");
  const vehicleRaw = body.vehiculo ?? body.vehicle;
  if (vehicleRaw !== undefined && vehicleRaw !== null && vehicleRaw !== "" && !isVehicleClassId(vehicleRaw)) throw new AppError("Tipo de vehículo no válido.");
  const equipment = typeof (body.equipo ?? body.equipment) === "string" ? String(body.equipo ?? body.equipment).slice(0, 40) : undefined;
  const weightRaw = body.pesoT ?? body.peso ?? body.weightT;
  const weightT = weightRaw === undefined || weightRaw === null || weightRaw === "" ? null : Number(weightRaw);
  if (weightT !== null && (!Number.isFinite(weightT) || weightT <= 0 || weightT > 200)) throw new AppError("Peso no válido (t).");
  return { origin, destination, vehicle: isVehicleClassId(vehicleRaw) ? vehicleRaw : undefined, equipment, weightT };
}
