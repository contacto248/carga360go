import type { LatLon } from "./types";

const R = 6_371_000;

export function haversineM(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Decodifica una polilínea codificada (Google/OSRM) con la precisión indicada. Devuelve [lon, lat]. */
export function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    for (const which of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lon += delta;
    }
    out.push([lon / factor, lat / factor]);
  }
  return out;
}

export function encodePolyline(points: [number, number][], precision = 6): string {
  const factor = 10 ** precision;
  let out = "";
  let prevLat = 0;
  let prevLon = 0;
  const enc = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let s = "";
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return s + String.fromCharCode(v + 63);
  };
  for (const [lon, lat] of points) {
    const la = Math.round(lat * factor);
    const lo = Math.round(lon * factor);
    out += enc(la - prevLat) + enc(lo - prevLon);
    prevLat = la;
    prevLon = lo;
  }
  return out;
}

export type NearestOnLine = { distanceM: number; segment: number; heading: "norte" | "sur" | "neutro" };

/**
 * Distancia mínima (m) de un punto a una polilínea [lon, lat] (proyección equirectangular local, suficiente
 * para distancias de cientos de metros) y el sentido del tramo más cercano (norte/sur por latitud).
 */
export function nearestOnLine(point: LatLon, line: [number, number][]): NearestOnLine {
  const kx = (Math.cos((point.lat * Math.PI) / 180) * Math.PI * R) / 180;
  const ky = (Math.PI * R) / 180;
  let best = Infinity;
  let seg = -1;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = (line[i][0] - point.lon) * kx;
    const ay = (line[i][1] - point.lat) * ky;
    const bx = (line[i + 1][0] - point.lon) * kx;
    const by = (line[i + 1][1] - point.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) {
      best = d;
      seg = i;
    }
  }
  if (seg < 0) return { distanceM: Infinity, segment: -1, heading: "neutro" };
  // Sentido con una ventana de ~10 vértices para no depender de un tramo diminuto.
  const from = line[Math.max(0, seg - 5)];
  const to = line[Math.min(line.length - 1, seg + 6)];
  const dLat = to[1] - from[1];
  const heading = Math.abs(dLat) < 1e-5 ? "neutro" : dLat > 0 ? "norte" : "sur";
  return { distanceM: best, segment: seg, heading };
}
