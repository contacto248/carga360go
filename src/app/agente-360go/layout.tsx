import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AI.CARGA360",
  description: "AI.CARGA360 opera cargas, camiones, retornos y la torre de control de Carga360go, de Arica a Punta Arenas.",
  applicationName: "AI.CARGA360",
  manifest: "/agente-360go/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AI.CARGA360",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/agente-360go/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/agente-360go/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/agente-360go/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1633",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function Agente360Layout({ children }: { children: React.ReactNode }) {
  return children;
}
