"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Confirma la propuesta por la API. No adjudica desde el navegador ni envía mensajes. */
export function ConfirmacionAsignacion({ runId, candidateId }: { runId: string; candidateId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setMsg(null);
        void fetch(`/api/ops/asignacion/${runId}/confirmar`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ candidateId }),
        })
          .then(async (response) => {
            const data = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) throw new Error(data.error ?? "No se pudo confirmar.");
            router.refresh();
          })
          .catch((error: unknown) => setMsg(error instanceof Error ? error.message : "No se pudo confirmar."))
          .finally(() => setBusy(false));
      }}
    >
      <button className="btn sm" disabled={busy} type="submit">
        Confirmar
      </button>
      {msg ? <span className="err">{msg}</span> : null}
    </form>
  );
}
