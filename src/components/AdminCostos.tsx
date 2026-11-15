"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Field = { key: string; label: string; unit: string; kind: "number" | "boolean" | "enum"; options?: string[]; value: number | boolean | string; help: string };

/** Formulario de parámetros del motor (solo administración). Cada cambio queda en la auditoría con valor anterior y nuevo. */
export function CostParamsForm({ fields }: { fields: Field[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, typeof f.value === "boolean" ? f.value : String(f.value)])),
  );
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setMessage("");
    const cambios: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.key];
      const original = typeof f.value === "boolean" ? f.value : String(f.value);
      if (v !== original) cambios[f.key] = f.kind === "number" ? Number(String(v).replace(",", ".")) : v;
    }
    const response = await fetch("/api/admin/costos/parametros", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cambios }) });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(data.error || "No se pudo guardar.");
    setMessage(data.changed?.length ? `Guardado: ${data.changed.length} cambio(s), registrados en la auditoría.` : "Sin cambios.");
    router.refresh();
  }

  return (
    <div>
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.key} className="f" title={f.help}>
            {f.label} {f.unit ? <small className="meta">({f.unit})</small> : null}
            {f.kind === "boolean" ? (
              <select value={values[f.key] ? "1" : "0"} onChange={(e) => setValues({ ...values, [f.key]: e.target.value === "1" })}>
                <option value="1">Sí</option>
                <option value="0">No</option>
              </select>
            ) : f.kind === "enum" ? (
              <select value={String(values[f.key])} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input inputMode="decimal" value={String(values[f.key])} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      <button className="btn" type="button" disabled={pending} onClick={save}>
        Guardar parámetros
      </button>
      {message ? <p className="meta" role="status">{message}</p> : null}
    </div>
  );
}

export function QuoteStatusActions({ id, status, complete }: { id: string; status: string; complete: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const next: Record<string, string[]> = { borrador: ["revisada", "descartada"], revisada: ["enviada", "descartada", "borrador"], enviada: ["descartada"], descartada: ["borrador"] };
  async function set(estado: string) {
    setMessage("");
    const response = await fetch(`/api/admin/costos/cotizaciones/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado, nota: note }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(data.error || "No se pudo cambiar el estado.");
    router.refresh();
  }
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      <input placeholder="Nota de revisión (opcional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      {(next[status] ?? []).map((s) => (
        <button key={s} className="btn sec sm" type="button" disabled={s === "enviada" && !complete} onClick={() => set(s)}>
          Marcar {s}
        </button>
      ))}
      {message ? <span className="error">{message}</span> : null}
    </div>
  );
}

export function RefreshSourcesButton() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function run() {
    setPending(true);
    const response = await fetch("/api/admin/costos/refrescar", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    setMessage(response.ok ? `Listo: diésel ${data.diesel?.map((d: { result: string }) => d.result).join(", ")}; peajes revisados ${data.tolls?.length ?? 0}.` : data.error || "Error.");
    router.refresh();
  }
  return (
    <span>
      <button className="btn sec sm" type="button" disabled={pending} onClick={run}>
        {pending ? "Consultando fuentes…" : "Actualizar fuentes ahora"}
      </button>{" "}
      {message ? <span className="meta">{message}</span> : null}
    </span>
  );
}
