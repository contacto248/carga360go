import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentsPanel } from "@/components/PaymentsPanel";
import { getCurrentUser } from "@/lib/current-user";
import { firstParam } from "@/lib/format";
import { paymentsEnabled } from "@/lib/pagos/config";
import { accountView, listForUser } from "@/lib/pagos/service";

export const metadata: Metadata = { title: "Mis pagos", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  mp_cancelado: "Cancelaste la conexión con Mercado Pago.",
  sesion: "Tu sesión expiró. Ingresa de nuevo y vuelve a conectar.",
  state: "El enlace de conexión no es válido o ya se usó. Intenta de nuevo.",
  sin_codigo: "Mercado Pago no devolvió la autorización. Intenta de nuevo.",
  intercambio: "No pudimos completar la conexión con Mercado Pago. Intenta de nuevo.",
};

/** Solo existe con PAYMENTS_FEATURE_ENABLED=true; con el flag apagado responde 404. */
export default async function PagosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!paymentsEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user || (user.role !== "transportista" && user.role !== "mandante")) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Mis pagos</h1>
          <p>Ingresa con tu cuenta de transportista o mandante.</p>
          <Link className="btn" href="/ingreso?next=/panel/pagos">
            Ingresar
          </Link>
        </div>
      </div>
    );
  }
  const sp = await searchParams;
  const flash = firstParam(sp.conectado) === "1" ? "Mercado Pago quedó conectado." : ERRORS[firstParam(sp.error)] ?? null;
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Mis pagos</h1>
        <p>Pago del flete a través de Mercado Pago (modo prueba).</p>
      </div>
      <PaymentsPanel role={user.role} account={user.role === "transportista" ? accountView(user.id) : null} fletes={listForUser(user)} flash={flash} />
    </div>
  );
}
