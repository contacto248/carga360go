import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { getCurrentUser } from "@/lib/current-user";
import { isEnabled } from "@/lib/ops/flags";
import { listOperaciones } from "@/lib/ops/operacion";
import { CrearOperacion } from "./crear-form";

export const metadata: Metadata = { title: "Alta de operación", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Solo existe con OPS_FEATURE_ENABLED y OPS_OPERACION_ENABLED. Apagado ⇒ 404 del middleware. */
export default async function OperacionPage() {
  if (!isEnabled("OPS_FEATURE_ENABLED") || !isEnabled("OPS_OPERACION_ENABLED")) notFound();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();
  const operaciones = listOperaciones(user);

  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Alta de operación</h1>
        <p>El servidor valida los datos y asigna el identificador 360-YYMM-NNNN. Repetir la misma clave no crea otra operación.</p>
      </div>
      <AdminNav current="/admin/ops/operacion" />
      <section className="card" style={{ marginTop: 12 }}>
        <CrearOperacion />
      </section>
      {operaciones.length === 0 ? (
        <div className="empty">Sin operaciones.</div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Identificador</th>
                <th>Cliente</th>
                <th>Origen</th>
                <th>Destino</th>
                <th>Carga</th>
                <th>Peso kg</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {operaciones.map((operacion) => (
                <tr key={operacion.id}>
                  <td>{operacion.id}</td>
                  <td>{operacion.cliente}</td>
                  <td>{operacion.origen}</td>
                  <td>{operacion.destino}</td>
                  <td>{operacion.tipoCarga}</td>
                  <td>{operacion.pesoKg}</td>
                  <td>{operacion.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
