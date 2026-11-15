"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FilaAcreditacion, PanelAcreditacion } from "@/lib/bassam/types";
import styles from "./bassam-panel.module.css";

const ACTIONS = [
  { action: "aprobar", label: "Aprobar" },
  { action: "rechazar", label: "Rechazar" },
  { action: "pedir_renovacion", label: "Pedir renovación" },
] as const;

const ESTADO: Record<FilaAcreditacion["estado"], string> = {
  pendiente: "pendiente",
  aprobado: "aprobado",
  rechazado: "rechazado",
  renovacion: "renovación",
};

function Lista({ titulo, conteo, filas, busy, onAct }: { titulo: string; conteo: string; filas: FilaAcreditacion[]; busy: boolean; onAct: (id: string, action: (typeof ACTIONS)[number]["action"]) => void }) {
  return (
    <section className={styles.card}>
      <h2>{titulo}</h2>
      <p className={styles.meta}>{conteo}</p>
      {filas.length === 0 ? (
        <p>sin datos</p>
      ) : (
        filas.map((doc) => (
          <article className={styles.trip} key={doc.id}>
            <h3>
              {doc.tipoCliente} · {doc.tipo}
            </h3>
            <p>Fecha: {doc.fecha}</p>
            <p>RUT: {doc.rut}</p>
            <p>Vencimiento: {doc.vencimiento}</p>
            <p>{doc.comentarioIa}</p>
            <p>Estado: {ESTADO[doc.estado]}</p>
            {doc.estadoAdmin === "pendiente_ok" ? (
              <div className={styles.actions}>
                {ACTIONS.map((item) => (
                  <button key={item.action} type="button" className={item.action === "aprobar" ? styles.approve : styles.secondary} disabled={busy} onClick={() => onAct(doc.id, item.action)}>
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))
      )}
    </section>
  );
}

export function DocumentReview({ panel }: { panel: PanelAcreditacion }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(id: string, action: (typeof ACTIONS)[number]["action"]) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/bassam/documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) setError(data?.error || "No se pudo registrar.");
      else router.refresh();
    } catch {
      setError("No hay conexión.");
    }
    setBusy(false);
  }

  return (
    <>
      <p className={styles.meta}>{panel.kyc}</p>
      <Lista titulo="Transportistas" conteo={panel.transportistas.conteo} filas={panel.transportistas.filas} busy={busy} onAct={act} />
      <Lista titulo="Mandantes" conteo={panel.mandantes.conteo} filas={panel.mandantes.filas} busy={busy} onAct={act} />
      <section className={styles.card}>
        <h2>Timeline</h2>
        {panel.timeline === "sin datos" ? (
          <p>sin datos</p>
        ) : (
          panel.timeline.map((event) => (
            <article className={styles.trip} key={event.id}>
              <p>
                {event.fecha} · {event.origen} · {event.accion}
              </p>
              <p>{event.comentario}</p>
            </article>
          ))
        )}
      </section>
      {error ? <p className={styles.error}>{error}</p> : null}
    </>
  );
}
