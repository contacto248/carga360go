import type { MetadataRoute } from "next";
import { LANDING_SLUGS } from "@/lib/seo-landings";
import { SEO_ROUTES } from "@/lib/seo-routes";

const BASE = "https://www.carga360go.cl";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages = [
    "",
    "/cargas",
    "/camiones",
    "/cargas/nueva",
    "/camiones/nuevo",
    "/registro",
    "/herramientas/calculadora",
    "/tecnologia",
    "/guias",
    "/preguntas-frecuentes",
    "/regiones",
    "/contacto",
    "/como-verificamos",
    "/terminos",
    "/privacidad",
    "/legal",
    ...LANDING_SLUGS,
    "/rutas",
    ...SEO_ROUTES.map((route) => `/rutas/${route.slug}`),
  ].map((path) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: path === "/cargas" || path === "/camiones" ? ("daily" as const) : ("monthly" as const),
    priority: path === "" ? 1 : path === "/cargas" || path === "/camiones" ? 0.9 : path.startsWith("/transporte") || path.includes("cama-baja") || path.includes("retorno") ? 0.7 : 0.6,
  }));
  return pages;
}
