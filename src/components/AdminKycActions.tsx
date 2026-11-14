"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Acciones del administrador sobre la verificación de identidad de una cuenta. */
export function AdminKycActions({ userId, status }: { userId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(next: "aprobado" | "rechazado" | "reiniciar") {
    let note: string | null = null;
    if (next === "rechazado") {
      note = window.prompt("Motivo del rechazo (lo verá el equipo en la auditoría):");
      if (!note) return;
    } else if (!window.confirm(next === "aprobado" ? "¿Aprobar la identidad a mano?" : "¿Permitir un nuevo intento de verificación?")) {
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch(`/api/admin/identidad/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, note }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) setError(data?.error || "No se pudo guardar.");
    else router.refresh();
  }

  return (
    <div className="row" style={{ gap: 6 }}>
      {status !== "aprobado" ? (
        <button className="btn sec" type="button" disabled={busy} onClick={() => act("aprobado")}>
          Aprobar
        </button>
      ) : null}
      {status !== "rechazado" ? (
        <button className="btn sec" type="button" disabled={busy} onClick={() => act("rechazado")}>
          Rechazar
        </button>
      ) : null}
      <button className="btn sec" type="button" disabled={busy} onClick={() => act("reiniciar")}>
        Nuevo intento
      </button>
      {error ? <span className="meta" style={{ color: "#991b1b" }}>{error}</span> : null}
    </div>
  );
}
