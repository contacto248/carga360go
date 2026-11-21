import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Asistente ÓRBITA",
  description: "Asistente ÓRBITA opera cargas, camiones, retornos y la torre de control de ÓRBITA · Sistema Carga360go, de Arica a Punta Arenas.",
  applicationName: "Asistente ÓRBITA",
  manifest: "/agente-360go/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Asistente ÓRBITA",
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
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function Agente360Layout({ children }: { children: React.ReactNode }) {
  return children;
}
