import React from "react";
import { equipmentById } from "@/lib/catalog";
import { listLoadSuggestions } from "@/lib/automations/suggest";
import { SIN_DATOS } from "@/lib/gestion/types";

/** Sugerencias persistidas de una carga. Sin teléfono del transportista y sin tarifa. */
export function LoadSuggestions({ loadId }: { loadId: string }) {
  const rows = listLoadSuggestions(loadId);
  return (
    <section className="card" aria-labelledby="sug-h" style={{ marginTop: 16 }}>
      <h2 id="sug-h">Sugerencias automáticas</h2>
      <p className="meta">Camiones compatibles y oportunidades de retorno. Tarifa: {SIN_DATOS}.</p>
      {rows.length === 0 ? (
        <p>{SIN_DATOS}</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              {row.kind === "retorno" ? "Retorno" : "Compatible"}: {row.origin} → {row.destination}, {equipmentById(row.equipment).label}, {row.tonnage} t,
              puntaje {row.score}.
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

