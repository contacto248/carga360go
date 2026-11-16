"use client";

import { useEffect, useState } from "react";

export type TowerStep = {
  n: string;
  title: string;
  text: string;
};

type Props = {
  steps: readonly TowerStep[];
};

/**
 * Torre de control de la portada: avanza sola por los pasos (demo visual).
 * Respeta prefers-reduced-motion: se queda en el primer paso.
 */
export function HomeTowerBoard({ steps }: Props) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || paused || steps.length === 0) return;
    const id = window.setInterval(() => {
      setActive((current) => (current + 1) % steps.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [paused, steps.length]);

  return (
    <aside className="tower-board tower-board-live" aria-label="Torre de control Carga360go">
      <div className="tower-head">
        <span className="dot-live" /> Torre de control
        <span className="tower-tag">Así funciona</span>
      </div>
      <ol className="tower-steps">
        {steps.map((step, index) => {
          const state = index === active ? "is-active" : index < active ? "is-done" : "";
          return (
            <li key={step.n} className={state || undefined} aria-current={index === active ? "step" : undefined}>
              <span className="tower-n">{step.n}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="tower-trace" aria-hidden="true">
        <span className="tower-trace-rail" />
        <span className="tower-trace-pulse" style={{ ["--tower-i" as string]: String(active) }} />
      </div>
      <button
        type="button"
        className="btn sec sm tower-pause"
        onClick={() => setPaused((value) => !value)}
        aria-pressed={paused}
      >
        {paused ? "Reanudar torre" : "Pausar torre"}
      </button>
    </aside>
  );
}
