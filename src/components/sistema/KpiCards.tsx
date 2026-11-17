import React from "react";

export type KpiItem = {
  id: string;
  label: string;
  value: string;
  hint?: string;
};

export function KpiCards({ items }: { items: KpiItem[] }) {
  return (
    <section className="ds-kpis" aria-label="Indicadores">
      {items.length === 0 ? (
        <p className="ds-empty">Sin datos</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id} className="ds-kpi">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              {item.hint ? <small>{item.hint}</small> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
