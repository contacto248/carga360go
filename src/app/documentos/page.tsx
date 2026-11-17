import type { Metadata } from "next";
import { BandejaVacia } from "@/components/paginas/BandejaVacia";
import { paymentsLegalPublished } from "@/lib/pagos/config";

export const metadata: Metadata = {
  title: "Documentos",
  description: "Bandeja de documentos de la operación en Carga360go. Si no hay registros, la vista queda vacía.",
  alternates: { canonical: "/documentos" },
};

export default function DocumentosPage() {
  return (
    <BandejaVacia
      titulo="Documentos"
      lead="Aquí se listan los documentos de la operación. Hoy no hay registros."
      pagosLegales={paymentsLegalPublished()}
    />
  );
}
