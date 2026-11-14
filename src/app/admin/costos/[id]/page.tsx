import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminDenied } from "@/components/AdminDenied";
import { AdminNav } from "@/components/AdminNav";
import { QuoteStatusActions } from "@/components/AdminCostos";
import { QuoteBreakdown } from "@/components/QuoteBreakdown";
import { getCurrentUser } from "@/lib/current-user";
import { getQuote } from "@/lib/costos/quotes";

export const metadata: Metadata = { title: "Cotización", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return <AdminDenied next="/admin/costos" />;
  const { id } = await params;
  const row = getQuote(id);
  if (!row) notFound();
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Cotización {row.status}</h1>
        <p>
          <Link href="/admin/costos">← Motor de costos</Link> · canal {row.channel} · creada {row.created_at}
          {row.contact ? ` · contacto: ${row.contact}` : ""}
          {row.reviewed_at ? ` · última revisión ${row.reviewed_at} por ${row.reviewed_by_email}` : ""}
          {row.review_note ? ` · nota: ${row.review_note}` : ""}
        </p>
      </div>
      <AdminNav current="/admin/costos" />
      <div className="card" style={{ marginBottom: 12 }}>
        <QuoteStatusActions id={row.id} status={row.status} complete={Boolean(row.complete)} />
      </div>
      <QuoteBreakdown q={row.parsed} />
    </div>
  );
}
