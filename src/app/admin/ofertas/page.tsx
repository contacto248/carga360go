import type { Metadata } from "next";
import Link from "next/link";
import { AdminDenied } from "@/components/AdminDenied";
import { AdminNav } from "@/components/AdminNav";
import { SettingsForm } from "@/components/SettingsForm";
import { getCurrentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { formatClp, formatDateCL } from "@/lib/format";
import { listAllOffers } from "@/lib/offers";
import { OFFER_HOUR_CHOICES, getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Ofertas y ajustes", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { activa: "Activa", aceptada: "✔ Aceptada", rechazada: "No elegida", retirada: "Retirada" };

export default async function AdminOfertasPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return <AdminDenied next="/admin/ofertas" />;
  const offers = listAllOffers();
  const counts = getDb()
    .prepare(`SELECT COALESCE(status, 'abierta') AS s, COUNT(*) AS n FROM loads WHERE is_demo = 0 GROUP BY COALESCE(status, 'abierta')`)
    .all() as { s: string; n: number }[];
  const count = (s: string) => counts.find((row) => row.s === s)?.n ?? 0;
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Ofertas y ajustes</h1>
        <p>Solicitudes de transporte, ofertas de transportistas aprobados y valores por defecto.</p>
      </div>
      <AdminNav current="/admin/ofertas" />
      <div className="grid c4" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="meta">Solicitudes abiertas</div>
          <strong style={{ fontSize: "1.6rem" }}>{count("abierta")}</strong>
        </div>
        <div className="card">
          <div className="meta">Adjudicadas</div>
          <strong style={{ fontSize: "1.6rem" }}>{count("adjudicada")}</strong>
        </div>
        <div className="card">
          <div className="meta">Cerradas sin elegir</div>
          <strong style={{ fontSize: "1.6rem" }}>{count("cerrada")}</strong>
        </div>
        <div className="card">
          <div className="meta">Ofertas (últimas 300)</div>
          <strong style={{ fontSize: "1.6rem" }}>{offers.length}</strong>
        </div>
      </div>
      <SettingsForm initial={getSettings()} choices={OFFER_HOUR_CHOICES} />
      <h2 style={{ marginTop: 22 }}>Historial de ofertas</h2>
      {offers.length === 0 ? (
        <div className="empty">Aún no hay ofertas.</div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Carga</th>
                <th>Transportista</th>
                <th>Precio</th>
                <th>Retiro</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.id}>
                  <td>{new Date(offer.updatedAt).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })}</td>
                  <td>
                    <Link href={`/cargas/${offer.loadId}#ofertas`}>{offer.loadRoute}</Link>
                    <div className="meta">{offer.loadOwnerName}</div>
                  </td>
                  <td>
                    {offer.carrierName}
                    <div className="meta">{offer.carrierEmail}</div>
                  </td>
                  <td>${formatClp(offer.priceClp)}</td>
                  <td>{formatDateCL(offer.pickupDate)}</td>
                  <td>{LABEL[offer.status] ?? offer.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
