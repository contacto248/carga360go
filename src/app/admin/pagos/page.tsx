import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDenied } from "@/components/AdminDenied";
import { AdminNav } from "@/components/AdminNav";
import { AdminPaymentActions } from "@/components/AdminPayments";
import { getCurrentUser } from "@/lib/current-user";
import { firstParam, formatClp } from "@/lib/format";
import { configStatus, paymentsEnabled } from "@/lib/pagos/config";
import { adminCounts, adminEvents, adminList } from "@/lib/pagos/service";
import { FREIGHT_STATUS_LABEL, FREIGHT_STATUSES, INSTALLMENT_STATUS_LABEL, isFreightStatus } from "@/lib/pagos/state";

export const metadata: Metadata = { title: "Pagos", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }) : "—";
}

export default async function AdminPagosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!paymentsEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return <AdminDenied next="/admin/pagos" />;
  const sp = await searchParams;
  const estado = firstParam(sp.estado);
  const rows = adminList(isFreightStatus(estado) ? { status: estado } : {});
  const counts = adminCounts();
  const config = configStatus();
  const events = adminEvents(null, 50);
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Pagos de fletes (Mercado Pago)</h1>
        <p>
          Entorno: <strong>{config.env === "production" ? "producción" : "prueba"}</strong>. Horas en Chile. No se muestran tokens.
        </p>
      </div>
      <AdminNav current="/admin/pagos" />
      {config.missing.length ? <div className="card">Variables sin configurar: {config.missing.join(", ")}</div> : null}
      <div className="card">
        Saldo pendiente: {counts.saldoPendiente} · Ventanas por vencer (24 h): {counts.ventanasPorVencer} · Disputas abiertas: {counts.disputasAbiertas} ·
        Reembolsos fallidos: {counts.reembolsosFallidos} ·{" "}
        <span style={counts.firmasInvalidas24h ? { color: "#b00020", fontWeight: 700 } : undefined}>Webhooks con firma inválida (24 h): {counts.firmasInvalidas24h}</span>
      </div>
      <div className="admin-nav">
        <a href="/admin/pagos" className={!estado ? "on" : ""}>
          Todos
        </a>
        {FREIGHT_STATUSES.map((status) => (
          <a key={status} href={`/admin/pagos?estado=${status}`} className={estado === status ? "on" : ""}>
            {FREIGHT_STATUS_LABEL[status]}
          </a>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="empty">Sin fletes con pago en plataforma.</div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Creado</th>
                <th>Carga</th>
                <th>Partes</th>
                <th>Flete</th>
                <th>Cuotas</th>
                <th>Estado</th>
                <th>Cuenta MP transp.</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((fp) => (
                <tr key={fp.id}>
                  <td>{fmt(fp.createdAt)}</td>
                  <td>
                    <a href={`/cargas/${fp.loadId}`}>{fp.route}</a>
                  </td>
                  <td>
                    {fp.shipperName} → {fp.truckerName}
                  </td>
                  <td>${formatClp(fp.grossAmount)}</td>
                  <td>
                    {fp.installments.map((inst) => (
                      <div key={inst.kind}>
                        {inst.kind}: ${formatClp(inst.chargedAmount)} · {INSTALLMENT_STATUS_LABEL[inst.status]}
                        {inst.mpPaymentId ? ` · MP ${inst.mpPaymentId}` : ""}
                      </div>
                    ))}
                  </td>
                  <td>
                    {FREIGHT_STATUS_LABEL[fp.status]}
                    {fp.openDispute ? " · disputa abierta" : ""}
                    {fp.disputeWindowEndsAt ? <div className="muted">Ventana: {fmt(fp.disputeWindowEndsAt)}</div> : null}
                  </td>
                  <td>{fp.truckerAccountUsable ? "Activa" : "No usable"}</td>
                  <td>
                    <AdminPaymentActions id={fp.id} status={fp.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>Últimos eventos de Mercado Pago</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tópico</th>
              <th>Recurso</th>
              <th>Firma</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{fmt(event.created_at)}</td>
                <td>
                  {event.topic}
                  {event.action ? ` (${event.action})` : ""}
                </td>
                <td>{event.provider_resource_id ?? "—"}</td>
                <td>{event.signature_valid ? "válida" : "inválida"}</td>
                <td>
                  {event.result}
                  {event.error ? ` · ${event.error}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
