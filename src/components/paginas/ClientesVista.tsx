import React from "react";
import Link from "next/link";
import { DestinoOff } from "./DestinoOff";
import { Transparencia } from "./Transparencia";

const MODULOS = [
  {
    titulo: "Seguimiento GPS",
    texto: "Los hitos de tu operación quedan registrados con fecha y hora.",
  },
  {
    titulo: "ETA, la hora estimada de llegada",
    texto: "La hora de llegada la coordinas con el transportista adjudicado.",
  },
  {
    titulo: "Contratos y tarifas",
    texto: "Tus acuerdos por ruta y zona, con niveles de servicio claros, quedan registrados en un solo lugar.",
  },
  {
    titulo: "Desempeño del transportista",
    texto: "Eliges con información, porque cada transportista tiene un historial de cumplimiento.",
  },
  {
    titulo: "Asignación automática",
    texto: "Carga360go te propone el transportista más adecuado según costo de referencia, desempeño y disponibilidad, y tu equipo lo confirma.",
  },
] as const;

const PASOS = [
  "Publica tu carga con origen, destino, fechas y tipo de equipo.",
  "Recibe ofertas de transportistas acreditados y elige.",
  "Adjudica y coordina el viaje directo con el transportista.",
  "El historial de la operación queda en tu panel.",
] as const;

const HOY = [
  {
    titulo: "Calce útil, no un listado genérico.",
    texto: "Carga360go cruza equipo, capacidad, ruta y fechas. Si mueves maquinaria, la ficha de cama baja pide ejes, ancho y medidas.",
  },
  {
    titulo: "Costo de referencia desglosado.",
    texto: "Ruta, peajes según ejes, diésel publicado por la CNE y costos de operación, con su fuente. El valor final lo cierras con el transportista.",
  },
  {
    titulo: "Cuentas revisadas y contacto protegido.",
    texto: "Un administrador acredita a los transportistas. El contacto se abre solo cuando adjudicas.",
  },
  {
    titulo: "Alertas por correo.",
    texto: "Si hoy no hay un camión que calce, guarda una alerta y te avisamos.",
  },
  {
    titulo: "Norte minero y todo Chile.",
    texto: "Foco en Calama, Antofagasta y Copiapó, con publicación abierta de Arica a Punta Arenas.",
  },
] as const;

function Acciones({ cierre = false }: { cierre?: boolean }) {
  return (
    <div className="page-actions">
      <Link className="btn" href="/cargas/nueva">
        Publica tu carga
      </Link>
      <DestinoOff>Quiero una demostración</DestinoOff>
      {cierre ? null : (
        <Link className="btn sec" href="/herramientas/calculadora">
          Abrir el cotizador (sin registro)
        </Link>
      )}
    </div>
  );
}

/** Textos de Clientes, con la alternativa segura donde la función aún no está activa. */
export function ClientesVista({ pagosLegales }: { pagosLegales: boolean }) {
  return (
    <div className="wrap ds-kit">
      <header className="page-title">
        <h1>Carga360go: tu flete organizado, de la contratación a la entrega.</h1>
        <p className="lead">
          Publica tu carga, encuentra el transportista que calza con tu ruta y tu equipo, y ordena ofertas y adjudicación en un solo lugar.
        </p>
        <Acciones />
      </header>
      <Transparencia pagosLegales={pagosLegales} />

      <section aria-labelledby="clientes-modulos">
        <h2 id="clientes-modulos">Lo que hay para ti</h2>
        <ul className="module-list">
          {MODULOS.map((item) => (
            <li key={item.titulo} data-estado="">
              <h3>{item.titulo}</h3>
              <p>{item.texto}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="clientes-pasos">
        <h2 id="clientes-pasos">Cómo funciona</h2>
        <ol className="steps-rail">
          {PASOS.map((paso) => (
            <li key={paso}>
              <p>{paso}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="clientes-hoy">
        <h2 id="clientes-hoy">Lo que ya tienes en Carga360go</h2>
        <ul className="plain-list">
          {HOY.map((item) => (
            <li key={item.titulo}>
              <h3>{item.titulo}</h3>
              <p>{item.texto}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="clientes-atencion">
        <h2 id="clientes-atencion">Te acompañamos en cada paso</h2>
        <p>
          BASSAM 360 te ayuda por <Link href="/agente-360go">chat</Link> a cotizar y publicar. Reclamos, condiciones comerciales y casos especiales los ve siempre una persona del equipo de Carga360go.
        </p>
      </section>

      <section aria-labelledby="clientes-faq">
        <h2 id="clientes-faq">Preguntas frecuentes</h2>
        <div className="faq">
          <details className="card">
            <summary>¿Carga360go transporta mi carga?</summary>
            <p>No. Te conecta con transportistas acreditados. El transporte y el acuerdo quedan entre tú y el transportista.</p>
          </details>
          <details className="card">
            <summary>¿Cuánto cuesta usar Carga360go?</summary>
            <p>Para conocer las condiciones comerciales, escríbenos y te contacta una persona del equipo.</p>
          </details>
          <details className="card">
            <summary>¿Puedo pedir equipos especiales, como cama baja?</summary>
            <p>Sí. Indica el equipo al publicar y la ficha técnica ayuda a encontrar el calce. El calce no reemplaza permisos especiales ni escoltas.</p>
          </details>
          <details className="card">
            <summary>¿Qué significa «verificado»?</summary>
            <p>
              Que un administrador revisó la cuenta y sus documentos vigentes. No es un sello de solvencia. Más detalle en{" "}
              <Link href="/como-verificamos">/como-verificamos</Link>.
            </p>
          </details>
        </div>
      </section>

      <section aria-labelledby="clientes-cierre">
        <h2 id="clientes-cierre">Publica tu carga y encuentra el camión que calza.</h2>
        <Acciones cierre />
      </section>
    </div>
  );
}
