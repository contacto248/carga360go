"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventoTimeline, FilaAcreditacion, PanelAcreditacion } from "@/lib/bassam/types";
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

function Vacio() {
  return (
    <>
      <p>Sin datos</p>
      <p className={styles.meta}>0 registrados</p>
    </>
  );
}

function Lista({ titulo, conteo, filas, busy, onAct }: { titulo: string; conteo: string; filas: FilaAcreditacion[]; busy: boolean; onAct: (id: string, action: (typeof ACTIONS)[number]["action"]) => void }) {
  return (
    <section className={styles.card}>
      <h2>{titulo}</h2>
      <p className={styles.meta}>{conteo}</p>
      {filas.length === 0 ? (
        <Vacio />
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

function Comentarios({ filas }: { filas: FilaAcreditacion[] }) {
  const comentarios = filas.filter((fila) => fila.comentarioIa !== "sin datos");
  return (
    <section className={styles.card}>
      <h2>Comentarios</h2>
      <p className={styles.meta}>{comentarios.length === 0 ? "0 registrados" : String(comentarios.length)}</p>
      {comentarios.length === 0 ? (
        <Vacio />
      ) : (
        comentarios.map((fila) => (
          <article className={styles.trip} key={fila.id}>
            <p>
              {fila.fecha} · {fila.tipoCliente} · {fila.tipo}
            </p>
            <p>{fila.comentarioIa}</p>
          </article>
        ))
      )}
    </section>
  );
}

function Timeline({ eventos }: { eventos: PanelAcreditacion["timeline"] }) {
  const filas: EventoTimeline[] = eventos === "sin datos" ? [] : eventos;
  return (
    <section className={styles.card}>
      <h2>Línea de tiempo</h2>
      <p className={styles.meta}>{filas.length === 0 ? "0 registrados" : String(filas.length)}</p>
      {filas.length === 0 ? (
        <Vacio />
      ) : (
        filas.map((event) => (
          <article className={styles.trip} key={event.id}>
            <p>
              {event.fecha} · {event.origen} · {event.accion}
            </p>
            <p>{event.comentario}</p>
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
  const documentos = panel.transportistas.filas.length + panel.mandantes.filas.length;

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
      <div className={styles.grid}>
        <Lista titulo="Transportistas" conteo={panel.transportistas.conteo} filas={panel.transportistas.filas} busy={busy} onAct={act} />
        <Lista titulo="Mandantes pagadores" conteo={panel.mandantes.conteo} filas={panel.mandantes.filas} busy={busy} onAct={act} />
        <Comentarios filas={[...panel.transportistas.filas, ...panel.mandantes.filas]} />
        <Timeline eventos={panel.timeline} />
      </div>
      <footer className={styles.footer}>{documentos === 0 ? "Sin datos. 0 registrados." : `Total: ${documentos} documentos registrados.`}</footer>
      {error ? <p className={styles.error}>{error}</p> : null}
    </>
  );
}
