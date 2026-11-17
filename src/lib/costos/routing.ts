import { createHash } from "crypto";
import { getDb } from "../db";
import { cityCoords } from "../geo";
import { decodePolyline, encodePolyline } from "./geometry";
import { fetchSource, SourceError } from "./http";
import type { LatLon, Place, RouteResult, RouteStep } from "./types";

/**
 * Capa de proveedores de ruteo. Implementación real y gratuita: OSRM (servidor público de demostración
 * router.project-osrm.org, datos © OpenStreetMap contributors, ODbL). Ese servidor solo tiene perfil de AUTO:
 * no conoce restricciones de camiones (altura, peso, prohibiciones urbanas), por eso cada resultado se marca
 * truckAware=false y la duración se ajusta con un factor configurable. Política de uso: máx. 1 solicitud/s,
 * User-Agent identificable y caché local (se guarda cada ruta en cost_route_cache).
 * Para producción con volumen se debe usar un OSRM propio o un proveedor con perfil de camión (abajo).
 */
export interface RouteProvider {
  id: string;
  label: string;
  truckAware: boolean;
  connected(): boolean;
  /** Qué falta para conectarlo (clave, contrato). */
  requirement: string;
  route(points: LatLon[]): Promise<Omit<RouteResult, "via" | "viaLabel" | "cached">>;
}

type OsrmStep = { name?: string; ref?: string; distance: number; intersections?: { classes?: string[] }[] };
type OsrmRoute = { distance: number; duration: number; geometry: string; legs: { steps?: OsrmStep[] }[] };

export const osrmProvider: RouteProvider = {
  id: "osrm",
  label: "OSRM (OpenStreetMap), servidor público",
  truckAware: false,
  requirement: "Sin clave. Uso moderado según la política del servidor de demostración; para volumen, instalar OSRM propio (OSRM_URL).",
  connected: () => true,
  async route(points) {
    const base = (process.env.OSRM_URL || "https://router.project-osrm.org").replace(/\/$/, "");
    const coords = points.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
    const url = `${base}/route/v1/driving/${coords}?overview=full&geometries=polyline6&steps=true&alternatives=${points.length === 2 ? 2 : "false"}`;
    const response = await fetchSource(url, { timeoutMs: 30_000 });
    const data = (await response.json()) as { code: string; message?: string; routes?: OsrmRoute[] };
    if (data.code !== "Ok" || !data.routes?.length) throw new SourceError(`OSRM: ${data.message || data.code}`);
    const main = data.routes[0];
    const steps: RouteStep[] = [];
    for (const leg of main.legs) {
      for (const s of leg.steps ?? []) {
        const classes = new Set((s.intersections ?? []).flatMap((i) => i.classes ?? []));
        steps.push({ name: s.name ?? "", ref: s.ref ?? "", distanceM: s.distance, toll: classes.has("toll"), motorway: classes.has("motorway") });
      }
    }
    return {
      provider: "osrm",
      profile: "driving (auto)",
      truckAware: false,
      distanceM: main.distance,
      durationS: main.duration,
      geometry: decodePolyline(main.geometry, 6),
      steps,
      alternatives: data.routes.slice(1).map((r) => ({ distanceM: r.distance, durationS: r.duration })),
      fetchedAt: new Date().toISOString(),
      attribution: "Ruta: OSRM · datos © OpenStreetMap contributors (ODbL)",
    };
  },
};

/** OpenRouteService con perfil driving-hgv (camión). Plan gratuito con clave: ORS_API_KEY. Sin clave: NO CONECTADO. */
export const orsHgvProvider: RouteProvider = {
  id: "ors_hgv",
  label: "OpenRouteService, perfil camión (driving-hgv)",
  truckAware: true,
  requirement: "Requiere ORS_API_KEY (registro en openrouteservice.org; plan gratuito con cuota diaria). No probado sin clave.",
  connected: () => Boolean(process.env.ORS_API_KEY),
  async route(points) {
    const key = process.env.ORS_API_KEY;
    if (!key) throw new SourceError("OpenRouteService no está conectado (falta ORS_API_KEY).");
    const response = await fetchSource("https://api.openrouteservice.org/v2/directions/driving-hgv", {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: points.map((p) => [p.lon, p.lat]), instructions: true }),
      timeoutMs: 30_000,
    });
    const data = (await response.json()) as {
      routes?: { summary: { distance: number; duration: number }; geometry: string; segments?: { steps?: { name?: string; distance: number }[] }[] }[];
    };
    const main = data.routes?.[0];
    if (!main) throw new SourceError("OpenRouteService no devolvió rutas.");
    return {
      provider: "ors_hgv",
      profile: "driving-hgv",
      truckAware: true,
      distanceM: main.summary.distance,
      durationS: main.summary.duration,
      geometry: decodePolyline(main.geometry, 5),
      steps: (main.segments ?? []).flatMap((seg) => (seg.steps ?? []).map((s) => ({ name: s.name ?? "", ref: "", distanceM: s.distance, toll: false, motorway: false }))),
      alternatives: [],
      fetchedAt: new Date().toISOString(),
      attribution: "Ruta: openrouteservice.org · datos © OpenStreetMap contributors",
    };
  },
};

function notConnected(id: string, label: string, requirement: string): RouteProvider {
  return {
    id,
    label,
    truckAware: true,
    requirement,
    connected: () => false,
    async route() {
      throw new SourceError(`${label}: NO CONECTADO. ${requirement}`);
    },
  };
}

type GoogleStep = { distanceMeters?: number; navigationInstruction?: { instructions?: string } };
type GoogleRouteBody = {
  routes?: {
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
    legs?: { steps?: GoogleStep[] }[];
  }[];
};

function googleSeconds(value: string | undefined): number {
  if (!value || !value.endsWith("s")) return Number.NaN;
  return Number(value.slice(0, -1));
}

function stepsFromGoogle(legs: { steps?: GoogleStep[] }[] | undefined): RouteStep[] {
  const steps: RouteStep[] = [];
  for (const leg of legs ?? []) {
    for (const step of leg.steps ?? []) {
      const name = step.navigationInstruction?.instructions ?? "";
      steps.push({
        name,
        ref: "",
        distanceM: step.distanceMeters ?? 0,
        toll: /peaje/i.test(name),
        motorway: /autopista|ruta\s*\d/i.test(name),
      });
    }
  }
  return steps;
}

/** Respuesta de Routes API (computeRoutes). La polilínea es precisión 5. */
export function parseGoogleRoutesBody(data: GoogleRouteBody): Omit<RouteResult, "via" | "viaLabel" | "cached"> {
  const main = data.routes?.[0];
  const distanceM = main?.distanceMeters;
  const durationS = googleSeconds(main?.duration);
  const encoded = main?.polyline?.encodedPolyline;
  if (!main || !distanceM || !Number.isFinite(durationS) || !encoded) throw new SourceError("Google Routes no devolvió una ruta.");
  return {
    provider: "google_maps",
    profile: "DRIVE",
    truckAware: false,
    distanceM,
    durationS,
    geometry: decodePolyline(encoded, 5),
    steps: stepsFromGoogle(main.legs),
    alternatives: [],
    fetchedAt: new Date().toISOString(),
    attribution: "Ruta: Google Maps (Routes API)",
  };
}

type GoogleDirectionsBody = {
  status?: string;
  routes?: {
    overview_polyline?: { points?: string };
    legs?: { distance?: { value?: number }; duration?: { value?: number }; steps?: { distance?: { value?: number }; html_instructions?: string }[] }[];
  }[];
};

/** Respuesta de Directions API. La polilínea general es precisión 5. */
export function parseGoogleDirectionsBody(data: GoogleDirectionsBody): Omit<RouteResult, "via" | "viaLabel" | "cached"> {
  const main = data.routes?.[0];
  const legs = main?.legs ?? [];
  const distanceM = legs.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0);
  const durationS = legs.reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0);
  const encoded = main?.overview_polyline?.points;
  if (data.status && data.status !== "OK") throw new SourceError("Google Directions no devolvió una ruta.");
  if (!main || !distanceM || !durationS || !encoded) throw new SourceError("Google Directions no devolvió una ruta.");
  const steps: RouteStep[] = [];
  for (const leg of legs) {
    for (const step of leg.steps ?? []) {
      const name = (step.html_instructions ?? "").replace(/<[^>]+>/g, "");
      steps.push({ name, ref: "", distanceM: step.distance?.value ?? 0, toll: /peaje/i.test(name), motorway: /autopista|ruta\s*\d/i.test(name) });
    }
  }
  return {
    provider: "google_maps",
    profile: "driving",
    truckAware: false,
    distanceM,
    durationS,
    geometry: decodePolyline(encoded, 5),
    steps,
    alternatives: [],
    fetchedAt: new Date().toISOString(),
    attribution: "Ruta: Google Maps (Directions API)",
  };
}

function googleKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

/**
 * Google Maps solo si GOOGLE_MAPS_API_KEY está en el entorno al ejecutar.
 * La clave no se declara en el repositorio. Primero Routes API (la clave va en un header);
 * si esa llamada falla, Directions API.
 */
export const googleMapsProvider: RouteProvider = {
  id: "google_maps",
  label: "Google Maps (Routes API, con Directions API de respaldo)",
  truckAware: false,
  requirement: "Se usa solo cuando el entorno del proceso tiene GOOGLE_MAPS_API_KEY. Sin esa variable queda inactivo y la ruta sale de OSRM.",
  connected: () => googleKey().length > 0,
  async route(points) {
    const key = googleKey();
    if (!key) throw new SourceError("Google Maps no está conectado.");
    const origin = { location: { latLng: { latitude: points[0].lat, longitude: points[0].lon } } };
    const destination = { location: { latLng: { latitude: points[points.length - 1].lat, longitude: points[points.length - 1].lon } } };
    const intermediates = points.slice(1, -1).map((point) => ({ location: { latLng: { latitude: point.lat, longitude: point.lon } } }));
    const payload: Record<string, unknown> = { origin, destination, travelMode: "DRIVE", languageCode: "es-CL", units: "METRIC" };
    if (intermediates.length) payload.intermediates = intermediates;
    try {
      const response = await fetchSource("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction",
        },
        body: JSON.stringify(payload),
        timeoutMs: 30_000,
      });
      return parseGoogleRoutesBody((await response.json()) as GoogleRouteBody);
    } catch {
      const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
      url.searchParams.set("origin", `${points[0].lat},${points[0].lon}`);
      url.searchParams.set("destination", `${points[points.length - 1].lat},${points[points.length - 1].lon}`);
      if (intermediates.length) url.searchParams.set("waypoints", points.slice(1, -1).map((point) => `${point.lat},${point.lon}`).join("|"));
      url.searchParams.set("language", "es");
      url.searchParams.set("key", key);
      const response = await fetchSource(url.toString(), { timeoutMs: 30_000 });
      return parseGoogleDirectionsBody((await response.json()) as GoogleDirectionsBody);
    }
  },
};
export const hereProvider = notConnected(
  "here_truck",
  "HERE Routing v8 (transportMode=truck, peajes)",
  "Requiere cuenta HERE y HERE_API_KEY. Servicio con cuota gratuita y luego pago.",
);

export const ROUTE_PROVIDERS: RouteProvider[] = [osrmProvider, orsHgvProvider, googleMapsProvider, hereProvider];

/**
 * Proveedor activo. Google Maps solo si la clave llega en el entorno de ejecución.
 * Si no, un proveedor de camión ya conectado (ORS) o, en su defecto, OSRM público.
 * `preferred` (COSTOS_ROUTE_PROVIDER) puede forzar un proveedor que esté conectado.
 */
export function chooseProvider(env: { preferred?: string; googleKey?: string } = {}): RouteProvider {
  const googleOn = Boolean(env.googleKey?.trim());
  const preferred = ROUTE_PROVIDERS.find((provider) => {
    if (provider.id !== env.preferred) return false;
    return provider.id === "google_maps" ? googleOn : provider.connected();
  });
  if (preferred) return preferred;
  if (googleOn) return googleMapsProvider;
  return ROUTE_PROVIDERS.find((provider) => provider.truckAware && provider.connected()) ?? osrmProvider;
}

export function activeProvider(): RouteProvider {
  return chooseProvider({ preferred: process.env.COSTOS_ROUTE_PROVIDER, googleKey: process.env.GOOGLE_MAPS_API_KEY });
}

/**
 * Puntos de paso de corredores de carga (criterio operacional configurable, no restricción legal):
 * el perfil de auto de OSRM prefiere entre Antofagasta y Chañaral la costa (Rutas B-710 y 1); para camiones se
 * fuerza la Ruta 5 por Agua Verde (coordenada del poblado según OpenStreetMap/Nominatim, consultada 14-11-2026).
 */
export const CORRIDORS: { id: string; label: string; via: LatLon; applies: (a: LatLon, b: LatLon) => boolean }[] = [
  {
    id: "ruta5_agua_verde",
    label: "Ruta 5 Norte por Agua Verde (corredor de carga entre Antofagasta y Chañaral)",
    via: { lat: -25.3994128, lon: -69.965363 },
    applies: (a, b) => {
      const north = (p: LatLon) => p.lat > -25.0 && p.lat < -21.0 && p.lon > -71.0;
      const south = (p: LatLon) => p.lat < -26.4;
      return (north(a) && south(b)) || (north(b) && south(a));
    },
  },
];

function cacheKey(provider: string, points: LatLon[]): string {
  return createHash("sha256")
    .update(provider + "|" + points.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(";"))
    .digest("hex")
    .slice(0, 40);
}

type CacheRow = { payload: string; fetched_at: string };

export function cachedRoute(origin: LatLon, destination: LatLon, maxAgeDays: number, providerId = activeProvider().id): RouteResult | null {
  const corridor = CORRIDORS.find((c) => c.applies(origin, destination));
  const points = corridor ? [origin, corridor.via, destination] : [origin, destination];
  const row = getDb().prepare(`SELECT payload, fetched_at FROM cost_route_cache WHERE key = ?`).get(cacheKey(providerId, points)) as CacheRow | undefined;
  if (!row) return null;
  if (Date.now() - Date.parse(row.fetched_at) > maxAgeDays * 86_400_000) return null;
  const stored = JSON.parse(row.payload) as Omit<RouteResult, "geometry"> & { geometry: string };
  return { ...stored, geometry: decodePolyline(stored.geometry, 6), cached: true };
}

/** Ruta real entre dos puntos (con corredor de carga si aplica), usando caché local. */
export async function getRoute(origin: LatLon, destination: LatLon, maxAgeDays: number): Promise<RouteResult> {
  const provider = activeProvider();
  const hit = cachedRoute(origin, destination, maxAgeDays, provider.id);
  if (hit) return hit;
  const corridor = CORRIDORS.find((c) => c.applies(origin, destination));
  const points = corridor ? [origin, corridor.via, destination] : [origin, destination];
  const fresh = await provider.route(points);
  const result: RouteResult = { ...fresh, via: corridor ? [corridor.via] : [], viaLabel: corridor?.label ?? null, cached: false };
  const payload = JSON.stringify({ ...result, geometry: encodePolyline(result.geometry, 6) });
  getDb()
    .prepare(
      `INSERT INTO cost_route_cache (key, provider, payload, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at, provider = excluded.provider`,
    )
    .run(cacheKey(provider.id, points), provider.id, payload, result.fetchedAt);
  return result;
}

/**
 * Geocodificación. Las ciudades del catálogo del sitio usan sus coordenadas de centro urbano (src/lib/geo.ts),
 * sin consultar fuera. Otro texto se geocodifica con Nominatim (OpenStreetMap), con caché permanente y User-Agent,
 * según su política de uso (máx. 1 solicitud/s, sin uso masivo).
 */
export async function geocode(query: string): Promise<Place> {
  const text = query.trim();
  if (!text) throw new SourceError("Falta el lugar.");
  const city = cityCoords(text);
  if (city) return { lat: city[0], lon: city[1], label: text, region: null, source: "catálogo Carga360go (centro urbano aproximado)" };
  const key = text.toLowerCase();
  const db = getDb();
  const hit = db.prepare(`SELECT lat, lon, label, region FROM cost_geocode_cache WHERE key = ?`).get(key) as
    | { lat: number; lon: number; label: string; region: string | null }
    | undefined;
  if (hit) return { ...hit, source: "Nominatim (OpenStreetMap), caché" };
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&addressdetails=1&q=${encodeURIComponent(text)}`;
  const response = await fetchSource(url);
  const rows = (await response.json()) as { lat: string; lon: string; display_name: string; address?: { state?: string } }[];
  if (!rows.length) throw new SourceError(`No se encontró "${text}" en Chile.`);
  const place = { lat: Number(rows[0].lat), lon: Number(rows[0].lon), label: rows[0].display_name, region: rows[0].address?.state ?? null };
  db.prepare(`INSERT OR REPLACE INTO cost_geocode_cache (key, lat, lon, label, region, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    key,
    place.lat,
    place.lon,
    place.label,
    place.region,
    new Date().toISOString(),
  );
  return { ...place, source: "Nominatim (OpenStreetMap)" };
}
