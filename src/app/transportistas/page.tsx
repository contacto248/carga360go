import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TransportistasVista } from "@/components/paginas/TransportistasVista";
import { paginasOpsHidden } from "@/lib/paginas-ops/flag";
import { paymentsLegalPublished } from "@/lib/pagos/config";

export const metadata: Metadata = {
  title: { absolute: "Cargas y retornos para tu camión · Carga360go" },
  description:
    "Publica tu camión o tu retorno y recibe alertas por correo cuando aparezca una carga que calza con tu equipo y tu ruta. Ofreces tú el valor.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function TransportistasPage() {
  if (paginasOpsHidden("/transportistas")) notFound();
  return <TransportistasVista pagosLegales={paymentsLegalPublished()} />;
}
