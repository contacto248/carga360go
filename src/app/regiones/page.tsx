import type { Metadata } from "next";
import { RegionsDashboard } from "@/components/RegionsDashboard";
import { regionIndicators } from "@/lib/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel de regiones: cargas y camiones por región",
  description: "Mapa de Chile con las cargas activas, cargas con destino, camiones disponibles y transportistas verificados en cada una de las 16 regiones.",
  alternates: { canonical: "/regiones" },
};

export default function RegionesPage() {
  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <div className="page-title">
        <h1>Panel de regiones</h1>
        <p>De Arica y Parinacota a Magallanes: toca una región en el mapa o en la tabla para ver sus indicadores y sus cargas.</p>
      </div>
      <RegionsDashboard regions={regionIndicators()} />
    </div>
  );
}
