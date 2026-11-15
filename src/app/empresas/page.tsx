import type { Metadata } from "next";
import Link from "next/link";
import { listarEmpresasPublicas } from "@/lib/empresas-directorio";

export const metadata: Metadata = {
  title: "Empresas",
  description: "Directorio de empresas que publican carga en Carga360go.",
  alternates: { canonical: "/empresas" },
};

export const dynamic = "force-dynamic";

export default function EmpresasPage() {
  const empresas = listarEmpresasPublicas();
  return (
    <div className="wrap" style={{ padding: "24px 0 40px" }}>
      <h1>Empresas</h1>
      <p>Nombre, RUT, dirección y rubro. El correo y el teléfono no se publican.</p>
      {empresas.length === 0 ? (
        <p>--</p>
      ) : (
        <div className="grid c2" style={{ marginTop: 16 }}>
          {empresas.map((empresa) => (
            <article className="card" key={`${empresa.rut}-${empresa.nombre}`}>
              <h2>{empresa.nombre}</h2>
              <p>RUT: {empresa.rut}</p>
              <p>Dirección: {empresa.direccion}</p>
              <p>Rubro: {empresa.rubro}</p>
              <Link className="btn" href="/registro">
                Postular a sus cargas
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
