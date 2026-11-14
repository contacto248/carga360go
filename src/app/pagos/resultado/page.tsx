import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { firstParam } from "@/lib/format";
import { paymentsEnabled } from "@/lib/pagos/config";

export const metadata: Metadata = { title: "Resultado del pago", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Vuelta desde Checkout Pro. El query string NO confirma nada: el estado oficial llega por webhook + GET del pago.
 */
export default async function ResultadoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!paymentsEnabled()) notFound();
  const sp = await searchParams;
  const status = firstParam(sp.status);
  const text =
    status === "success"
      ? "Mercado Pago informó que el pago se procesó."
      : status === "pending"
        ? "El pago quedó pendiente en Mercado Pago."
        : "El pago no se completó. Puedes intentarlo de nuevo desde Mis pagos.";
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="card">
        <h1>Resultado del pago</h1>
        <p>{text}</p>
        <p className="muted">La confirmación definitiva llega cuando Mercado Pago nos notifica. Revisa el estado en Mis pagos en unos minutos.</p>
        <Link className="btn" href="/panel/pagos">
          Ir a Mis pagos
        </Link>
        <p className="meta">
          <Link href="/politica-de-pagos">Política de Pagos</Link>
        </p>
      </div>
    </div>
  );
}
