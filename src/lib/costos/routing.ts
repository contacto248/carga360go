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

/** Adaptadores de pago: quedan declarados y NO CONECTADOS hasta que Gerencia autorice clave y costo. */
export const googleRoutesProvider = notConnected(
  "google_routes",
  "Google Routes API (perfil camión / peajes)",
  "Requiere cuenta de Google Cloud con facturación y GOOGLE_ROUTES_API_KEY. Servicio de pago por solicitud.",
);
export const hereProvider = notConnected(
  "here_truck",
  "HERE Routing v8 (transportMode=truck, peajes)",
  "Requiere cuenta HERE y HERE_API_KEY. Servicio con cuota gratuita y luego pago.",
);

export const ROUTE_PROVIDERS: RouteProvider[] = [osrmProvider, orsHgvProvider, googleRoutesProvider, hereProvider];

/** Proveedor activo: el primero con perfil de camión que esté conectado; si no, OSRM. */
export function activeProvider(): RouteProvider {
  const preferred = process.env.COSTOS_ROUTE_PROVIDER;
  const byId = ROUTE_PROVIDERS.find((p) => p.id === preferred && p.connected());
  if (byId) return byId;
  return ROUTE_PROVIDERS.find((p) => p.truckAware && p.connected()) ?? osrmProvider;
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
