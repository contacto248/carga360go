import React from "react";
import Link from "next/link";
import { DestinoOff } from "./DestinoOff";
import { Transparencia } from "./Transparencia";

const PREGUNTAS = [
  {
    q: "¿Puedo ver hoy mi camión en un mapa?",
    a: "Todavía no. El seguimiento GPS está en preparación. Hoy ves los hitos de tu operación en tu panel.",
  },
  {
    q: "¿Qué hago si necesito saber dónde va mi carga?",
    a: "Coordina con el transportista adjudicado. Si necesitas ayuda, el Agente Carga360go te deriva a una persona del equipo.",
  },
  {
    q: "¿Hay comprobante de entrega digital?",
    a: "Todavía no. Te avisamos cuando esté disponible.",
  },
];

export function TrackingVista({ pagosLegales = false }: { pagosLegales?: boolean }) {
  return (
    <div className="wrap ds-page">
      <header className="page-title">
        <p className="ds-estado">
          <span className="badge-f">Próximamente</span>
        </p>
        <h1>Seguimiento de tus viajes: próximamente en Carga360go.</h1>
        <p className="lead">
          Mientras lo preparamos, cada operación ya registra sus hitos con fecha y hora: publicación, ofertas y
          adjudicación. Te avisamos cuando el seguimiento esté activo.
        </p>
        <div className="cta">
          <DestinoOff>Avísame cuando esté disponible</DestinoOff>
          <Link className="btn sec" href="/agente-360go">
            Escribirle al Agente Carga360go
          </Link>
        </div>
      </header>
      <Transparencia pagosLegales={pagosLegales} />
      <section className="card" aria-labelledby="tracking-hoy">
        <h2 id="tracking-hoy">Trazabilidad de la operación, de la publicación a la adjudicación</h2>
        <p>
          Cada carga registra eventos con fecha y hora, visibles para quienes participan en esa operación. Los estados
          del viaje los declaran las partes; no corresponden a una ubicación GPS.
        </p>
      </section>
      <section className="card" aria-labelledby="tracking-viene">
        <h2 id="tracking-viene">Lo que traerá el seguimiento</h2>
        <ul>
          <li>Para saber dónde va el camión, coordina con el transportista adjudicado o escríbenos.</li>
          <li>La hora de llegada la coordinan las partes.</li>
          <li>El comprobante de entrega lo coordina una persona del equipo de Carga360go.</li>
        </ul>
      </section>
      <section className="card" aria-labelledby="tracking-faq">
        <h2 id="tracking-faq">Preguntas frecuentes</h2>
        <div className="faq">
          {PREGUNTAS.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="card" aria-labelledby="tracking-cierre">
        <h2 id="tracking-cierre">Te avisamos apenas el seguimiento esté activo.</h2>
        <div className="cta">
          <DestinoOff>Avísame cuando esté disponible</DestinoOff>
        </div>
      </section>
    </div>
  );
}
