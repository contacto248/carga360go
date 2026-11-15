"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Contacto de respaldo (teléfono chileno o correo) mientras la verificación esté pendiente.
 * El servidor valida el formato y que sea distinto del contacto principal (PATCH /api/cuenta).
 */
export function BackupContactForm({ current, required }: { current: string | null; required: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaved("");
    if (!value.trim()) return setError("Escribe un teléfono o un correo de respaldo.");
    setPending(true);
    const response = await fetch("/api/cuenta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backupContact: value }),
    });
    setPending(false);
    const data = (await response.json().catch(() => null)) as { error?: string; backupContact?: { display: string } } | null;
    if (!response.ok) return setError(data?.error || "No se pudo guardar.");
    setSaved(data?.backupContact?.display ?? value);
    setValue("");
    router.refresh();
  }

  return (
    <form className="card" id="contacto-respaldo" onSubmit={onSubmit} style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>Contacto de respaldo {required ? "*" : ""}</h3>
      <p className="meta" style={{ marginTop: 0 }}>
        Mientras tu verificación esté pendiente (correo, teléfono o documentos), déjanos otro teléfono o correo para ubicarte si no
        alcanzas a terminar la inscripción. Debe ser distinto de tu correo y WhatsApp principales. Solo lo ve el equipo de Carga360go.
      </p>
      {current ? <p className="okmsg">✓ Respaldo registrado: {current}</p> : null}
      {required && !current ? (
        <p className="err" role="alert">
          Falta tu contacto de respaldo.
        </p>
      ) : null}
      <div className="row">
        <input
          aria-label="Teléfono o correo de respaldo"
          placeholder="+56 9 XXXX XXXX o correo@ejemplo.cl"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          style={{ maxWidth: 320 }}
        />
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Guardando…" : current ? "Cambiar respaldo" : "Guardar respaldo"}
        </button>
      </div>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? <p className="okmsg">✓ Guardado: {saved}</p> : null}
    </form>
  );
}
