import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isEnabled } from "@/lib/ops/flags";
import { readTracking } from "@/lib/ops/tracking";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Seguimiento",
  robots: { index: false, follow: false },
};

const ALERT_LABEL = { atraso: "Atraso", detencion: "Detención", sin_senal: "Sin señal" } as const;

/** El 404 HTTP con el flag apagado lo pone el middleware, antes de esta página. */
export default async function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  if (!isEnabled("OPS_FEATURE_ENABLED")) notFound();
  const { token } = await params;
  let view;
  try {
    view = readTracking(token);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Seguimiento</h1>
        <p>
          {view.origin ?? "Origen"} → {view.destination ?? "Destino"}
        </p>
      </div>
      <section className="card">
        <p>Etapa: {view.stage}</p>
        {view.position ? (
          <p>
            Última posición: {view.position.lat}, {view.position.lng}
          </p>
        ) : (
          <p className="meta">Todavía no hay una posición.</p>
        )}
        <p>{view.etaAt ? `Llegada estimada: ${view.etaAt}` : "Sin hora estimada."}</p>
        <p className="meta">La estimación usa perfil de auto (OSRM), no un perfil de camión.</p>
        {view.alerts.length ? (
          <ul>
            {view.alerts.map((alert) => (
              <li key={alert.kind}>{ALERT_LABEL[alert.kind]}</li>
            ))}
          </ul>
        ) : (
          <p className="meta">Sin alertas abiertas.</p>
        )}
      </section>
    </div>
  );
}
