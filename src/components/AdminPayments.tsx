"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw new Error(data.message ?? "No se pudo completar la acción.");
}

/** Acciones de administrador sobre un flete: resolver disputa, reembolsar o cancelar. Todo queda en auditoría. */
export function AdminPaymentActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run(url: string, body: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      await post(url, body);
      router.refresh();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Error.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const action = String(form.get("action"));
        const note = String(form.get("note") ?? "");
        const installment = String(form.get("installment"));
        const amount = form.get("amount") ? Number(form.get("amount")) : null;
        if (action === "cancelar") return run(`/api/pagos/admin/fletes/${id}/cancelar`, { note });
        if (action === "reembolsar") return run(`/api/pagos/admin/fletes/${id}/reembolsar`, { installment, amount });
        return run(`/api/pagos/admin/fletes/${id}/resolver`, { decision: action, note, installment, amount });
      }}
      style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
    >
      <select name="action" defaultValue={status === "en_disputa" ? "liberar" : "reembolsar"}>
        <option value="liberar">Resolver: liberar saldo</option>
        <option value="reembolso_total">Resolver: reembolso total</option>
        <option value="reembolso_parcial">Resolver: reembolso parcial</option>
        <option value="reembolsar">Reembolsar cuota</option>
        <option value="cancelar">Cancelar flete</option>
      </select>
      <select name="installment" defaultValue="anticipo">
        <option value="anticipo">Anticipo</option>
        <option value="saldo">Saldo</option>
      </select>
      <input name="amount" type="number" min={1} placeholder="Monto (vacío = total)" style={{ width: 150 }} />
      <input name="note" placeholder="Nota (obligatoria al resolver o cancelar)" style={{ minWidth: 220 }} />
      <button className="btn" disabled={busy}>
        Aplicar
      </button>
      {msg ? <span style={{ color: "#b00020" }}>{msg}</span> : null}
    </form>
  );
}
