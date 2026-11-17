"use client";

import { useState } from "react";
import { textoReemision } from "@/lib/ops/tracking-message";

/** Pide el enlace. Si ya existe, muestra el aviso y no arma una ruta sin token. */
export function EnlaceSeguimiento({ shipmentId }: { shipmentId: string }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);

  return (
    <div>
      <button
        className="btn sm"
        disabled={busy}
        type="button"
        onClick={() => {
          setBusy(true);
          void fetch(`/api/ops/envios/${shipmentId}/seguimiento`, {
            method: "POST",
            credentials: "same-origin",
            headers: { accept: "application/json", "content-type": "application/json" },
          })
            .then(async (response) => {
              const data = (await response.json().catch(() => null)) as {
                created?: boolean;
                path?: string;
                token?: string;
                error?: string;
              } | null;
              setText(textoReemision(data, response.ok));
            })
            .catch(() => setText("No se pudo emitir el enlace."))
            .finally(() => setBusy(false));
        }}
      >
        Enlace
      </button>
      {text ? <small>{text}</small> : null}
    </div>
  );
}
