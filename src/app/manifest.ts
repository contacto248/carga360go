import type { MetadataRoute } from "next";
import { headers } from "next/headers";

const sitio: MetadataRoute.Manifest = {
  name: "Carga360go — Cargas y camiones en todo Chile",
  short_name: "Carga360go",
  description: "Bolsa de carga y camiones: publica cargas, recibe ofertas de transportistas verificados y elige la mejor.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#000000",
  theme_color: "#000000",
  lang: "es-CL",
  icons: [
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  ],
};

const agente: MetadataRoute.Manifest = {
  id: "/agente-360go",
  name: "Asistente ÓRBITA",
  short_name: "Asistente ÓRBITA",
  description: "Asistente de ÓRBITA · Sistema Carga360go para operar cargas, camiones, retornos y la torre de control, de Arica a Punta Arenas.",
  start_url: "/agente-360go",
  scope: "/agente-360go",
  display: "standalone",
  background_color: "#000000",
  theme_color: "#000000",
  lang: "es-CL",
  icons: [
    { src: "/agente-360go/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/agente-360go/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/agente-360go/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

/** El archivo de convención solo puede vivir en la raíz. La página del agente pide ese mismo manifiesto con Referer. */
export function manifestFor(pathname: string): MetadataRoute.Manifest {
  if (pathname === "/agente-360go" || pathname.startsWith("/agente-360go/")) return agente;
  return sitio;
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const referer = (await headers()).get("referer") || "";
  let pathname = "";
  try {
    pathname = referer ? new URL(referer).pathname : "";
  } catch {
    pathname = "";
  }
  return manifestFor(pathname);
}
