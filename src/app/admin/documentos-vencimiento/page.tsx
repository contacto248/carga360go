import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDenied } from "@/components/AdminDenied";
import { AdminNav } from "@/components/AdminNav";
import { getCurrentUser } from "@/lib/current-user";
import { docsVencimientoEnabled, listarDocumentos, requisitosPorFaena } from "@/lib/documentos-vencimiento";

export const metadata: Metadata = { title: "Documentos y vencimiento", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const SUJETO: Record<string, string> = { conductor: "Conductor", vehiculo: "Vehículo" };
const TIPO: Record<string, string> = {
  licencia: "Licencia",
  curso_seguridad: "Cursos de seguridad",
  revision_tecnica: "Revisión técnica",
  seguro: "Seguro",
  permiso_circulacion: "Permiso de circulación",
  soap: "SOAP",
};
const ESTADO: Record<string, string> = { pendiente: "Sin verificar", verificado: "Verificado", rechazado: "Rechazado" };

/** Apagado: 404. No lista requisitos de faena que no estén configurados. */
export default async function DocumentosVencimientoPage() {
  if (!docsVencimientoEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return <AdminDenied next="/admin/documentos-vencimiento" />;
  const documentos = listarDocumentos();
  const faenas = requisitosPorFaena();

  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Documentos y vencimiento</h1>
        <p>Licencia, cursos de seguridad, revisión técnica, seguro, permiso de circulación y SOAP. El aviso a 30, 15 y 7 días queda en la alerta de la operación.</p>
      </div>
      <AdminNav current="/admin/documentos-vencimiento" />
      <section className="card" style={{ marginTop: 12 }}>
        <h2>Requisitos por faena</h2>
        {faenas.length === 0 ? (
          <div className="empty">Sin requisitos por faena.</div>
        ) : (
          <ul>
            {faenas.map((item) => (
              <li key={`${item.faena}:${item.tipo}`}>
                {item.faena}: {TIPO[item.tipo] ?? item.tipo}
              </li>
            ))}
          </ul>
        )}
      </section>
      {documentos.length === 0 ? (
        <div className="empty">Sin documentos.</div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Quién</th>
                <th>Tipo</th>
                <th>Número</th>
                <th>Vence</th>
                <th>Verificación</th>
                <th>Verificó</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((doc) => (
                <tr key={doc.id}>
                  <td>{SUJETO[doc.sujeto] ?? doc.sujeto}</td>
                  <td>{TIPO[doc.tipo] ?? doc.tipo}</td>
                  <td>{doc.numero ?? "—"}</td>
                  <td>{doc.venceEl}</td>
                  <td>{ESTADO[doc.verificacion] ?? doc.verificacion}</td>
                  <td>{doc.verificadoPor ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
