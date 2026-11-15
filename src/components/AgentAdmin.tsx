"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUS_LABEL: Record<string, string> = { nuevo: "Nuevo", en_gestion: "En gestión", cerrado: "Cerrado", descartado: "Descartado" };

async function patch(body: unknown): Promise<string | null> {
  const response = await fetch("/api/admin/agente", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (response.ok) return null;
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error || "No se pudo guardar.";
}

export function AgentToggles({ enabled, whatsappEnabled }: { enabled: boolean; whatsappEnabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(body: unknown) {
    setBusy(true);
    setError("");
    const err = await patch(body);
    setBusy(false);
    if (err) setError(err);
    else router.refresh();
  }
  return (
    <div className="row" style={{ margin: "8px 0" }}>
      <button type="button" className={`btn sm ${enabled ? "danger" : ""}`} disabled={busy} onClick={() => run({ enabled: !enabled })}>
        {enabled ? "Apagar el asistente en la web" : "Encender el asistente en la web"}
      </button>
      <button type="button" className={`btn sm ${whatsappEnabled ? "danger" : "sec"}`} disabled={busy} onClick={() => run({ whatsappEnabled: !whatsappEnabled })}>
        {whatsappEnabled ? "Quitar el flujo del agente en WhatsApp" : "Usar el flujo del agente en WhatsApp"}
      </button>
      {error ? <span className="err">{error}</span> : null}
    </div>
  );
}

export function LeadStatusSelect({ leadId, status }: { leadId: string; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [error, setError] = useState("");
  return (
    <>
      <select
        aria-label="Estado de la solicitud"
        value={value}
        onChange={async (event) => {
          const next = event.target.value;
          setValue(next);
          const err = await patch({ leadId, status: next });
          if (err) {
            setError(err);
            setValue(status);
          } else router.refresh();
        }}
        style={{ minHeight: 34, padding: "4px 8px" }}
      >
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      {error ? <span className="err">{error}</span> : null}
    </>
  );
}
