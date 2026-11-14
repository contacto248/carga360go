import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Carga360go — Cargas y camiones en todo Chile",
    short_name: "Carga360go",
    description: "Bolsa de carga y camiones: publica cargas, recibe ofertas de transportistas verificados y elige la mejor.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0B1633",
    theme_color: "#0B1633",
    lang: "es-CL",
    icons: [
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
