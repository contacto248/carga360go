import type { Metadata } from "next";
import { AdminDenied } from "@/components/AdminDenied";
import { AdminNav } from "@/components/AdminNav";
import { auditLabel, auditTargetLabel, listAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/current-user";
import { firstParam } from "@/lib/format";

export const metadata: Metadata = { title: "Auditoría", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return <AdminDenied next="/admin/auditoria" />;
  const sp = await searchParams;
  const filter = firstParam(sp.tipo);
  const entries = listAudit(500).filter((entry) => !filter || entry.action.startsWith(filter));
  const groups = [
    ["", "Todo"],
    ["usuario", "Cuentas"],
    ["documento", "Documentos"],
    ["oferta", "Ofertas"],
    ["carga", "Cargas"],
    ["ajustes", "Ajustes"],
  ];
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Auditoría</h1>
        <p>Registro de acciones de administración y eventos importantes (últimos 500). Horas en Chile.</p>
      </div>
      <AdminNav current="/admin/auditoria" />
      <div className="admin-nav">
        {groups.map(([id, label]) => (
          <a key={id || "todo"} href={id ? `/admin/auditoria?tipo=${id}` : "/admin/auditoria"} className={filter === id ? "on" : ""}>
            {label}
          </a>
        ))}
      </div>
      {entries.length === 0 ? (
        <div className="empty">Sin registros todavía.</div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Evento</th>
                <th>Quién</th>
                <th>Detalle</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {new Date(entry.createdAt).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td>{auditLabel(entry.action)}</td>
                  <td>{entry.actorEmail || "—"}</td>
                  <td className="meta" style={{ maxWidth: 360, wordBreak: "break-word" }}>
                    {entry.detail || ""}
                    {entry.targetType ? ` (${auditTargetLabel(entry.targetType)})` : ""}
                  </td>
                  <td className="meta">{entry.ip || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
