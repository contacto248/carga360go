import React from "react";
import { AlertCenter } from "@/components/sistema/AlertCenter";
import { DataTable } from "@/components/sistema/DataTable";
import { KpiCards } from "@/components/sistema/KpiCards";
import { Timeline } from "@/components/sistema/Timeline";
import { Transparencia } from "./Transparencia";

/**
 * Vista de operación. No hay un listado público de viajes: los indicadores quedan vacíos.
 * No inventa cifras, precios ni registros.
 */
export function OperacionesVista({ pagosLegales = false }: { pagosLegales?: boolean }) {
  return (
    <div className="wrap ds-page ds-kit">
      <header className="page-title">
        <h1>Operaciones</h1>
        <p className="lead">
          La publicación, el calce, las ofertas y la adjudicación quedan registrados con fecha y hora. El seguimiento
          del viaje no está activo.
        </p>
      </header>
      <Transparencia pagosLegales={pagosLegales} />
      <h2>Registros</h2>
      <KpiCards items={[]} />
      <DataTable columns={[]} rows={[]} />
      <Timeline events={[]} />
      <AlertCenter alerts={[]} />
    </div>
  );
}
