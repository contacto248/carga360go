import { AppError } from "../../errors";

/** Posición lista para guardarse en trip_gps_points. Sin proveedor externo. */
export type GpsFix = {
  lat: number;
  lng: number;
  recordedAt: string;
};

export type GpsProvider = "simulado" | "conductor";

/**
 * Conector GPS. Este módulo no abre red ni lee credenciales.
 * Otro modo tendría que implementar la misma interfaz sin guardar secretos en la base.
 */
export interface GpsConnector<TInput> {
  readonly provider: GpsProvider;
  collect(input: TInput): GpsFix[];
}

export type SimulatedTrackInput = {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  steps: number;
  endedAt: Date;
};

export type DriverFixInput = {
  lat: number;
  lng: number;
  recordedAt: string;
};

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function coord(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new AppError(`${name} no es una coordenada.`);
  return round6(value);
}

/** Recorrido en línea entre dos puntos, con hora generada en el servidor. No llama a ningún servicio. */
export const simulatedGps: GpsConnector<SimulatedTrackInput> = {
  provider: "simulado",
  collect(input) {
    const steps = input.steps;
    if (!Number.isInteger(steps) || steps < 2 || steps > 8) {
      throw new AppError("El recorrido simulado usa entre 2 y 8 puntos.");
    }
    const originLat = coord(input.origin.lat, "Latitud");
    const originLng = coord(input.origin.lng, "Longitud");
    const destLat = coord(input.destination.lat, "Latitud");
    const destLng = coord(input.destination.lng, "Longitud");
    if (originLat === destLat && originLng === destLng) {
      throw new AppError("El origen y el destino son el mismo punto.");
    }
    const ended = input.endedAt.getTime();
    if (!Number.isFinite(ended)) throw new AppError("La hora del recorrido no es válida.");
    const gap = 5 * 60 * 1000;
    const fixes: GpsFix[] = [];
    for (let i = 0; i < steps; i += 1) {
      const t = i / (steps - 1);
      fixes.push({
        lat: round6(originLat + (destLat - originLat) * t),
        lng: round6(originLng + (destLng - originLng) * t),
        recordedAt: new Date(ended - (steps - 1 - i) * gap).toISOString(),
      });
    }
    return fixes;
  },
};

/** Un punto enviado por el teléfono o el formulario del conductor. La hora ya viene del servidor. */
export const driverGps: GpsConnector<DriverFixInput> = {
  provider: "conductor",
  collect(input) {
    return [
      {
        lat: coord(input.lat, "Latitud"),
        lng: coord(input.lng, "Longitud"),
        recordedAt: input.recordedAt,
      },
    ];
  },
};
