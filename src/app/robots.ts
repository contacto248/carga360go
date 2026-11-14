import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/panel", "/cuenta-en-revision", "/verificar-correo", "/restablecer", "/recuperar"],
    },
    sitemap: "https://www.carga360go.cl/sitemap.xml",
    host: "https://www.carga360go.cl",
  };
}
