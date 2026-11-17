import React from "react";

export type AlertTone = "ok" | "warn" | "bad";

export type AlertItem = {
  id: string;
  title: string;
  detail?: string;
  tone?: AlertTone;
};

export function AlertCenter({ alerts }: { alerts: AlertItem[] }) {
  return (
    <section className="ds-alerts" aria-label="Centro de alertas">
      {alerts.length === 0 ? (
        <p className="ds-empty">Sin datos</p>
      ) : (
        <ul>
          {alerts.map((alert) => (
            <li key={alert.id} className={alert.tone ? `tone-${alert.tone}` : undefined}>
              <strong>{alert.title}</strong>
              {alert.detail ? <span>{alert.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
