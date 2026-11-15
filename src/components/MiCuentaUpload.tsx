"use client";

import { useState, type FormEvent } from "react";
import { DOCUMENTOS_POR_CLIENTE, type TipoCliente } from "@/lib/bassam/tipos-cliente";

export function MiCuentaUpload({ cliente }: { cliente: TipoCliente }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const body = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/mi-cuenta/documento", { method: "POST", body });
      const data = (await response.json().catch(() => null)) as { error?: string; comentarioIa?: string; estadoAdmin?: string } | null;
      if (!response.ok) setError(data?.error || "No se pudo guardar el documento.");
      else setMessage(`${data?.comentarioIa || "sin datos"} Estado administrativo: ${data?.estadoAdmin || "pendiente_ok"}.`);
    } catch {
      setError("No hay conexión.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ display: "grid", gap: 12 }}>
      <label>
        Tipo de documento
        <select name="tipo" required style={{ display: "block", width: "100%", minHeight: 44 }}>
          {DOCUMENTOS_POR_CLIENTE[cliente].map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Archivo
        <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,text/plain" style={{ display: "block", width: "100%" }} />
      </label>
      <button className="btn" type="submit" disabled={busy} style={{ minHeight: 48 }}>
        {busy ? "Guardando…" : "Subir documento"}
      </button>
      {message ? <p>{message}</p> : null}
      {error ? <p>{error}</p> : null}
    </form>
  );
}
