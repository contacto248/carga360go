import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDenied } from "@/components/AdminDenied";
import { AdminNav } from "@/components/AdminNav";
import { getCurrentUser } from "@/lib/current-user";
import { formatClp } from "@/lib/format";
import { listAllocationRuns, type AllocationRun } from "@/lib/ops/allocation";
import { isEnabled } from "@/lib/ops/flags";
import { ConfirmacionAsignacion } from "./confirm-button";

export const metadata: Metadata = { title: "Asignación", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const RUN_LABEL: Record<string, string> = {
  propuesta: "Propuesta",
  en_cascada: "En cascada",
  confirmada: "Confirmada",
  agotada: "Agotada",
  cancelada: "Cancelada",
};

function money(value: number | null) {
  return value == null ? "—" : `$${formatClp(value)}`;
}

function openCandidate(run: AllocationRun) {
  return run.status === "propuesta" || run.status === "en_cascada";
}

/** Solo existe con OPS_FEATURE_ENABLED y OPS_ALLOCATION_ENABLED. Apagado ⇒ 404. */
export default async function AsignacionPage() {
  if (!isEnabled("OPS_FEATURE_ENABLED") || !isEnabled("OPS_ALLOCATION_ENABLED")) notFound();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return <AdminDenied next="/admin/ops/asignacion" />;
  const runs = listAllocationRuns(user);
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Asignación</h1>
        <p>El motor deja una propuesta. Una persona confirma. No se envía WhatsApp ni correo.</p>
      </div>
      <AdminNav current="/admin/ops/asignacion" />
      {runs.length === 0 ? (
        <div className="empty">Sin propuestas de asignación.</div>
      ) : (
        runs.map((run) => (
          <section className="card" key={run.id} style={{ marginTop: 12 }}>
            <h2>
              {RUN_LABEL[run.status] ?? run.status} · {run.mode}
            </h2>
            <p className="meta">
              Modo propuesta (dry run). Envío {run.shipmentId.slice(0, 8)}. {run.candidates.length} candidato{run.candidates.length === 1 ? "" : "s"}.
            </p>
            {run.candidates.length === 0 ? (
              <p>Sin candidatos. La propuesta quedó agotada.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Orden</th>
                      <th>Estado</th>
                      <th>Tarifa</th>
                      <th>Puntaje</th>
                      <th>Disponibilidad</th>
                      <th>Motivos</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.candidates.map((candidate) => (
                      <tr key={candidate.id}>
                        <td>{candidate.rank}</td>
                        <td>{candidate.status}</td>
                        <td>{money(candidate.rateClp)}</td>
                        <td>{candidate.score == null ? "—" : Math.round(candidate.score)}</td>
                        <td>{candidate.availability ?? "—"}</td>
                        <td>{candidate.reasons.join(" · ")}</td>
                        <td>
                          {openCandidate(run) && (candidate.status === "propuesto" || candidate.status === "invitado") ? (
                            <ConfirmacionAsignacion candidateId={candidate.id} runId={run.id} />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
