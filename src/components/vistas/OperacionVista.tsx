import Link from "next/link";
import React from "react";
import { AlertCenter } from "@/components/sistema/AlertCenter";
import { DataTable, type DataColumn, type DataRow } from "@/components/sistema/DataTable";
import { KpiCards, type KpiItem } from "@/components/sistema/KpiCards";
import { Timeline } from "@/components/sistema/Timeline";

const COLUMNAS_AVISOS: DataColumn[] = [
  { id: "aviso", label: "Aviso" },
  { id: "origen", label: "Origen" },
  { id: "destino", label: "Destino" },
  { id: "equipo", label: "Equipo" },
  { id: "fecha", label: "Fecha" },
];

function Transparencia() {
  return (
    <>
      <p className="ds-note">
        Carga360go conecta a mandantes y transportistas. No es transportista ni asegura que el viaje se concrete. El acuerdo y el valor final los definen las partes. Solo mostramos avisos reales y vigentes.
      </p>
      <p className="ds-legal">
        <Link href="/terminos">Términos</Link>
        {" · "}
        <Link href="/privacidad">Privacidad</Link>
      </p>
    </>
  );
}

function Marco({
  title,
  lede,
  actions,
  kpis,
  columns,
  rows,
  caption,
}: {
  title: string;
  lede: string;
  actions: React.ReactNode;
  kpis: KpiItem[];
  columns: DataColumn[];
  rows: DataRow[];
  caption: string;
}) {
  return (
    <div className="wrap ds-kit">
      <header className="page-title">
        <div className="ds-title-row">
          <h1>{title}</h1>
          <p className="ds-state">Próximamente</p>
        </div>
        <p>{lede}</p>
        <div className="ds-actions">{actions}</div>
      </header>
      <KpiCards items={kpis} />
      <DataTable columns={columns} rows={rows} caption={caption} />
      <Timeline events={[]} />
      <AlertCenter alerts={[]} />
      <Transparencia />
    </div>
  );
}

export function AnalyticsVista({ kpis, rows }: { kpis: KpiItem[]; rows: DataRow[] }) {
  return (
    <Marco
      title="Analytics"
      lede="Abajo solo entran avisos reales y vigentes. Si no hay, la vista queda vacía."
      actions={
        <>
          <Link className="btn" href="/cargas">
            Ver cargas vigentes
          </Link>
          <Link className="btn sec" href="/camiones">
            Ver camiones vigentes
          </Link>
        </>
      }
      kpis={kpis}
      columns={COLUMNAS_AVISOS}
      rows={rows}
      caption="Avisos vigentes"
    />
  );
}

export function CopilotoVista() {
  return (
    <Marco
      title="Copiloto"
      lede="Puedes cotizar, publicar y buscar calce en el chat que ya está en el sitio. Esta vista no tiene datos propios."
      actions={
        <>
          <Link className="btn" href="/agente-360go">
            Abrir el chat
          </Link>
          <button type="button" className="btn sec" disabled>
            Avísame cuando esté disponible
          </button>
        </>
      }
      kpis={[]}
      columns={[]}
      rows={[]}
      caption="Tabla"
    />
  );
}

export function AdministracionVista({ kpis }: { kpis: KpiItem[] }) {
  return (
    <Marco
      title="Administración"
      lede="Cuentas, documentos y acreditación se revisan en el panel de administración. Esta entrada no abre otra bandeja."
      actions={
        <Link className="btn" href="/admin">
          Ir al panel
        </Link>
      }
      kpis={kpis}
      columns={[]}
      rows={[]}
      caption="Tabla"
    />
  );
}
