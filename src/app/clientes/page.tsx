import type { Metadata } from "next";
import { ClientesVista } from "@/components/paginas/ClientesVista";
import { paymentsLegalPublished } from "@/lib/pagos/config";

export const metadata: Metadata = {
  title: { absolute: "Publica tu carga y encuentra camión · Carga360go" },
  description:
    "Publica tu carga, recibe ofertas de transportistas acreditados y ve un costo de referencia desglosado. Foco en el norte minero, de Arica a Punta Arenas.",
  alternates: { canonical: "/clientes" },
};

export default function ClientesPage() {
  return <ClientesVista pagosLegales={paymentsLegalPublished()} />;
}
