"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BassamSnapshot, QualityView, Severity } from "@/lib/bassam/types";
import styles from "./bassam-panel.module.css";

const SEVERITY: Record<Severity, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  muy_alta: "Muy alta",
};

const DECISION: Record<QualityView["decision"], string> = {
  resuelto: "Resuelto",
  solicitar_revision: "Solicitar revisión",
  sin_datos: "sin datos",
  pendiente_gerente: "Pendiente de gerencia",
  aprobado: "Aprobado",
};

const ACTOR: Record<QualityView["actor"], string> = {
  agente_calidad: "Agente de calidad",
  gerente: "Gerencia",
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });
}

export function BassamPanel({ initial }: { initial: BassamSnapshot }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function aprobar(loadId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/bassam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loadId, action: "aprobado" }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) setError(data?.error || "No se pudo registrar la aprobación.");
      else router.refresh();
    } catch {
      setError("No hay conexión.");
    }
    setBusy(false);
  }

  return (
    <>
      <div className={styles.metrics}>
        {(
          [
            ["Viajes adjudicados", initial.conteos.viajes],
            ["Eventos de viaje", initial.conteos.eventos],
            ["Puntos GPS", initial.conteos.gps],
            ["Autorizaciones", initial.conteos.autorizaciones],
            ["Revisiones", initial.conteos.revisiones],
          ] as const
        ).map(([label, value]) => (
          <div className={styles.card} key={label}>
            <p className={styles.label}>{label}</p>
            <strong className={styles.value}>{value}</strong>
          </div>
        ))}
      </div>

      <section className={styles.card}>
        <h2>GPS</h2>
        <p>
          <span className={styles.pill}>{initial.gpsClasificacion}</span>
        </p>
        <p className={styles.meta}>La API guarda latitud, longitud y hora solo de un viaje autorizado. No hay dispositivo en terreno, así que no está operativa y no se muestran posiciones inventadas.</p>
      </section>

      <section className={styles.card}>
        <h2>Torre de control</h2>
        <p className={styles.meta}>Gerencia solo revisa. El agente de calidad resuelve lo rutinario con reglas fijas, sin otro proveedor de IA.</p>
        {initial.torre.length === 0 ? (
          <p>sin datos</p>
        ) : (
          initial.torre.map((viaje) => (
            <article className={styles.trip} key={viaje.id}>
              <h3>
                {viaje.origin} → {viaje.destination}
              </h3>
              <p className={styles.meta}>
                {viaje.tripLabel} · autorización {viaje.autorizacion} · severidad {viaje.severidad === "sin datos" ? "sin datos" : SEVERITY[viaje.severidad]} · regla {viaje.regla}
              </p>
              {viaje.historial.length === 0 ? (
                <p>sin datos</p>
              ) : (
                <ul className={styles.list}>
                  {viaje.historial.map((event) => (
                    <li key={`${viaje.id}-${event.at}-${event.status}`}>
                      {event.label} · {event.authorLabel} · {fmt(event.at)}
                    </li>
                  ))}
                </ul>
              )}
              {viaje.gps.length === 0 ? (
                <p>GPS: sin datos</p>
              ) : (
                <ul className={styles.list}>
                  {viaje.gps.map((point) => (
                    <li key={`${viaje.id}-${point.recordedAt}`}>
                      {point.lat}, {point.lng} · {fmt(point.recordedAt)}
                    </li>
                  ))}
                </ul>
              )}
              {viaje.necesitaGerente ? (
                <button className={styles.approve} type="button" disabled={busy} onClick={() => aprobar(viaje.id)}>
                  Aprobado
                </button>
              ) : (
                <p className={styles.auto}>Lo resolvió el agente de calidad. No requiere aprobación de gerencia.</p>
              )}
            </article>
          ))
        )}
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>

      <section className={styles.card}>
        <h2>Historial del agente de calidad</h2>
        {initial.calidad === "sin datos" ? (
          <p>sin datos</p>
        ) : (
          <div className={styles.history}>
            {initial.calidad.map((item) => (
              <article key={item.id}>
                <b>{item.route}</b>
                <p className={styles.meta}>
                  {fmt(item.at)} · {ACTOR[item.actor]} · {DECISION[item.decision]} · regla {item.ruleId} · severidad {SEVERITY[item.severity]}
                </p>
                <p>{item.result}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h2>Informe</h2>
        {initial.informe.texto === "sin datos" ? (
          <p>sin datos</p>
        ) : (
          <div className={styles.history}>
            {initial.informe.viajes.map((viaje) => (
              <article key={viaje.id}>
                <b>
                  {viaje.origin} → {viaje.destination}
                </b>
                <p className={styles.meta}>
                  {viaje.tripLabel} · eventos {viaje.historial.length ? viaje.historial.length : "sin datos"} · GPS {viaje.gps.length ? viaje.gps.length : "sin datos"} · {viaje.autorizacion}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
