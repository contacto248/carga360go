import React from "react";
import Link from "next/link";
import { DestinoOff } from "./DestinoOff";
import { Transparencia } from "./Transparencia";

const PREGUNTAS = [
  {
    q: "¿Qué necesito para empezar?",
    a: "Crear tu cuenta, confirmar correo y teléfono, y subir tus documentos. Un administrador revisa y activa tu cuenta.",
  },
  {
    q: "¿Carga360go me asegura carga?",
    a: "No. Carga360go te muestra las cargas que calzan y te avisa por correo. Elegir, ofertar y hacer el viaje depende de ti y del mandante.",
  },
  {
    q: "¿Quién fija el valor del viaje?",
    a: "Tú ofertas tu valor. El costo de referencia desglosado te sirve de apoyo.",
  },
];

export function TransportistasVista({ pagosLegales = false }: { pagosLegales?: boolean }) {
  return (
    <div className="wrap ds-page">
      <header className="page-title">
        <h1>Carga360go: más viajes que calzan con tu camión, y tu buen trabajo a la vista.</h1>
        <p className="lead">
          Publica tu camión o tu retorno, recibe cargas que calzan con tu equipo y tu ruta, y construye un historial que
          te abre más oportunidades.
        </p>
        <div className="cta">
          <Link className="btn" href="/camiones/nuevo">
            Publica tu camión o tu retorno
          </Link>
          <DestinoOff>Completa tu ficha de equipo</DestinoOff>
        </div>
      </header>
      <Transparencia pagosLegales={pagosLegales} />
      <section className="card" aria-labelledby="tx-para-ti">
        <h2 id="tx-para-ti">Lo que hay para ti</h2>
        <ul>
          <li>
            <strong>Seguimiento GPS.</strong> Los hitos de tu operación quedan registrados con fecha y hora.
          </li>
          <li>
            <strong>ETA, la hora estimada de llegada.</strong> La hora de llegada la coordinas directo con el mandante
            que te adjudicó.
          </li>
          <li>
            <strong>Contratos y tarifas:</strong> condiciones claras antes de partir, con acuerdos por ruta y zona y
            niveles de servicio por escrito.
          </li>
          <li>
            <strong>Desempeño del transportista:</strong> tu cumplimiento queda registrado, y un buen historial te ayuda
            a ser elegido.
          </li>
          <li>
            <strong>Asignación automática:</strong> con tu ficha de equipo completa y un buen desempeño, Carga360go te
            puede proponer para cargas que calzan, incluidos los retornos.
          </li>
        </ul>
      </section>
      <section className="card" aria-labelledby="tx-como">
        <h2 id="tx-como">Cómo funciona</h2>
        <ol>
          <li>Inscríbete y completa la ficha de tu camión.</li>
          <li>Publica tu disponibilidad o tu retorno.</li>
          <li>Recibe propuestas de carga que calzan contigo.</li>
          <li>Haz el viaje y coordina el cierre directo con el mandante.</li>
        </ol>
      </section>
      <section className="card" aria-labelledby="tx-hoy">
        <h2 id="tx-hoy">Lo que ya tienes en Carga360go</h2>
        <ul>
          <li>
            <strong>Retornos que calzan.</strong> Publica tu viaje de vuelta. El calce cruza origen, destino, fechas,
            equipo y capacidad, y te avisa por correo. Es una recomendación: no siempre habrá carga en cada fecha.
          </li>
          <li>
            <strong>Tú pones el valor.</strong> Ves un costo de referencia desglosado (ruta, peajes según ejes, diésel y
            operación) para ofertar con fundamento. Carga360go no impone el precio.
          </li>
          <li>
            <strong>Tu contacto, protegido.</strong> El mandante ve tu contacto solo si te adjudica.
          </li>
          <li>
            <strong>Documentos al día.</strong> Subes cédula, licencia profesional, padrón, revisión técnica, SOAP y
            permiso de circulación. El semáforo te avisa antes del vencimiento.
          </li>
          <li>
            <strong>Corredor minero.</strong> Calama, Antofagasta y Copiapó, con ficha técnica para cama baja y
            maquinaria. Y publicación abierta de Arica a Punta Arenas.
          </li>
        </ul>
      </section>
      <section className="card" aria-labelledby="tx-faq">
        <h2 id="tx-faq">Preguntas frecuentes</h2>
        <div className="faq">
          {PREGUNTAS.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="card" aria-labelledby="tx-cierre">
        <h2 id="tx-cierre">No vuelvas vacío. Publica tu retorno hoy.</h2>
        <div className="cta">
          <Link className="btn" href="/camiones/nuevo">
            Publica tu camión o tu retorno
          </Link>
          <Link className="btn sec" href="/cargas">
            Ver cargas vigentes
          </Link>
        </div>
      </section>
    </div>
  );
}
