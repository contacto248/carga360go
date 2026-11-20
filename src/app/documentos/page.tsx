import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BandejaVacia } from "@/components/paginas/BandejaVacia";
import { paginasPublicasNuevasHidden } from "@/lib/paginas-publicas/flag";
import { paymentsLegalPublished } from "@/lib/pagos/config";

export const metadata: Metadata = {
  title: "Documentos",
  description: "Bandeja de documentos de la operación en Carga360go. Si no hay registros, la vista queda vacía.",
  alternates: { canonical: "/documentos" },
};

export const dynamic = "force-dynamic";

export default function DocumentosPage() {
  if (paginasPublicasNuevasHidden("/documentos")) notFound();
  return (
    <BandejaVacia
      titulo="Documentos"
      lead="Aquí se listan los documentos de la operación. Hoy no hay registros."
      pagosLegales={paymentsLegalPublished()}
    />
  );
}
