import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OperacionesVista } from "@/components/paginas/OperacionesVista";
import { paginasOpsHidden } from "@/lib/paginas-ops/flag";
import { paymentsLegalPublished } from "@/lib/pagos/config";

export const metadata: Metadata = {
  title: "Operaciones",
  description:
    "La publicación, el calce, las ofertas y la adjudicación quedan registrados con fecha y hora. El seguimiento del viaje no está activo.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function OperacionesPage() {
  if (paginasOpsHidden("/operaciones")) notFound();
  return <OperacionesVista pagosLegales={paymentsLegalPublished()} />;
}
