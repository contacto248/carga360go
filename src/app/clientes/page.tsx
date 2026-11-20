import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientesVista } from "@/components/paginas/ClientesVista";
import { paginasPublicasNuevasHidden } from "@/lib/paginas-publicas/flag";
import { paymentsLegalPublished } from "@/lib/pagos/config";

export const metadata: Metadata = {
  title: { absolute: "Publica tu carga y encuentra camión · Carga360go" },
  description:
    "Publica tu carga, recibe ofertas de transportistas acreditados y ve un costo de referencia desglosado. Foco en el norte minero, de Arica a Punta Arenas.",
  alternates: { canonical: "/clientes" },
};

export const dynamic = "force-dynamic";

export default function ClientesPage() {
  if (paginasPublicasNuevasHidden("/clientes")) notFound();
  return <ClientesVista pagosLegales={paymentsLegalPublished()} />;
}
