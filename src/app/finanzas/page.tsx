import type { Metadata } from "next";
import { BandejaVacia } from "@/components/paginas/BandejaVacia";
import { paymentsLegalPublished } from "@/lib/pagos/config";

export const metadata: Metadata = {
  title: "Finanzas",
  description: "Vista de la operación comercial en Carga360go. Si no hay movimientos, la vista queda vacía.",
  alternates: { canonical: "/finanzas" },
};

export default function FinanzasPage() {
  return (
    <BandejaVacia
      titulo="Finanzas"
      lead="Aquí se ordena la operación comercial. Hoy no hay movimientos."
      pagosLegales={paymentsLegalPublished()}
    />
  );
}
