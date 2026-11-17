import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackingVista } from "@/components/paginas/TrackingVista";
import { paginasOpsHidden } from "@/lib/paginas-ops/flag";
import { paymentsLegalPublished } from "@/lib/pagos/config";

export const metadata: Metadata = {
  title: { absolute: "Seguimiento de fletes · Próximamente en Carga360go" },
  description:
    "Carga360go prepara el seguimiento de tus viajes. Hoy cada operación registra sus hitos con fecha y hora: publicación, ofertas y adjudicación.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function TrackingPage() {
  if (paginasOpsHidden("/tracking")) notFound();
  return <TrackingVista pagosLegales={paymentsLegalPublished()} />;
}
