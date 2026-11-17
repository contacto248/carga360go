import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertCenter } from "@/components/sistema/AlertCenter";
import { DataTable } from "@/components/sistema/DataTable";
import { KpiCards } from "@/components/sistema/KpiCards";
import { Timeline } from "@/components/sistema/Timeline";
import { sistemaPageHidden } from "@/lib/sistema/flag";

export const metadata: Metadata = {
  title: "Sistema de diseño",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Cascarón del sistema. El middleware responde 404 si el flag está apagado.
 * Esta guarda evita pintar la vista si esa capa no corre.
 * No trae cifras, precios ni registros de operación.
 */
export default function SistemaPage() {
  if (sistemaPageHidden("/sistema")) notFound();
  return (
    <div className="wrap ds-kit">
      <header className="page-title">
        <h1>Sistema de diseño</h1>
        <p>Cascarón de navegación, indicadores, tabla, línea de tiempo y alertas. Sin datos de operación.</p>
      </header>
      <KpiCards items={[]} />
      <DataTable columns={[]} rows={[]} />
      <Timeline events={[]} />
      <AlertCenter alerts={[]} />
    </div>
  );
}
