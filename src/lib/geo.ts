/**
 * Coordenadas aproximadas (centro urbano) de las ciudades del catálogo y distancia vial estimada.
 * La distancia es referencial: línea recta (haversine) × factor vial. No reemplaza un ruteo real.
 */
import { ROAD_FACTOR } from "./freight-defaults";

export { ROAD_FACTOR };

const COORDS: Record<string, [number, number]> = {
  Arica: [-18.48, -70.31], Putre: [-18.2, -69.56], Iquique: [-20.21, -70.15], "Alto Hospicio": [-20.27, -70.1],
  "Pozo Almonte": [-20.26, -69.79], Pica: [-20.49, -69.33], Antofagasta: [-23.65, -70.4], Calama: [-22.46, -68.93],
  Mejillones: [-23.1, -70.45], Tocopilla: [-22.09, -70.2], Taltal: [-25.41, -70.49], "San Pedro de Atacama": [-22.91, -68.2],
  "Copiapó": [-27.37, -70.33], Caldera: [-27.07, -70.82], Vallenar: [-28.58, -70.76], "Chañaral": [-26.35, -70.62],
  "Diego de Almagro": [-26.39, -70.05], "La Serena": [-29.9, -71.25], Coquimbo: [-29.95, -71.34], Ovalle: [-30.6, -71.2],
  Illapel: [-31.63, -71.17], "Los Vilos": [-31.91, -71.51], "Vicuña": [-30.03, -70.71], Salamanca: [-31.78, -70.96],
  "Valparaíso": [-33.05, -71.62], "Viña del Mar": [-33.02, -71.55], "San Antonio": [-33.59, -71.61], Quillota: [-32.88, -71.25],
  "La Calera": [-32.79, -71.2], "Quilpué": [-33.05, -71.44], Casablanca: [-33.32, -71.41], "Los Andes": [-32.83, -70.6],
  "San Felipe": [-32.75, -70.72], Santiago: [-33.45, -70.67], Pudahuel: [-33.44, -70.76], Quilicura: [-33.36, -70.73],
  Lampa: [-33.28, -70.88], Colina: [-33.2, -70.67], "Maipú": [-33.51, -70.76], "San Bernardo": [-33.59, -70.7],
  "Puente Alto": [-33.61, -70.58], Buin: [-33.73, -70.74], Talagante: [-33.66, -70.93], Melipilla: [-33.69, -71.21],
  Rancagua: [-34.17, -70.74], Rengo: [-34.4, -70.86], "San Fernando": [-34.58, -70.99], "Santa Cruz": [-34.64, -71.37],
  Pichilemu: [-34.39, -72.0], Talca: [-35.43, -71.66], "Curicó": [-34.98, -71.24], Linares: [-35.85, -71.59],
  "Constitución": [-35.33, -72.41], Parral: [-36.14, -71.83], Cauquenes: [-35.97, -72.32], "Chillán": [-36.61, -72.1],
  "San Carlos": [-36.42, -71.96], Bulnes: [-36.74, -72.3], Quirihue: [-36.28, -72.54], "Concepción": [-36.83, -73.05],
  Talcahuano: [-36.72, -73.12], "San Pedro de la Paz": [-36.84, -73.1], Coronel: [-37.03, -73.16], Lota: [-37.09, -73.16],
  "Los Ángeles": [-37.47, -72.35], Arauco: [-37.25, -73.32], Cabrero: [-37.03, -72.4], Temuco: [-38.74, -72.6],
  "Padre Las Casas": [-38.77, -72.6], Lautaro: [-38.53, -72.43], Victoria: [-38.23, -72.33], Angol: [-37.8, -72.71],
  Villarrica: [-39.28, -72.23], "Pucón": [-39.28, -71.98], Valdivia: [-39.81, -73.25], "La Unión": [-40.29, -73.08],
  "Río Bueno": [-40.33, -72.96], Panguipulli: [-39.64, -72.33], Osorno: [-40.57, -73.14], "Puerto Montt": [-41.47, -72.94],
  "Puerto Varas": [-41.32, -72.99], Calbuco: [-41.77, -73.13], Ancud: [-41.87, -73.82], Castro: [-42.48, -73.76],
  "Quellón": [-43.12, -73.62], Coyhaique: [-45.57, -72.07], "Puerto Aysén": [-45.4, -72.69], "Chile Chico": [-46.54, -71.72],
  Cochrane: [-47.25, -72.57], "Punta Arenas": [-53.16, -70.91], "Puerto Natales": [-51.73, -72.51], Porvenir: [-53.3, -70.37],
  "Puerto Williams": [-54.93, -67.61],
};

export function cityCoords(name: string): [number, number] | undefined {
  return COORDS[name];
}

export function straightKm(a: string, b: string): number | null {
  const p = COORDS[a];
  const q = COORDS[b];
  if (!p || !q) return null;
  const rad = Math.PI / 180;
  const dLat = (q[0] - p[0]) * rad;
  const dLon = (q[1] - p[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p[0] * rad) * Math.cos(q[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Distancia vial estimada en km, redondeada a 10 km (mínimo 10). `factor` sale de la base en /api/estimacion. */
export function roadKm(a: string, b: string, factor = ROAD_FACTOR): number | null {
  if (a === b) return 0;
  const km = straightKm(a, b);
  if (km === null) return null;
  const used = Number.isFinite(factor) && factor > 0 ? factor : ROAD_FACTOR;
  return Math.max(10, Math.round((km * used) / 10) * 10);
}
