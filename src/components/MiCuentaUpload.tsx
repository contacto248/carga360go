"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { DOCUMENTOS_POR_CLIENTE, type TipoCliente } from "@/lib/bassam/tipos-cliente";
import styles from "./mi-cuenta.module.css";

export function MiCuentaUpload({ cliente, puedeSubir }: { cliente: TipoCliente; puedeSubir: boolean }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  async function send(form: HTMLFormElement) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/mi-cuenta/documento", { method: "POST", body: new FormData(form) });
      const data = (await response.json().catch(() => null)) as { error?: string; comentarioIa?: string; estadoAdmin?: string } | null;
      if (!response.ok) setError(data?.error || "No se pudo guardar el documento.");
      else {
        setMessage(`${data?.comentarioIa || "Sin datos"} Estado: ${data?.estadoAdmin === "aprobado" ? "Acreditado" : "En revisión"}.`);
        form.reset();
        setFileName("");
      }
    } catch {
      setError("No hay conexión.");
    }
    setBusy(false);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!puedeSubir) {
      setError("Ingresa con una cuenta de transportista o mandante para subir.");
      return;
    }
    void send(event.currentTarget);
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    const input = event.currentTarget.elements.namedItem("file");
    if (!file || !(input instanceof HTMLInputElement)) return;
    const data = new DataTransfer();
    data.items.add(file);
    input.files = data.files;
    setFileName(file.name);
  }

  return (
    <form className={styles.drop} onSubmit={onSubmit} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <p>Arrastra el archivo aquí o elígelo. La lectura no aprueba el documento.</p>
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
        <input
          name="file"
          type="file"
          required
          accept="application/pdf,image/jpeg,image/png,text/plain"
          style={{ display: "block", width: "100%" }}
          onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name || "")}
        />
      </label>
      {fileName ? <p>Archivo listo: {fileName}</p> : null}
      <button className="btn" type="submit" disabled={busy} style={{ minHeight: 48 }}>
        {busy ? "Guardando…" : "Subir documento"}
      </button>
      {message ? <p>{message}</p> : null}
      {error ? <p>{error}</p> : null}
    </form>
  );
}
