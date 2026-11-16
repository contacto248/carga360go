"use client";

import { useEffect, useState } from "react";

/** Datos ficticios para la demo visual. Nunca representan operaciones reales. */
const DEMO_EVENTS = [
  { t: "08:12", label: "Carga publicada", detail: "DEMO-SEG-A1B2 · Antofagasta → Calama" },
  { t: "08:14", label: "Costo referencial calculado", detail: "Ruta · peajes por ejes · diésel · operación" },
  { t: "08:21", label: "Carga360 Match", detail: "3 calces técnicos posibles (demo)" },
  { t: "09:05", label: "Oferta recibida", detail: "Equipo compatible · contacto aún oculto" },
  { t: "10:40", label: "Adjudicación", detail: "Contacto compartido solo entre las partes" },
  { t: "14:18", label: "Viaje en curso", detail: "Evento de seguimiento (demo)" },
  { t: "18:02", label: "Comprobante digital", detail: "Historial cerrado en la plataforma" },
] as const;

type Props = { compact?: boolean };

export function TraceAutomationDemo({ compact = false }: Props) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setStep((current) => (current + 1) % DEMO_EVENTS.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [paused]);

  const visible = compact ? DEMO_EVENTS.slice(0, 4) : DEMO_EVENTS;

  return (
    <div className={`tech-demo${compact ? " is-compact" : ""}`} aria-label="Demostración de trazabilidad">
      <div className="tech-demo-head">
        <span className="tech-demo-badge">Demostración</span>
        <strong>Línea de tiempo automatizada</strong>
        <p>Datos de ejemplo. No corresponden a cargas, camiones ni usuarios reales.</p>
        <button type="button" className="btn sec sm" onClick={() => setPaused((v) => !v)} aria-pressed={paused}>
          {paused ? "Reanudar demo" : "Pausar demo"}
        </button>
      </div>
      <ol className="tech-timeline">
        {visible.map((event, index) => {
          const active = index === (compact ? step % visible.length : step);
          const done = index < (compact ? step % visible.length : step);
          return (
            <li key={event.label} className={active ? "is-active" : done ? "is-done" : undefined}>
              <span className="tech-time">{event.t}</span>
              <span className="tech-dot" aria-hidden="true" />
              <div>
                <strong>{event.label}</strong>
                <p>{event.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function AutomationBoardDemo() {
  const cards = [
    { title: "Publicar", text: "Origen, destino, equipo y fecha entran al motor." },
    { title: "Calzar", text: "Carga360 Match compara capacidad y ruta." },
    { title: "Seguir", text: "Cada hito queda con fecha y hora." },
    { title: "Comprobar", text: "El historial digital queda en la web." },
  ];
  return (
    <div className="auto-board-demo" aria-label="Demostración de automatización">
      <div className="tech-demo-head">
        <span className="tech-demo-badge">Demostración</span>
        <strong>Flujo automatizado Carga360go</strong>
        <p>Esquema ilustrativo. No muestra actividad real de la bolsa.</p>
      </div>
      <div className="auto-board-grid">
        {cards.map((card, index) => (
          <div key={card.title} className="auto-board-card" style={{ animationDelay: `${index * 0.08}s` }}>
            <span className="auto-board-n">{String(index + 1).padStart(2, "0")}</span>
            <strong>{card.title}</strong>
            <p>{card.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
