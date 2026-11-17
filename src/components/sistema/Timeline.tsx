import React from "react";

export type TimelineEvent = { id: string; label: string; when?: string };

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <section className="ds-timeline" aria-label="Línea de tiempo">
      {events.length === 0 ? (
        <p className="ds-empty">Sin datos</p>
      ) : (
        <ol>
          {events.map((event) => (
            <li key={event.id}>
              {event.when ? <time>{event.when}</time> : null}
              <span>{event.label}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
