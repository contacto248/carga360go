"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatClp } from "@/lib/format";
import type { AccountView, FreightView } from "@/lib/pagos/service";
import { FREIGHT_STATUS_LABEL, INSTALLMENT_STATUS_LABEL } from "@/lib/pagos/state";

type Props = {
  role: "transportista" | "mandante";
  account: AccountView | null;
  fletes: FreightView[];
  flash: string | null;
};

type Estimate = {
  kind: "anticipo" | "saldo";
  percent: number;
  netAmount: number;
  vatAmount: number;
  baseAmount: number;
  estimatedFeeAmount: number;
  chargedAmount: number;
  feePayer: "shipper" | "trucker";
  feeRateEstimate: number;
  note: string;
};

const DISCLAIMER =
  "Estás pagando a través de Mercado Pago. El flete se acredita en la cuenta del transportista. Carga360go no custodia ese dinero ni es el porteador. Este flujo está en prueba y no está habilitado para el público.";
const POLICY_HREF = "/politica-de-pagos";

const REASONS: [string, string][] = [
  ["no_entregada", "No se entregó"],
  ["danos", "Carga con daños"],
  ["faltante", "Faltante"],
  ["retraso", "Retraso grave"],
  ["cobro_incorrecto", "Cobro incorrecto"],
  ["otro", "Otro"],
];

async function call(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "No se pudo completar la acción.");
  return data;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short" });
}

/** Reclamo: en tránsito, o después del POD mientras la ventana siga abierta, sin otro reclamo abierto. */
function disputeAllowed(fp: FreightView): boolean {
  if (fp.openDispute) return false;
  if (fp.status === "en_transito") return true;
  return fp.status === "entregada_POD" && !!fp.disputeWindowEndsAt && new Date(fp.disputeWindowEndsAt).getTime() > Date.now();
}

export function PaymentsPanel({ role, account, fletes, flash }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{ id: string; data: Estimate } | null>(null);
  const [podFor, setPodFor] = useState<string | null>(null);
  const [disputeFor, setDisputeFor] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error.");
    } finally {
      setBusy(false);
    }
  }

  const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  return (
    <div>
      <div className="card" role="note" style={{ borderLeft: "4px solid #f0b400" }}>
        <p style={{ margin: 0 }}>
          {DISCLAIMER}{" "}
          <a href={POLICY_HREF} target="_blank" rel="noopener noreferrer">
            Lee la Política de Pagos
          </a>
          .
        </p>
      </div>
      {flash ? <div className="card">{flash}</div> : null}
      {error ? (
        <div className="card" role="alert" style={{ color: "#b00020" }}>
          {error}
        </div>
      ) : null}

      {role === "transportista" && account ? (
        <div className="card">
          <h3>Mercado Pago</h3>
          <p>
            Estado:{" "}
            <strong>
              {account.status === "sin_conectar"
                ? "No conectado"
                : account.status === "active"
                  ? "Activo"
                  : account.status === "renewal_failed"
                    ? "Renovación fallida: vuelve a conectar"
                    : account.status === "revoked"
                      ? "Desconectado: vuelve a conectar"
                      : "Pendiente"}
            </strong>
            {account.mpUserIdMasked ? ` · cuenta ${account.mpUserIdMasked}` : ""}
            {account.expiresAt ? ` · vence ${fmtDate(account.expiresAt)}` : ""}
          </p>
          {account.expiresSoon ? <p className="muted">Tu autorización vence en menos de 30 días; se renovará sola o te pediremos reconectar.</p> : null}
          <p className="muted">
            El flete se acredita en <strong>tu</strong> cuenta de Mercado Pago; Carga360go no recibe ese dinero. Si no tienes cuenta, puedes crearla en el
            mismo paso.
          </p>
          <div className="row">
            <a className="btn" href="/api/pagos/mercadopago/oauth/start">
              {account.status === "active" ? "Volver a conectar Mercado Pago" : "Conectar Mercado Pago"}
            </a>
            {account.status === "active" ? (
              <button
                className="btn ghost"
                disabled={busy}
                onClick={() => run(async () => (await call("/api/pagos/cuenta/desconectar", { method: "POST" }), router.refresh()))}
              >
                Desconectar
              </button>
            ) : null}
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            <input
              type="checkbox"
              checked={account.taxReady}
              disabled={busy}
              onChange={(event) => run(async () => (await call("/api/pagos/cuenta/tax-ready", json({ value: event.target.checked })), router.refresh()))}
            />{" "}
            Declaro que puedo emitir factura o boleta por el flete (tengo inicio de actividades en el{" "}
            <a href="https://www.sii.cl" target="_blank" rel="noopener noreferrer">
              SII
            </a>
            ). El transportista factura el flete al mandante.
          </label>
        </div>
      ) : null}

      <h2>Fletes</h2>
      {fletes.length === 0 ? (
        <div className="empty">Aún no tienes cargas adjudicadas con pago en plataforma.</div>
      ) : (
        fletes.map((fp) => {
          const anticipo = fp.installments.find((item) => item.kind === "anticipo");
          const saldo = fp.installments.find((item) => item.kind === "saldo");
          return (
            <div className="card" key={fp.id}>
              <h3>{fp.route}</h3>
              <p>
                <span className="pill">{FREIGHT_STATUS_LABEL[fp.status]}</span> · {role === "mandante" ? `Transportista: ${fp.truckerName}` : `Mandante: ${fp.shipperName}`}
              </p>
              <table className="tbl">
                <tbody>
                  <tr>
                    <td>Flete pactado</td>
                    <td>${formatClp(fp.grossAmount)}</td>
                  </tr>
                  {[anticipo, saldo].map((inst) =>
                    inst ? (
                      <tr key={inst.kind}>
                        <td>
                          {inst.kind === "anticipo" ? `Anticipo (${fp.anticipoPercent} %)` : `Saldo (${100 - fp.anticipoPercent} %)`}
                        </td>
                        <td>
                          ${formatClp(inst.baseAmount)} · {INSTALLMENT_STATUS_LABEL[inst.status]}
                        </td>
                      </tr>
                    ) : null,
                  )}
                  {fp.disputeWindowEndsAt ? (
                    <tr>
                      <td>Plazo para reclamos</td>
                      <td>{fmtDate(fp.disputeWindowEndsAt)} (hora de Chile)</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              {role === "mandante" ? (
                <div className="row">
                  {(fp.status === "adjudicada" && anticipo && ["pendiente", "preferencia_creada", "rejected"].includes(anticipo.status)) ||
                  (fp.status === "entregada_POD" && saldo && ["pendiente", "preferencia_creada", "rejected"].includes(saldo.status)) ? (
                    fp.truckerAccountUsable ? (
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const kind = fp.status === "adjudicada" ? "anticipo" : "saldo";
                            const data = await call(`/api/pagos/fletes/${fp.id}/estimado?installment=${kind}`);
                            setEstimate({ id: fp.id, data: data.estimado as Estimate });
                          })
                        }
                      >
                        {fp.status === "adjudicada" ? "Pagar anticipo" : "Pagar saldo"}
                      </button>
                    ) : (
                      <span className="muted">El transportista todavía no conecta Mercado Pago.</span>
                    )
                  ) : null}
                  {fp.status === "adjudicada" && anticipo && ["pendiente", "preferencia_creada", "rejected"].includes(anticipo.status) ? (
                    <button
                      className="btn ghost"
                      disabled={busy}
                      onClick={() => {
                        if (
                          !confirm(
                            "¿Cancelar el pago de este flete en la plataforma? Solo se puede antes de pagar el anticipo. No reabre la carga ni cambia la oferta elegida. Esta acción no se puede deshacer.",
                          )
                        )
                          return;
                        run(async () => (await call(`/api/pagos/fletes/${fp.id}/cancelar`, json({ confirm: true })), router.refresh()));
                      }}
                    >
                      Cancelar pago del flete
                    </button>
                  ) : null}
                  {disputeAllowed(fp) ? (
                    <button className="btn ghost" disabled={busy} onClick={() => setDisputeFor(disputeFor === fp.id ? null : fp.id)}>
                      Abrir reclamo
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="row">
                  {fp.status === "anticipo_pagado" ? (
                    <button
                      className="btn ghost"
                      disabled={busy}
                      onClick={() => run(async () => (await call(`/api/pagos/fletes/${fp.id}/en-transito`, { method: "POST" }), router.refresh()))}
                    >
                      Marcar en tránsito
                    </button>
                  ) : null}
                  {fp.status === "anticipo_pagado" || fp.status === "en_transito" ? (
                    <button className="btn" disabled={busy} onClick={() => setPodFor(podFor === fp.id ? null : fp.id)}>
                      Subir POD
                    </button>
                  ) : null}
                  {disputeAllowed(fp) ? (
                    <button className="btn ghost" disabled={busy} onClick={() => setDisputeFor(disputeFor === fp.id ? null : fp.id)}>
                      Abrir reclamo
                    </button>
                  ) : null}
                </div>
              )}

              {estimate?.id === fp.id ? (
                <div className="cost-box" style={{ marginTop: 12 }}>
                  <p>
                    <strong>{estimate.data.kind === "anticipo" ? "Anticipo" : "Saldo"}</strong> ({estimate.data.percent} %): ${formatClp(estimate.data.baseAmount)}
                  </p>
                  {estimate.data.vatAmount > 0 ? <p>Flete neto ${formatClp(estimate.data.netAmount)} + IVA ${formatClp(estimate.data.vatAmount)}</p> : null}
                  <p>
                    Costo estimado del medio de pago ({(estimate.data.feeRateEstimate * 100).toFixed(2)} % + IVA):{" "}
                    {estimate.data.feePayer === "shipper" ? `$${formatClp(estimate.data.estimatedFeeAmount)}` : "lo descuenta Mercado Pago al transportista"}
                  </p>
                  <p>
                    <strong>Total a pagar: ${formatClp(estimate.data.chargedAmount)}</strong>
                  </p>
                  <p className="muted">
                    {estimate.data.note} El transportista emite la factura del flete. Al continuar aceptas la{" "}
                    <a href={POLICY_HREF} target="_blank" rel="noopener noreferrer">
                      Política de Pagos
                    </a>
                    .
                  </p>
                  <div className="row">
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const data = await call(`/api/pagos/fletes/${fp.id}/checkout`, json({ installment: estimate.data.kind }));
                          window.location.href = String(data.url);
                        })
                      }
                    >
                      Ir a Mercado Pago
                    </button>
                    <button className="btn ghost" onClick={() => setEstimate(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}

              {podFor === fp.id ? (
                <form
                  style={{ marginTop: 12 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    run(async () => {
                      await call(`/api/pagos/fletes/${fp.id}/pod`, { method: "POST", body: form });
                      setPodFor(null);
                      router.refresh();
                    });
                  }}
                >
                  <label>
                    Foto del documento de recepción firmado
                    <input type="file" name="foto_documento" accept="image/jpeg,image/png,image/webp,application/pdf" required multiple />
                  </label>
                  <label>
                    Firma de quien recibió (opcional si está en la foto)
                    <input type="file" name="firma" accept="image/jpeg,image/png,image/webp" />
                  </label>
                  <label>
                    <input type="checkbox" name="firma_en_foto" value="1" /> La firma está en la foto del documento
                  </label>
                  <button className="btn" disabled={busy}>
                    Enviar POD
                  </button>
                </form>
              ) : null}

              {disputeFor === fp.id ? (
                <form
                  style={{ marginTop: 12 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    run(async () => {
                      await call(`/api/pagos/fletes/${fp.id}/disputas`, json({ reason: form.get("reason"), comment: form.get("comment") }));
                      setDisputeFor(null);
                      router.refresh();
                    });
                  }}
                >
                  <label>
                    Motivo
                    <select name="reason" required>
                      {REASONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Comentario
                    <textarea name="comment" maxLength={1000} rows={3} />
                  </label>
                  <button className="btn" disabled={busy}>
                    Enviar reclamo
                  </button>
                </form>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
