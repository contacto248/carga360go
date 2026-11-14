import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDenied } from "@/components/AdminDenied";
import { AdminKycActions } from "@/components/AdminKycActions";
import { AdminNav } from "@/components/AdminNav";
import { getCurrentUser } from "@/lib/current-user";
import { firstParam, formatRut } from "@/lib/format";
import { diditConfigured, kycEnabled } from "@/lib/kyc/config";
import { listKyc, KYC_STATUS_LABELS, KYC_STATUSES } from "@/lib/kyc/service";
import { roleLabel } from "@/lib/roles";
import type { Role } from "@/lib/types";

/** Con el flag apagado ni el título revela la página. */
export function generateMetadata(): Metadata {
  return kycEnabled() ? { title: "Verificación de identidad", robots: { index: false, follow: false } } : { robots: { index: false, follow: false } };
}
export const dynamic = "force-dynamic";

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminIdentidadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!kycEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return <AdminDenied next="/admin/identidad" />;
  const sp = await searchParams;
  const filter = firstParam(sp.estado);
  const all = listKyc();
  const items = all.filter((item) => !filter || item.status === filter);
  const config = diditConfigured();
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Verificación de identidad</h1>
        <p>Cédula + prueba de vida + rostro, con Didit. No se guardan imágenes en Carga360go: el detalle está en business.didit.me. Horas en Chile.</p>
      </div>
      <AdminNav current="/admin/identidad" />
      {!config.apiKey || !config.workflow || !config.webhookSecret ? (
        <div className="notice" style={{ marginBottom: 12 }}>
          Falta configurar en el servidor: {[!config.apiKey && "DIDIT_API_KEY", !config.workflow && "DIDIT_WORKFLOW_ID", !config.webhookSecret && "DIDIT_WEBHOOK_SECRET"].filter(Boolean).join(", ")}.
        </div>
      ) : null}
      <div className="admin-nav">
        <a href="/admin/identidad" className={!filter ? "on" : ""}>
          Todas ({all.length})
        </a>
        {KYC_STATUSES.map((status) => (
          <a key={status} href={`/admin/identidad?estado=${status}`} className={filter === status ? "on" : ""}>
            {KYC_STATUS_LABELS[status]} ({all.filter((item) => item.status === status).length})
          </a>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="empty">Sin cuentas en este estado.</div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Estado</th>
                <th>Leído de la cédula</th>
                <th>Alertas</th>
                <th>Actualizado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.userId} className={item.status === "en_revision" || item.runMatchesAccount === false ? "row-alert" : item.status === "rechazado" ? "row-bad" : ""}>
                  <td>
                    <strong>{item.razonSocial}</strong>
                    <div className="meta">
                      {roleLabel(item.role as Role)} · RUT {formatRut(item.rut)} · {item.contactName} · {item.email}
                    </div>
                  </td>
                  <td>
                    {KYC_STATUS_LABELS[item.status]}
                    <div className="meta">
                      Intentos: {item.attempts}
                      {item.decidedBy ? ` · decidió: ${item.decidedBy.startsWith("admin:") ? "administrador" : "Didit"}` : ""}
                    </div>
                    {item.adminNote ? <div className="meta">Nota: {item.adminNote}</div> : null}
                  </td>
                  <td>
                    {item.documentName ?? "—"}
                    <div className="meta">
                      {item.documentRun ? `RUN ${formatRut(item.documentRun)}` : ""}
                      {item.runMatchesAccount === true ? " · coincide con el RUT de la cuenta" : ""}
                      {item.runMatchesAccount === false ? " · distinto al RUT de la cuenta (revisar si es RUT de empresa)" : ""}
                    </div>
                  </td>
                  <td className="meta">{item.warnings.length ? item.warnings.join(", ") : "—"}</td>
                  <td className="meta">
                    {when(item.updatedAt)}
                    {item.sessionId ? <div>Sesión {item.sessionId.slice(0, 8)}…</div> : null}
                  </td>
                  <td>
                    <AdminKycActions userId={item.userId} status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
