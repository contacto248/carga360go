import type { MetadataRoute } from "next";
import { LANDING_SLUGS } from "@/lib/seo-landings";

const BASE = "https://www.carga360go.cl";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages = [
    "",
    "/marketplace",
    "/control-tower",
    "/cargas",
    "/camiones",
    "/cargas/nueva",
    "/camiones/nuevo",
    "/registro",
    "/herramientas/calculadora",
    "/tecnologia",
    "/guias",
    "/faq",
    "/regiones",
    "/contacto",
    "/clientes",
    "/documentos",
    "/finanzas",
    "/como-verificamos",
    "/terminos",
    "/privacidad",
    ...LANDING_SLUGS,
  ].map((path) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: path === "/cargas" || path === "/camiones" ? ("daily" as const) : ("monthly" as const),
    priority: path === "" ? 1 : path === "/cargas" || path === "/camiones" ? 0.9 : path.startsWith("/transporte") || path.includes("cama-baja") || path.includes("retorno") ? 0.7 : 0.6,
  }));
  return pages;
}
