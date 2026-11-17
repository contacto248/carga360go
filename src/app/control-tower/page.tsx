import type { Metadata } from "next";
import Link from "next/link";
import { AlertCenter } from "@/components/sistema/AlertCenter";
import { DataTable } from "@/components/sistema/DataTable";
import { KpiCards } from "@/components/sistema/KpiCards";
import { Timeline } from "@/components/sistema/Timeline";
import { DestinoPendiente, Proximamente, Transparencia } from "@/components/rediseno/Piezas";

export const metadata: Metadata = {
  title: { absolute: "Torre de control para tus fletes · Carga360go" },
  description:
    "Publicación, calce, ofertas y adjudicación en un solo panel. Carga360go prepara la torre de control para seguir cada viaje hasta la entrega.",
  alternates: { canonical: "/control-tower" },
};

const HOY = [
  {
    title: "Publicación y calce a la vista.",
    text: "Carga, camión o retorno, con las razones del calce.",
  },
  {
    title: "Ofertas y adjudicación en el mismo lugar.",
    text: "Sin planillas ni hilos sueltos de chat.",
  },
  {
    title: "Historial con fecha y hora.",
    text: "La publicación, las ofertas y la adjudicación quedan registradas.",
  },
];

const PREPARACION = [
  {
    title: "Seguimiento de viajes",
    text: "Los hitos de cada operación quedan registrados con fecha y hora. El seguimiento GPS se anunciará cuando esté activo.",
  },
  {
    title: "ETA, la hora estimada de llegada",
    text: "La hora estimada de llegada llegará junto con el seguimiento GPS.",
  },
  {
    title: "Evidencia de entrega",
    text: "El cierre lo coordinan las partes. El comprobante digital se anunciará cuando esté disponible.",
  },
  {
    title: "Contratos y tarifas",
    text: "Tus acuerdos por ruta y zona, con niveles de servicio claros, en un solo lugar.",
  },
  {
    title: "Desempeño del transportista",
    text: "Historial de cumplimiento para elegir con información.",
  },
  {
    title: "Asignación automática",
    text: "Carga360go te propone el transportista más adecuado según costo de referencia, desempeño y disponibilidad, y tu equipo confirma. Nada se asigna solo.",
  },
];

const FAQ = [
  {
    q: "¿La torre de control ya está disponible?",
    a: "Todavía no. Hoy puedes ordenar la publicación, el calce, las ofertas y la adjudicación en tu panel. Déjanos tu correo y te avisamos.",
  },
  {
    q: "¿Carga360go asigna los viajes por mí?",
    a: "No. Cuando la asignación esté disponible, Carga360go propondrá y una persona de tu equipo confirmará.",
  },
];

export default function ControlTowerPage() {
  return (
    <>
      <section className="hero hero-fold" aria-labelledby="torre-titulo">
        <div className="wrap">
          <div className="titulo-con-estado">
            <h1 id="torre-titulo">Torre de control: tu operación de flete en un solo panel.</h1>
            <Proximamente />
          </div>
          <p className="hero-lead">
            Hoy ya ordenas en Carga360go la publicación, el calce, las ofertas y la adjudicación. La torre de control
            suma el seguimiento de cada viaje hasta la entrega, y está en preparación.
          </p>
          <div className="rediseno-acciones">
            <DestinoPendiente>Avísame cuando esté disponible</DestinoPendiente>
            <Link className="btn sec" href="/cargas/nueva">
              Publicar carga
            </Link>
          </div>
          <Transparencia />
        </div>
      </section>

      <section className="block" aria-labelledby="hoy-titulo">
        <div className="wrap">
          <h2 id="hoy-titulo">Lo que ya puedes ordenar hoy</h2>
          <ul>
            {HOY.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong> {item.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="block alt" aria-labelledby="preparacion-titulo">
        <div className="wrap">
          <div className="titulo-con-estado">
            <h2 id="preparacion-titulo">En preparación</h2>
            <Proximamente />
          </div>
          <ul>
            {PREPARACION.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong> {item.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="block" aria-labelledby="vacio-titulo">
        <div className="wrap ds-kit">
          <h2 id="vacio-titulo">Sin datos de viaje</h2>
          <p className="aviso-vacio">Todavía no hay viajes, alertas ni registros de seguimiento para mostrar.</p>
          <KpiCards items={[]} />
          <DataTable columns={[]} rows={[]} />
          <Timeline events={[]} />
          <AlertCenter alerts={[]} />
        </div>
      </section>

      <section className="block alt" id="faq" aria-labelledby="torre-faq">
        <div className="wrap">
          <h2 id="torre-faq">Preguntas frecuentes</h2>
          <div className="faq">
            {FAQ.map((item) => (
              <details key={item.q} className="card">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="cta-band">
            <h2>Ordena tu flete desde hoy y suma la torre de control cuando esté lista.</h2>
            <div className="cta">
              <DestinoPendiente>Avísame cuando esté disponible</DestinoPendiente>
              <Link className="btn" href="/cargas/nueva">
                Publicar carga
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
