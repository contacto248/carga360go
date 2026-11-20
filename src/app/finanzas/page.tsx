import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BandejaVacia } from "@/components/paginas/BandejaVacia";
import { paginasPublicasNuevasHidden } from "@/lib/paginas-publicas/flag";
import { paymentsLegalPublished } from "@/lib/pagos/config";

export const metadata: Metadata = {
  title: "Finanzas",
  description: "Vista de la operación comercial en Carga360go. Si no hay movimientos, la vista queda vacía.",
  alternates: { canonical: "/finanzas" },
};

export const dynamic = "force-dynamic";

export default function FinanzasPage() {
  if (paginasPublicasNuevasHidden("/finanzas")) notFound();
  return (
    <BandejaVacia
      titulo="Finanzas"
      lead="Aquí se ordena la operación comercial. Hoy no hay movimientos."
      pagosLegales={paymentsLegalPublished()}
    />
  );
}
