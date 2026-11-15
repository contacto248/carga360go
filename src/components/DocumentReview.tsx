"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PendingDocument } from "@/lib/bassam/types";
import styles from "./bassam-panel.module.css";

const ACTIONS = [
  { action: "aprobar", label: "Aprobar" },
  { action: "rechazar", label: "Rechazar" },
  { action: "pedir_renovacion", label: "Pedir renovación" },
] as const;

export function DocumentReview({ docs }: { docs: PendingDocument[] }) {
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
    <section className={styles.card}>
      <h2>Documentos pendientes</h2>
      {docs.length === 0 ? (
        <p>sin datos</p>
      ) : (
        docs.map((doc) => (
          <article className={styles.trip} key={doc.id}>
            <h3>
              {doc.tipo} · {doc.transportistaNombre}
            </h3>
            <p className={styles.meta}>
              {doc.comentarioIa?.trim() || "sin datos"}
              {doc.vencimiento ? ` · vence ${doc.vencimiento}` : ""}
            </p>
            <div className={styles.actions}>
              {ACTIONS.map((item) => (
                <button key={item.action} type="button" className={item.action === "aprobar" ? styles.approve : styles.secondary} disabled={busy} onClick={() => act(doc.id, item.action)}>
                  {item.label}
                </button>
              ))}
            </div>
          </article>
        ))
      )}
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
