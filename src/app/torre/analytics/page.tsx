import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalyticsVista } from "@/components/vistas/OperacionVista";
import { liveStats, recentListings } from "@/lib/stats";
import { filasAvisos, indicadoresReales } from "@/lib/vistas/datos";
import { uiVistaHidden } from "@/lib/vistas/flag";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** El middleware responde 404 si el flag está apagado. Esta guarda repite el corte. */
export default function AnalyticsPage() {
  if (uiVistaHidden("/torre/analytics")) notFound();
  try {
    return <AnalyticsVista kpis={indicadoresReales(liveStats())} rows={filasAvisos(recentListings(8))} />;
  } catch {
    return <AnalyticsVista kpis={[]} rows={[]} />;
  }
}
