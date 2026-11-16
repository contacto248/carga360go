import type { Metadata } from "next";
import Link from "next/link";
import { listEmpresasPublicas, vistaEmpresa, type VistaEmpresa } from "@/lib/empresas-certificadas";

export const metadata: Metadata = {
  title: "Empresas",
  description:
    "Empresas en proceso de contacto y acreditación en Carga360go. La certificación se muestra solo cuando se completa.",
  alternates: { canonical: "/empresas" },
};

const NOTA = "Empresas en proceso de contacto y acreditación. La certificación se muestra solo cuando se completa.";

function EmpresaCard({ empresa }: { empresa: VistaEmpresa }) {
  return (
    <article className="card empresa-card">
      <div className="empresa-badges">
        <span className={empresa.badgeClass}>{empresa.badge}</span>
        {empresa.sello ? <span className="pill docs">{empresa.sello}</span> : null}
      </div>
      <h2 className="campo">
        <span>Nombre</span>
        {empresa.nombre}
      </h2>
      <p className="campo">
        <span>RUT</span>
        {empresa.rut}
      </p>
      <p className="campo">
        <span>Dirección</span>
        {empresa.direccion}
      </p>
      <p className="campo">
        <span>Rubro</span>
        {empresa.rubro}
      </p>
      {empresa.cargasMes ? (
        <p className="campo">
          <span>Cargas/mes</span>
          {empresa.cargasMes}
        </p>
      ) : null}
      <Link className="btn" href="/registro-transportista">
        Postular a sus cargas
      </Link>
    </article>
  );
}

export default function EmpresasPage() {
  const empresas = listEmpresasPublicas().map(vistaEmpresa);
  return (
    <div className="wrap empresas-page" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Empresas</h1>
      </div>
      <p className="notice">{NOTA}</p>
      <div className="grid c3" style={{ marginTop: 16 }}>
        {empresas.map((empresa) => (
          <EmpresaCard key={empresa.id} empresa={empresa} />
        ))}
      </div>
    </div>
  );
}
