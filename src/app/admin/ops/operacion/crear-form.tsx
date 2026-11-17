"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** El servidor vuelve a validar. Esta pantalla no asigna el identificador ni acepta un estado. */
export function CrearOperacion() {
  const router = useRouter();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const pesoRaw = String(data.get("pesoKg") ?? "").trim().replace(",", ".");
        const pesoKg = Number(pesoRaw);
        const body = {
          cliente: String(data.get("cliente") ?? ""),
          origen: String(data.get("origen") ?? ""),
          destino: String(data.get("destino") ?? ""),
          tipoCarga: String(data.get("tipoCarga") ?? ""),
          pesoKg: Number.isFinite(pesoKg) ? pesoKg : pesoRaw,
          idempotencyKey: key,
        };
        setBusy(true);
        setMsg(null);
        void fetch("/api/ops/operaciones", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(body),
        })
          .then(async (response) => {
            const payload = (await response.json().catch(() => ({}))) as { error?: string; operacion?: { id?: string }; replayed?: boolean };
            if (!response.ok) throw new Error(payload.error ?? "No se pudo crear la operación.");
            const id = payload.operacion?.id ?? "";
            setMsg(payload.replayed ? `Esa clave ya tenía la operación ${id}.` : `Operación ${id} creada.`);
            setKey(crypto.randomUUID());
            form.reset();
            router.refresh();
          })
          .catch((error: unknown) => setMsg(error instanceof Error ? error.message : "No se pudo crear la operación."))
          .finally(() => setBusy(false));
      }}
    >
      <label>
        Cliente
        <input name="cliente" maxLength={160} required />
      </label>
      <label>
        Origen
        <input name="origen" maxLength={120} required />
      </label>
      <label>
        Destino
        <input name="destino" maxLength={120} required />
      </label>
      <label>
        Tipo de carga
        <input name="tipoCarga" maxLength={80} required />
      </label>
      <label>
        Peso (kg)
        <input name="pesoKg" inputMode="decimal" required />
      </label>
      <p className="meta">Clave de idempotencia: {key}</p>
      <button className="btn" disabled={busy} type="submit">
        Crear operación
      </button>
      <button
        className="btn sm"
        disabled={busy}
        type="button"
        onClick={() => {
          setKey(crypto.randomUUID());
          setMsg(null);
        }}
      >
        Otra clave
      </button>
      {msg ? <p>{msg}</p> : null}
    </form>
  );
}
