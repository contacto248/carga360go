import React from "react";
import { AlertCenter } from "@/components/sistema/AlertCenter";
import { DataTable } from "@/components/sistema/DataTable";
import { KpiCards } from "@/components/sistema/KpiCards";
import { Timeline } from "@/components/sistema/Timeline";
import { Transparencia } from "./Transparencia";

/** Bandeja del cascarón. Sin filas inventadas: si no hay registros, queda vacía. */
export function BandejaVacia({
  titulo,
  lead,
  pagosLegales,
}: {
  titulo: string;
  lead: string;
  pagosLegales: boolean;
}) {
  return (
    <div className="wrap ds-kit">
      <header className="page-title">
        <h1>{titulo}</h1>
        <p className="lead">{lead}</p>
      </header>
      <Transparencia pagosLegales={pagosLegales} />
      <KpiCards items={[]} />
      <DataTable columns={[{ id: "registro", label: "Registro" }]} rows={[]} />
      <Timeline events={[]} />
      <AlertCenter alerts={[]} />
    </div>
  );
}
