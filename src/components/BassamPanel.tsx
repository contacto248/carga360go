"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthAction, BassamSnapshot } from "@/lib/bassam/types";

const ACTIONS: { action: AuthAction; label: string }[] = [
  { action: "autorizar", label: "Autorizar" },
  { action: "rechazar", label: "Rechazar" },
  { action: "solicitar_revision", label: "Solicitar revisión" },
];

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });
}

export function BassamPanel({ initial }: { initial: BassamSnapshot }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(loadId: string, action: AuthAction) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/bassam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loadId, action }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) setError(data?.error || "No se pudo registrar la autorización.");
      else router.refresh();
    } catch {
      setError("No hay conexión.");
    }
    setBusy(false);
  }

  return (
    <>
      <div className="grid c2" style={{ margin: "12px 0" }}>
        {(
          [
            ["Viajes adjudicados", initial.conteos.viajes],
            ["Eventos de viaje", initial.conteos.eventos],
            ["Puntos GPS", initial.conteos.gps],
            ["Autorizaciones", initial.conteos.autorizaciones],
          ] as const
        ).map(([label, value]) => (
          <div className="card" key={label}>
            <p className="meta">{label}</p>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h2>GPS</h2>
        <p>
          <span className="pill warn">{initial.gpsClasificacion}</span>
        </p>
        <p className="meta">La API guarda latitud, longitud y hora solo de un viaje autorizado. No hay dispositivo en terreno, así que no está operativa y no se muestran posiciones inventadas.</p>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h2>Torre de control</h2>
        {initial.torre.length === 0 ? (
          <p>sin datos</p>
        ) : (
          initial.torre.map((viaje) => (
            <article key={viaje.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
              <h3>
                {viaje.origin} → {viaje.destination}
              </h3>
              <p className="meta">
                {viaje.tripLabel} · autorización {viaje.autorizacion}
              </p>
              {viaje.historial.length === 0 ? (
                <p>sin datos</p>
              ) : (
                <ul>
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
                <ul>
                  {viaje.gps.map((point) => (
                    <li key={`${viaje.id}-${point.recordedAt}`}>
                      {point.lat}, {point.lng} · {fmt(point.recordedAt)}
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {ACTIONS.map((item) => (
                  <button key={item.action} className="btn sm sec" type="button" disabled={busy} onClick={() => act(viaje.id, item.action)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </article>
          ))
        )}
        {error ? <p className="chat-error">{error}</p> : null}
      </div>

      <div className="card">
        <h2>Informe</h2>
        {initial.informe.texto === "sin datos" ? (
          <p>sin datos</p>
        ) : (
          <table className="tbl">
            <caption>Viajes adjudicados leídos de la base</caption>
            <thead>
              <tr>
                <th>Ruta</th>
                <th>Estado</th>
                <th>Eventos</th>
                <th>GPS</th>
                <th>Autorización</th>
              </tr>
            </thead>
            <tbody>
              {initial.informe.viajes.map((viaje) => (
                <tr key={viaje.id}>
                  <td>
                    {viaje.origin} → {viaje.destination}
                  </td>
                  <td>{viaje.tripLabel}</td>
                  <td>{viaje.historial.length ? viaje.historial.length : "sin datos"}</td>
                  <td>{viaje.gps.length ? viaje.gps.length : "sin datos"}</td>
                  <td>{viaje.autorizacion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
