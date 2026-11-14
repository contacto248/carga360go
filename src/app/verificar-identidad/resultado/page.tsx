import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { firstParam } from "@/lib/format";
import { kycEnabled } from "@/lib/kyc/config";
import { kycOf, KYC_STATUS_LABELS, syncFromProvider } from "@/lib/kyc/service";

/** Con el flag apagado ni el título revela la página. */
export function generateMetadata(): Metadata {
  return kycEnabled() ? { title: "Resultado de la verificación", robots: { index: false, follow: false } } : { robots: { index: false, follow: false } };
}
export const dynamic = "force-dynamic";

/**
 * Página a la que Didit devuelve a la persona (callback). Los parámetros de la URL (status) NO se creen:
 * el estado se consulta al proveedor del lado del servidor y, además, llega por el webhook firmado.
 */
export default async function ResultadoIdentidadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!kycEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Verificación enviada</h1>
          <p>Ingresa a tu cuenta para ver el resultado.</p>
          <Link className="btn" href="/ingreso?next=/verificar-identidad">
            Ingresar
          </Link>
        </div>
      </div>
    );
  }
  const sp = await searchParams;
  const sessionId = firstParam(sp.verificationSessionId);
  const kyc = sessionId ? await syncFromProvider(user, sessionId) : kycOf(user.id);
  const text =
    kyc.status === "aprobado"
      ? "¡Listo! Tu identidad quedó verificada."
      : kyc.status === "rechazado"
        ? "La verificación no se aprobó. Puedes intentarlo de nuevo desde la página de verificación."
        : kyc.status === "en_revision"
          ? "Tu verificación quedó en revisión manual. Te avisaremos cuando termine."
          : "Estamos esperando el resultado. Puede tardar unos minutos; recarga esta página o vuelve a tu panel.";
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="card">
        <h1>{KYC_STATUS_LABELS[kyc.status]}</h1>
        <p>{text}</p>
        <div className="row">
          <Link className="btn" href="/verificar-identidad">
            Ver mi verificación
          </Link>
          <Link className="btn sec" href="/panel">
            Ir a mi panel
          </Link>
        </div>
      </div>
    </div>
  );
}
