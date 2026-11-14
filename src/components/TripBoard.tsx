"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type EventRow = { id: string; status: string; label: string; note: string | null; createdAt: string; authorLabel: string };
type NextStep = { status: string; label: string };
export type TripData = {
  status: string;
  label: string;
  next: NextStep[];
  canUpdate: boolean;
  canRate: boolean;
  myRating: { stars: number; comment: string | null } | null;
  average: number | null;
  ratingCount: number;
  events: EventRow[];
};

export function TripBoard({ loadId, initial }: { loadId: string; initial: TripData }) {
  const router = useRouter();
  const [viaje, setViaje] = useState(initial);
  const [note, setNote] = useState("");
  const [stars, setStars] = useState("5");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function send(url: string, body: unknown) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as { viaje?: TripData; error?: string } | null;
      if (!response.ok || !data?.viaje) {
        setError(data?.error || "No se pudo guardar.");
        return;
      }
      setViaje(data.viaje);
      setNote("");
      setComment("");
      router.refresh();
    } catch {
      setError("No hay conexión.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card" id="viaje">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Seguimiento del viaje</h2>
        <span className="pill ok">{viaje.label}</span>
      </div>
      <p className="meta">Estados declarados por los participantes. No corresponde a ubicación GPS.</p>
      {viaje.events.length ? (
        <ol>
          {viaje.events.map((event) => (
            <li key={event.id}>
              <strong>{event.label}</strong>
              <span className="meta"> · {event.authorLabel}</span>
              <span className="meta"> · {new Date(event.createdAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</span>
              {event.note ? <div>{event.note}</div> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p>La carga está adjudicada. El primer movimiento es marcar que van en camino al retiro.</p>
      )}
      {viaje.canUpdate ? (
        <div>
          <label className="f">
            Nota de este paso
            <textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="row">
            {viaje.next.map((step) => (
              <button key={step.status} className="btn sec sm" type="button" disabled={pending} onClick={() => send(`/api/cargas/${loadId}/viaje`, { status: step.status, note })}>
                {step.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <h3>Calificación</h3>
      {viaje.ratingCount > 0 ? (
        <p>
          Promedio {viaje.average} de 5 · {viaje.ratingCount} {viaje.ratingCount === 1 ? "calificación" : "calificaciones"}
        </p>
      ) : (
        <p className="meta">Se habilita cuando el viaje queda entregado. Cada parte califica una vez.</p>
      )}
      {viaje.myRating ? <p>Tu nota: {viaje.myRating.stars} de 5.</p> : null}
      {viaje.canRate ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(`/api/cargas/${loadId}/calificacion`, { stars: Number(stars), comment });
          }}
        >
          <label className="f">
            Nota
            <select value={stars} onChange={(event) => setStars(event.target.value)}>
              <option value="5">5</option>
              <option value="4">4</option>
              <option value="3">3</option>
              <option value="2">2</option>
              <option value="1">1</option>
            </select>
          </label>
          <label className="f">
            Comentario
            <textarea rows={2} maxLength={500} value={comment} onChange={(event) => setComment(event.target.value)} />
          </label>
          <button className="btn sm" type="submit" disabled={pending}>
            Enviar calificación
          </button>
        </form>
      ) : null}
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
